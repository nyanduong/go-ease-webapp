import { createRefreshStorage } from '../../platform/refresh-storage';
import type { AccountProfile, ProfileInput } from '@goease/trip-client/account-profile';
import { useSyncExternalStore } from 'react';
import { createAuthPilot, type AuthPilotState } from '@goease/trip-client/auth-pilot-controller';
import { createBrowserGoogleAuth, safeReturnPath } from '@goease/trip-client/browser-google-auth';
import { createAccountTrips } from '@goease/trip-client/account-trip-controller';
import { fetchManagedCatalog } from '@goease/trip-client/catalog-api-controller';
import type { ManagedPlace } from '@goease/contracts';
import { ServerTripError } from '@goease/trip-client/server-trip-controller';
import { readLegacyTrips, browserStorage } from '../../platform/browser-storage';
import { navigate } from '../../app/router';

const project = import.meta.env.VITE_SUPABASE_URL?.match(
  /^https:\/\/([a-z0-9]{20})\.supabase\.co$/,
)?.[1];
const refreshKey = `goease.web.${project ?? 'unconfigured'}.refresh`;
const persistentKey = `goease.web.${project ?? 'unconfigured'}.session`;
const refreshStorage = createRefreshStorage(
  localStorage,
  sessionStorage,
  persistentKey,
  refreshKey,
);
async function sessionLock<T>(work: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw Error('Cần cập nhật trình duyệt để duy trì đăng nhập an toàn.');
  return navigator.locks.request(
    persistentKey + '.lock',
    { signal: AbortSignal.timeout(30000) },
    async () => {
      assertSessionOwner();
      return work();
    },
  );
}
function assertSessionOwner() {
  const owner = refreshStorage.owner();
  if (session.userId && owner !== session.userId) {
    accountSession.cancel();
    throw Error('Tài khoản đã thay đổi ở tab khác.');
  }
}
const listeners = new Set<() => void>();
let session: AuthPilotState = {
  busy: false,
  phase: 'signed-out',
  userId: null,
  message: 'Đăng nhập Google để bắt đầu chuyến đi của bạn.',
};
let profileState: { value: AccountProfile | null; busy: boolean; error: string } = {
  value: null,
  busy: false,
  error: '',
};
const setProfile = (patch: Partial<typeof profileState>) => {
  profileState = { ...profileState, ...patch };
  publish();
};
let catalog: ManagedPlace[] = [],
  lifecycle = 0;
let workspace = { busy: false, error: '' };
const publish = () => listeners.forEach((listener) => listener());
export const accountTrips = createAccountTrips({
  storage: browserStorage,
  newId: () => crypto.randomUUID(),
  request: async (operation) => {
    const owner = session.userId;
    await maintainSession();
    assertSessionOwner();
    if (!owner || owner !== session.userId)
      throw Error('Tài khoản đã thay đổi. Không gửi dữ liệu chuyến trước đó.');
    return auth.serverTrips(operation);
  },
});
const google = createBrowserGoogleAuth({
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  storage: sessionStorage,
  origin: location.origin,
  namespace: `goease.web.${project ?? 'unconfigured'}`,
});
const auth = createAuthPilot({
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  preserveRefreshOnTransient: true,
  requiredProvider: 'google',
  refreshOnUnauthorized: true,
  storage: refreshStorage,
  sessionLock,
  onChange(next) {
    session = next;
    if (next.phase !== 'backend-verified' || !next.userId) {
      profileState = { value: null, busy: false, error: '' };
      catalog = [];
      accountTrips.lock();
    }
    publish();
  },
});
async function connect() {
  if (auth.snapshot().phase === 'provider-verified')
    await auth.verifyBackend(import.meta.env.VITE_API_BASE_URL);
  const current = auth.snapshot(),
    epoch = lifecycle;
  if (!project || !current.userId || current.phase !== 'backend-verified') return;
  workspace = { busy: true, error: '' };
  publish();
  try {
    const response = await fetchManagedCatalog(import.meta.env.VITE_API_BASE_URL ?? '');
    if (
      epoch !== lifecycle ||
      auth.snapshot().userId !== current.userId ||
      auth.snapshot().phase !== 'backend-verified'
    )
      return;
    catalog = response.places;
    await profileRequest();
    if (
      epoch !== lifecycle ||
      auth.snapshot().userId !== current.userId ||
      auth.snapshot().phase !== 'backend-verified'
    )
      return;
    if (await accountTrips.activate(project + '.' + current.userId)) await accountTrips.list();
  } catch {
    session = {
      ...session,
      message: 'Chưa tải được dữ liệu chuyến. Kiểm tra kết nối rồi thử khôi phục phiên.',
    };
    publish();
  } finally {
    if (epoch === lifecycle && auth.snapshot().userId === current.userId) {
      workspace = {
        busy: false,
        error: accountTrips.getSnapshot().ready ? '' : 'Chưa tải được dữ liệu. Vui lòng thử lại.',
      };
      publish();
    }
  }
}
let importing = false;
let maintaining: Promise<void> | null = null,
  nextRefreshAttempt = 0,
  refreshFailures = 0;
