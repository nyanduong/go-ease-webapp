import { useSyncExternalStore } from 'react';
import { createAuthPilot, type AuthPilotState } from '@goease/trip-client/auth-pilot-controller';
import { createAccountTrips } from '@goease/trip-client/account-trip-controller';
import { fetchManagedCatalog } from '@goease/trip-client/catalog-api-controller';
import type { ManagedPlace } from '@goease/contracts';
import { browserStorage } from '../../platform/browser-storage';

const project = import.meta.env.VITE_SUPABASE_URL?.match(
  /^https:\/\/([a-z0-9]{20})\.supabase\.co$/,
)?.[1];
const refreshKey = `goease.web.${project ?? 'unconfigured'}.refresh`;
const listeners = new Set<() => void>();
let session: AuthPilotState = {
  busy: false,
  phase: 'signed-out',
  userId: null,
  message: 'Đăng nhập để quản lý chuyến tài khoản. Chuyến khách được giữ riêng.',
};
let catalog: ManagedPlace[] = [];
export const accountTrips = createAccountTrips({
  storage: browserStorage,
  newId: () => crypto.randomUUID(),
  request: (operation) => auth.serverTrips(operation),
});
const auth = createAuthPilot({
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  preserveRefreshOnTransient: true,
  // Browser refresh is tab-scoped, never added to durable trip storage or the service worker cache.
  storage: {
    async get() {
      return sessionStorage.getItem(refreshKey);
    },
    async set(value) {
      sessionStorage.setItem(refreshKey, value);
    },
    async remove() {
      sessionStorage.removeItem(refreshKey);
    },
  },
  onChange(next) {
    session = next;
    if (next.phase !== 'backend-verified' || !next.userId) {
      catalog = [];
      accountTrips.lock();
    }
    listeners.forEach((listener) => listener());
  },
});
async function connect() {
  if (auth.snapshot().phase === 'provider-verified')
    await auth.verifyBackend(import.meta.env.VITE_API_BASE_URL);
  const current = auth.snapshot();
  if (!project || !current.userId || current.phase !== 'backend-verified') return;
  try {
    const response = await fetchManagedCatalog(import.meta.env.VITE_API_BASE_URL ?? '');
    if (auth.snapshot().userId !== current.userId || auth.snapshot().phase !== 'backend-verified')
      return;
    catalog = response.places;
  } catch {
    session = {
      ...session,
      message: 'Chưa tải được danh mục máy chủ. Kiểm tra kết nối rồi khôi phục phiên.',
    };
    listeners.forEach((listener) => listener());
    return;
  }
  if (await accountTrips.activate(project + '.' + current.userId)) await accountTrips.list();
}
let restoring: Promise<void> | null = null;
export const accountSession = {
  async login(email: string, password: string) {
    await auth.login(email, password);
    await connect();
  },
  restore() {
    restoring ??= (async () => {
      await auth.restore();
      await connect();
    })().finally(() => {
      restoring = null;
    });
    return restoring;
  },
  logout: () => auth.logout(),
  cancel: () => auth.cancel(),
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
  return { session: state, trips, catalog };
}
export function startAccountLifecycle() {
  const hidden = () => {
    if (document.visibilityState === 'hidden') auth.cancel();
  };
  document.addEventListener('visibilitychange', hidden);
  const timer = setInterval(() => {
    auth.snapshot();
  }, 1000);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', hidden);
    auth.cancel();
  };
}