async function maintainSession(force = false) {
  if (restoring) return;
  if (maintaining) return maintaining;
  try {
    assertSessionOwner();
  } catch {
    return;
  }
  if (session.busy || importing) return;
  if (!force && Date.now() < nextRefreshAttempt) return;
  if (!navigator.onLine) {
    auth.snapshot();
    return;
  }
  maintaining = (async () => {
    if (auth.needsRefresh()) {
      nextRefreshAttempt = Date.now() + 15000;
      await auth.refreshSession();
      auth.snapshot();
    } else if (auth.snapshot().phase !== 'backend-verified' && refreshStorage.exists()) {
      nextRefreshAttempt = Date.now() + 15000;
      await accountSession.restore();
    }
    if (auth.needsRefresh() || auth.snapshot().phase !== 'backend-verified') {
      refreshFailures++;
      nextRefreshAttempt =
        Date.now() + Math.min(300000, 15000 * 2 ** Math.min(refreshFailures - 1, 5));
    } else {
      refreshFailures = 0;
      nextRefreshAttempt = 0;
    }
  })().finally(() => {
    maintaining = null;
  });
  return maintaining;
}
let restoring: Promise<void> | null = null,
  initialized: Promise<void> | null = null;
async function profileRequest(input?: ProfileInput) {
  if (profileState.busy) return false;
  const owner = session.userId,
    epoch = lifecycle;
  setProfile({ busy: true, error: '' });
  try {
    if (input) await maintainSession(true);
    assertSessionOwner();
    if (owner !== session.userId) return false;
    const value = await auth.userProfile(input);
    if (epoch !== lifecycle || owner !== session.userId || session.phase !== 'backend-verified')
      return false;
    setProfile({ value });
    return true;
  } catch {
    if (epoch === lifecycle && owner === session.userId && session.phase === 'backend-verified')
      setProfile({
        error: input
          ? 'Chưa biết hồ sơ đã lưu xong chưa. Bạn có thể xem lại hồ sơ đã lưu; nội dung đang sửa vẫn được giữ.'
          : 'Chưa tải được hồ sơ. Kiểm tra kết nối rồi thử lại.',
      });
    return false;
  } finally {
    if (epoch === lifecycle && owner === session.userId) setProfile({ busy: false });
  }
}
export const accountSession = {
  resume: () => maintainSession(true),
  loadProfile: () => profileRequest(),
  saveProfile: (input: ProfileInput) => profileRequest(input),
  async importLegacy(signal: AbortSignal) {
    if (importing) throw Error('Đang chuyển dữ liệu cũ.');
    const owner = accountTrips.getSnapshot().owner,
      epoch = lifecycle;
    const check = () => {
      assertSessionOwner();
      const current = accountTrips.getSnapshot();
      if (
        signal.aborted ||
        epoch !== lifecycle ||
        !owner ||
        current.owner !== owner ||
        !current.ready ||
        current.busy ||
        current.draft ||
        current.pending
      )
        throw Error(
          'Đã dừng thêm chuyến. Hãy hoàn tất thay đổi chưa lưu trong Chuyến đi rồi thử lại.',
        );
    };
    check();
    importing = true;
    try {
      const legacy = await readLegacyTrips();
      check();
      if (legacy.issues.length)
        throw Error('Chưa đọc được chuyến đi cũ. Chưa có chuyến nào được thêm vào tài khoản.');
      let copied = 0,
        existing = 0;
      for (const saved of legacy.trips) {
        // Stable per owner/source ID: repeated runs do not create duplicate copies.
        const digest = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(owner + ':' + saved.trip.id),
        );
        check();
        const id =
          'legacy-' +
          [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        try {
          await auth.serverTrips({ kind: 'get', id });
          check();
          existing++;
          continue;
        } catch (error) {
          check();
          if (!(error instanceof ServerTripError) || error.status !== 404) throw error;
        }
        const begun = await accountTrips.begin({ ...saved.trip, id });
        if (
          !begun ||
          signal.aborted ||
          epoch !== lifecycle ||
          accountTrips.getSnapshot().owner !== owner
        )
          throw Error('Chuyến đi chưa được thêm xong. Mở Chuyến đi để tiếp tục lưu.');
        if (!(await accountTrips.save()))
          throw Error('Chưa xác nhận chuyển xong. Mở Chuyến đi và bấm “Thử lưu lại” để hoàn tất.');
        check();
        copied++;
      }
      await accountTrips.list();
      return `Đã thêm ${copied} chuyến. ${existing} chuyến đã có trong tài khoản được giữ nguyên.`;
    } finally {
      importing = false;
    }
  },
  async loginGoogle() {
    if (session.busy) return;
    session = { ...session, busy: true, message: 'Đang mở Google…' };
    publish();
    try {
      location.assign(await google.begin(safeReturnPath(location.pathname)));
    } catch (error) {
      session = {
        ...session,
        busy: false,
        message: error instanceof Error ? error.message : 'Chưa mở được Google.',
      };
      publish();
    }
  },
  initialize() {
    initialized ??= (async () => {
      if (location.pathname !== '/auth/callback') {
        if (!navigator.onLine && refreshStorage.exists()) {
          session = {
            ...session,
            phase: 'unverified',
            busy: false,
            message: 'Đang chờ kết nối để mở lại tài khoản.',
          };
          publish();
          return;
        }
        await accountSession.restore();
        return;
      }
      const callback = location.href,
        epoch = lifecycle;
      history.replaceState(history.state, '', '/login'); // Do not leave code/error data in browser history.
      session = { ...session, busy: true, message: 'Đang xác minh đăng nhập Google…' };
      publish();
      try {
        const result = await google.complete(callback);
        if (epoch !== lifecycle) return;
        await auth.acceptOAuth(result.session);
        await connect();
        if (epoch === lifecycle && auth.snapshot().phase === 'backend-verified')
          navigate(result.returnTo, true);
      } catch (error) {
        auth.cancel();
        session = {
          ...session,
          busy: false,
          message: error instanceof Error ? error.message : 'Chưa xác minh được Google.',
        };
        publish();
      } finally {
        if (auth.snapshot().phase !== 'backend-verified') navigate('/login', true);
      }
    })();
    return initialized;
  },
  restore() {
    restoring ??= (async () => {
      await auth.restore();
      await connect();
      if (location.pathname === '/login' && auth.snapshot().phase === 'backend-verified')
        navigate('/', true);
    })().finally(() => {
      restoring = null;
    });
    return restoring;
  },
  async logout() {
    lifecycle++;
    google.clear();
    await auth.logout();
    navigate('/login', true);
  },
  cancel() {
    lifecycle++;
    auth.cancel();
  },
};
export function useAccount() {
  const state = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => session,
  );
  const trips = useSyncExternalStore(accountTrips.subscribe, accountTrips.getSnapshot);
  const profile = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => profileState,
  );
  const workspaceState = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => workspace,
  );
  return {
    session: state,
    trips,
    catalog,
    profile,
    workspace: workspaceState,
    hasSavedSession: refreshStorage.exists(),
  };
}
export function startAccountLifecycle() {
  let ready = false;
  void accountSession.initialize().finally(() => {
    ready = true;
    void maintainSession().catch(() => {});
  });
  const resume = () => {
    if (ready && document.visibilityState === 'visible') void maintainSession(true).catch(() => {});
  };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  const changed = (event: StorageEvent) => {
    if (event.storageArea !== localStorage || (event.key !== persistentKey && event.key !== null))
      return;
    const owner = refreshStorage.owner();
    if (owner && !session.userId && session.busy) return;
    if (!owner || owner !== session.userId) {
      refreshStorage.clearLegacy();
      accountSession.cancel();
      if (owner && ready && document.visibilityState === 'visible')
        void maintainSession(true).catch(() => {});
    }
  };
  window.addEventListener('storage', changed);
  const timer = setInterval(() => {
    if (ready && document.visibilityState === 'visible') void maintainSession().catch(() => {});
  }, 5000);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('online', resume);
    window.removeEventListener('storage', changed);
    accountSession.cancel();
  };
}
