import { readAccountProfile, validateProfile, type ProfileInput } from './account-profile.js';
import { authIdentityResponseSchema } from '@goease/contracts';
import { isAccountApiOrigin } from './api-origin.js';
import {
  callDiscoveryApi,
  callDestinationSearchApi,
  type DiscoveryRequest,
} from './discovery-api-controller.js';
import {
  callServerTripApi,
  ServerTripError,
  type ServerTripRequest,
} from './server-trip-controller.js';

export interface RefreshStorage {
  get(): Promise<string | null>;
  set(value: string, userId?: string): Promise<void>;
  remove(): Promise<void>;
}
export interface AuthPilotState {
  busy: boolean;
  phase: 'signed-out' | 'provider-verified' | 'backend-verified' | 'unverified';
  userId: string | null;
  message: string;
}
type Session = { access: string; refresh: string; expires: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class PilotError extends Error {
  constructor(
    message: string,
    readonly transient = false,
    readonly status = 0,
  ) {
    super(message);
  }
}
const fail = (message: string): never => {
  throw new PilotError(message);
};
export function authProject(url: string | undefined, key: string | undefined) {
  if (
    !url ||
    !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url) ||
    !key ||
    !/^sb_publishable_[A-Za-z0-9_-]{16,200}$/.test(key)
  )
    fail('Chưa cấu hình Supabase project/publishable key hợp lệ.');
  return { url: url!, key: key! };
}
export function createAuthPilot(options: {
  url?: string;
  key?: string;
  storage: RefreshStorage;
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  preserveRefreshOnTransient?: boolean;
  requiredProvider?: 'google';
  refreshOnUnauthorized?: boolean;
  sessionLock?: <T>(work: () => Promise<T>) => Promise<T>;
  onChange?: (state: AuthPilotState) => void;
}) {
  let state: AuthPilotState = {
    busy: false,
    phase: 'signed-out',
    userId: null,
    message: 'Chưa có phiên được xác minh.',
  };
  let session: Session | null = null,
    epoch = 0,
    current: AbortController | null = null,
    pending: Promise<void> | null = null;
  let verifiedBackend: string | null = null;
  const now = () => Math.floor((options.now ?? Date.now)() / 1000);
  const publish = (patch: Partial<AuthPilotState>) => {
    state = { ...state, ...patch };
    options.onChange?.({ ...state });
  };
  const erase = async () => {
    try {
      await options.storage.remove();
    } catch {
      fail('Không xóa được credential trên thiết bị. Chưa thể xác nhận đăng xuất cục bộ.');
    }
  };
  async function request(
    url: string,
    init: RequestInit,
    signal: AbortSignal,
    json = true,
  ): Promise<unknown> {
    const controller = new AbortController(),
      ms = options.timeoutMs ?? 10000;
    if (!Number.isInteger(ms) || ms < 100 || ms > 15000) fail('Timeout Auth không hợp lệ.');
    let timer: ReturnType<typeof setTimeout> | undefined, cancel: (() => void) | undefined;
    const stopped = new Promise<never>((_, reject) => {
      cancel = () => {
        controller.abort();
        reject(new PilotError('Đã hủy Auth; không tự thử lại.', true));
      };
      if (signal.aborted) cancel();
      else signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => {
        controller.abort();
        reject(new PilotError('Auth quá thời gian; cần thử lại bằng tay.', true));
      }, ms);
    });
    const work = async () => {
      if (controller.signal.aborted) fail('Đã hủy Auth.');
      const response = await (options.fetcher ?? fetch)(url, {
        ...init,
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new PilotError(
          response.status === 400 || response.status === 401 || response.status === 403
            ? 'Provider/API từ chối phiên hoặc thông tin đăng nhập.'
            : 'Auth chưa đáp ứng; không tự retry hoặc dùng phiên giả.',
          response.status >= 500 || response.status === 429,
          response.status,
        );
      }
      if (!json) {
        void response.body?.cancel().catch(() => {});
        return null;
      }
      // Stream on runtimes that expose it; bounded fallback for React Native fetch.
      let raw = '';
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let bytes = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 65536) fail('Phản hồi Auth quá lớn.');
            raw += decoder.decode(chunk.value, { stream: true });
          }
          raw += decoder.decode();
        } finally {
          void reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      } else {
        raw = await response.text();
        if (raw.length > 65536) fail('Phản hồi Auth quá lớn.');
      }
      try {
        return JSON.parse(raw);
      } catch {
        fail('Auth trả dữ liệu không hợp lệ.');
      }
    };
    try {
      return await Promise.race([stopped, work()]);
    } finally {
      clearTimeout(timer);
      if (cancel) signal.removeEventListener('abort', cancel);
      controller.abort();
    }
  }
  const config = () => authProject(options.url, options.key);
  const headers = (access?: string) => ({
    apikey: config().key,
    accept: 'application/json',
    ...(access ? { authorization: `Bearer ${access}` } : {}),
  });
  function parseSession(data: unknown): Session {
    if (!data || typeof data !== 'object') return fail('Phản hồi phiên không hợp lệ.');
    const value = data as Record<string, unknown>;
    if (
      value.token_type !== 'bearer' ||
      typeof value.access_token !== 'string' ||
      value.access_token.length > 4096 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.access_token) ||
      typeof value.refresh_token !== 'string' ||
      !/^[A-Za-z0-9_.~-]{8,1024}$/.test(value.refresh_token) ||
      typeof value.expires_in !== 'number' ||
      !Number.isInteger(value.expires_in) ||
      value.expires_in < 1 ||
      value.expires_in > 7200 ||
      typeof value.expires_at !== 'number' ||
      !Number.isInteger(value.expires_at) ||
      value.expires_at <= now() ||
      value.expires_at > now() + 7200
    )
      return fail('Phản hồi phiên không hợp lệ.');
    return {
      access: value.access_token,
      refresh: value.refresh_token,
      expires: value.expires_at,
    };
  }
  async function providerUser(next: Session, signal: AbortSignal) {
    const data = await request(
      config().url + '/auth/v1/user',
      { headers: headers(next.access) },
      signal,
    );
    return verifiedUser(data, next);
  }
  function verifiedUser(data: unknown, next: Session) {
    const user = data as Record<string, unknown> | null;
    if (
      !user ||
      typeof user.id !== 'string' ||
      !uuid.test(user.id) ||
      user.aud !== 'authenticated' ||
      user.role !== 'authenticated' ||
      user.is_anonymous === true ||
      next.expires <= now()
    )
      return fail('Provider chưa xác minh được user có phiên hợp lệ.');
    if (options.requiredProvider === 'google') {
      const identities = user.identities;
      if (
        !Array.isArray(identities) ||
        !identities.some((identity) => identity && identity.provider === 'google')
      )
        fail('Cần đăng nhập bằng Google.');
    }
    return user.id;
  }
  function run(
    work: (signal: AbortSignal, generation: number) => Promise<void>,
    dropSession = true,
    retainValidOnTransient = false,
  ) {
    if (pending) return Promise.resolve(); // Serialize login/refresh/storage; double tap never sends twice.
    if (dropSession) {
      session = null;
      verifiedBackend = null;
      publish({ phase: 'unverified', userId: null });
    }
    const generation = ++epoch,
      controller = new AbortController();
    current = controller;
    publish({ busy: true, message: 'Đang xác minh…' });
    pending = (async () => {
      try {
        if (options.sessionLock)
          await options.sessionLock(() => work(controller.signal, generation));
        else await work(controller.signal, generation);
      } catch (error) {
        const transient = !(error instanceof PilotError) || error.transient;
        if (
          retainValidOnTransient &&
          transient &&
          generation === epoch &&
          !controller.signal.aborted &&
          session &&
          session.expires > now()
        ) {
          publish({
            message:
              'Kết nối tạm gián đoạn. Phiên hiện tại vẫn còn hiệu lực; sẽ tự thử làm mới lại.',
          });
          return;
        }
        session = null;
        verifiedBackend = null;
        let message =
          error instanceof PilotError
            ? error.message
            : 'Lỗi mạng/storage Auth; không log credential và không tự retry.';
        const preserve =
          options.preserveRefreshOnTransient && (!(error instanceof PilotError) || error.transient);
        if (!preserve) {
          try {
            await erase();
          } catch {
            message =
              'Không xóa được credential trên thiết bị. Cần xử lý storage trước khi tiếp tục.';
          }
        } else message += ' Dữ liệu riêng đang ẩn; thử Khôi phục khi kết nối lại.';
        publish({ phase: 'unverified', userId: null, message });
      } finally {
        current = null;
        pending = null;
        publish({ busy: false });
      }
    })();
    return pending;
  }
  async function accept(next: Session, signal: AbortSignal, generation: number) {
    const id = await providerUser(next, signal);
    if (generation !== epoch || signal.aborted) fail('Đã hủy phiên.');
    try {
      await options.storage.set(next.refresh, id);
    } catch {
      fail('Không lưu được refresh credential an toàn; cần đăng nhập lại.');
    }
    if (generation !== epoch || signal.aborted || next.expires <= now()) {
      await erase();
      fail('Phiên bị hủy hoặc hết hạn trong lúc lưu.');
    }
    session = next;
    publish({
      phase: 'provider-verified',
      userId: id,
      message:
        'Supabase đã xác minh user; chưa xác minh qua backend GoEase. Refresh credential đã lưu an toàn.',
    });
  }
  function cancel() {
    epoch++;
    current?.abort();
    session = null;
    verifiedBackend = null;
    publish({
      phase: 'unverified',
      userId: null,
      message: 'Đã bỏ phiên RAM. Khôi phục cần được provider xác minh lại.',
    });
  }
  async function verifiedDiscovery<T>(
    work: (backend: string, access: string, signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ) {
    const active = session,
      backend = verifiedBackend,
      generation = epoch;
    if (
      pending ||
      !active ||
      active.expires <= now() ||
      !backend ||
      state.phase !== 'backend-verified'
    )
      throw new ServerTripError('AUTH_REQUIRED', 'Đăng nhập lại để tìm điểm đến cho chuyến đi.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    current = controller;
    const task = work(backend, active.access, controller.signal);
    pending = task.then(
      () => {},
      () => {},
    );
    try {
      const result = await task;
      if (generation !== epoch || controller.signal.aborted || active.expires <= now())
        throw new ServerTripError(
          'CANCELLED',
          'Phiên đã thay đổi. Không áp dụng kết quả của phiên cũ.',
        );
      return result;
    } catch (error) {
      if (error instanceof ServerTripError && error.status === 401) {
        cancel();
        if (!options.refreshOnUnauthorized) await erase();
      }
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (current === controller) {
        current = null;
        pending = null;
      }
    }
  }
  return {
    snapshot() {
      if (session && session.expires <= now()) {
        session = null;
        publish({
          phase: 'unverified',
          userId: null,
          message: 'Access token hết hạn. Bấm Khôi phục để refresh/xác minh lại.',
        });
      }
      return { ...state };
    },
    cancel,
    needsRefresh(withinSeconds = 60) {
      return (
        !!session &&
        !!verifiedBackend &&
        state.phase === 'backend-verified' &&
        session.expires <= now() + withinSeconds
      );
    },
    refreshSession() {
      const backend = verifiedBackend,
        owner = state.userId;
      if (!session || !backend || !owner || state.phase !== 'backend-verified' || pending)
        return Promise.resolve();
      return run(
        async (signal, generation) => {
          const refresh = await options.storage.get();
          if (!refresh || !/^[A-Za-z0-9_.~-]{8,1024}$/.test(refresh))
            fail('Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập Google lại.');
          const next = parseSession(
            await request(
              config().url + '/auth/v1/token?grant_type=refresh_token',
              {
                method: 'POST',
                headers: { ...headers(), 'content-type': 'application/json' },
                body: JSON.stringify({ refresh_token: refresh }),
              },
              signal,
            ),
          );
          if (generation !== epoch || signal.aborted) fail('Đã hủy phiên.');
          // Persist the rotated refresh token before further network verification, so a transient
          // /user or backend outage does not strand the next refresh on an old token.
          try {
            await options.storage.set(next.refresh, owner);
          } catch {
            fail('Không lưu được phiên mới trên thiết bị. Vui lòng đăng nhập lại.');
          }
          if (generation !== epoch || signal.aborted) {
            await erase();
            fail('Đã hủy phiên.');
          }
          const id = await providerUser(next, signal);
          if (id !== owner) fail('Danh tính phiên đã thay đổi. Vui lòng đăng nhập lại.');
          const data = authIdentityResponseSchema.safeParse(
            await request(
              backend + '/v1/auth/me',
              { headers: { authorization: 'Bearer ' + next.access, accept: 'application/json' } },
              signal,
            ),
          );
          if (
            !data.success ||
            data.data.identity.id !== owner ||
            generation !== epoch ||
            signal.aborted ||
            next.expires <= now()
          )
            fail('Chưa xác minh được phiên đăng nhập mới.');
          session = next;
          verifiedBackend = backend;
          publish({
            phase: 'backend-verified',
            userId: owner,
            message: 'Phiên đăng nhập đã được làm mới.',
          });
        },
        false,
        true,
      );
    },
    acceptOAuth(data: unknown) {
      return run(async (signal, generation) => {
        config();
        await erase();
        await accept(parseSession(data), signal, generation);
      });
    },
    login(email: string, password: string) {
      return run(async (signal, generation) => {
        config();
        if (
          email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          password.length < 1 ||
          password.length > 256
        )
          fail('Nhập email và mật khẩu tài khoản thử GoEase hợp lệ.');
        await erase();
        const next = parseSession(
          await request(
            config().url + '/auth/v1/token?grant_type=password',
            {
              method: 'POST',
              headers: { ...headers(), 'content-type': 'application/json' },
              body: JSON.stringify({ email, password }),
            },
            signal,
          ),
        );
        await accept(next, signal, generation);
      });
    },
    restore() {
      return run(async (signal, generation) => {
        config();
        const refresh = await options.storage.get();
        if (!refresh) {
          publish({
            phase: 'signed-out',
            userId: null,
            message: 'Thiết bị không có refresh credential.',
          });
          return;
        }
        if (!/^[A-Za-z0-9_.~-]{8,1024}$/.test(refresh))
          fail('Refresh credential không hợp lệ. Cần đăng nhập lại.');
        const next = parseSession(
          await request(
            config().url + '/auth/v1/token?grant_type=refresh_token',
            {
              method: 'POST',
              headers: { ...headers(), 'content-type': 'application/json' },
              body: JSON.stringify({ refresh_token: refresh }),
            },
            signal,
          ),
        );
        await accept(next, signal, generation);
      });
    },
    async logout() {
      const access = session?.access;
      cancel();
      await pending;
      return run(async (signal) => {
        await erase();
        publish({
          phase: 'signed-out',
          userId: null,
          message: 'Đã xóa credential cục bộ. Chưa xác nhận thu hồi phiên từ xa.',
        });
        if (!access) return;
        try {
          await request(
            config().url + '/auth/v1/logout?scope=local',
            { method: 'POST', headers: headers(access) },
            signal,
            false,
          );
        } catch {
          fail(
            'Đã xóa credential cục bộ nhưng chưa xác nhận revoke từ xa. Không hứa phiên server đã bị thu hồi.',
          );
        }
        publish({
          phase: 'signed-out',
          userId: null,
          message:
            'Đã xóa credential và revoke refresh session này. Access JWT cũ có thể còn hiệu lực tới exp.',
        });
      });
    },
    verifyBackend(base: string | undefined) {
      return run(async (signal, generation) => {
        const active = session,
          id = state.userId;
        if (!active || active.expires <= now() || !id)
          return fail('Cần phiên Supabase mới được xác minh.');
        let origin: URL;
        try {
          origin = new URL(base ?? '');
        } catch {
          return fail('Chưa cấu hình auth backend HTTPS hoặc HTTP loopback local.');
        }
        if (!isAccountApiOrigin(base))
          fail('Auth backend cần HTTPS hoặc HTTP loopback local, không dùng HTTP LAN/QR Metro.');
        const body = await request(
          origin.origin + '/v1/auth/me',
          {
            headers: {
              authorization: `Bearer ${active.access}`,
              accept: 'application/json',
            },
          },
          signal,
        );
        const identity = authIdentityResponseSchema.safeParse(body);
        if (
          !identity.success ||
          identity.data.identity.id !== id ||
          active.expires <= now() ||
          generation !== epoch ||
          signal.aborted
        )
          fail('Backend chưa xác minh đúng user/phiên hiện tại.');
        verifiedBackend = origin.origin;
        publish({
          phase: 'backend-verified',
          message:
            'Backend GoEase đã xác minh đúng UUID qua Supabase. Chuyến server cần thao tác đồng bộ riêng.',
        });
      }, false);
    },
    async userProfile(input?: ProfileInput) {
      const active = session,
        owner = state.userId,
        generation = epoch;
      if (
        pending ||
        !active ||
        active.expires <= now() ||
        !owner ||
        !verifiedBackend ||
        state.phase !== 'backend-verified'
      )
        throw Error('Khôi phục phiên trước khi mở hồ sơ.');
      const fields = input === undefined ? undefined : validateProfile(input);
      const controller = new AbortController();
      current = controller;
      publish({ busy: true });
      const task = request(
        config().url + '/auth/v1/user',
        {
          method: fields ? 'PUT' : 'GET',
          headers: {
            ...headers(active.access),
            ...(fields ? { 'content-type': 'application/json' } : {}),
          },
          ...(fields ? { body: JSON.stringify({ data: { goease_profile: fields } }) } : {}),
        },
        controller.signal,
      );
      pending = task.then(
        () => {},
        () => {},
      );
      try {
        const data = await task;
        if (
          generation !== epoch ||
          controller.signal.aborted ||
          active.expires <= now() ||
          verifiedUser(data, active) !== owner
        )
          throw Error('Phiên đã đổi; chưa xác nhận hồ sơ. Hãy tải lại hồ sơ để đối chiếu.');
        const profile = readAccountProfile(data);
        if (
          fields &&
          (profile.displayName !== fields.displayName ||
            profile.bio !== fields.bio ||
            profile.avatar !== fields.avatar ||
            profile.avatarUrl !== fields.avatarUrl ||
            profile.coverUrl !== fields.coverUrl)
        )
          throw Error('Provider chưa xác nhận đúng thay đổi hồ sơ. Hãy tải lại để đối chiếu.');
        return profile;
      } catch (error) {
        if (error instanceof PilotError && error.status === 401) {
          cancel();
          if (!options.refreshOnUnauthorized) await erase();
        }
        throw error;
      } finally {
        if (current === controller) {
          current = null;
          pending = null;
          publish({ busy: false });
        }
      }
    },
    async uploadProfileImage(jpeg: string, signal?: AbortSignal) {
      return verifiedDiscovery(async (backend, access, requestSignal) => {
        const response = await (options.fetcher ?? fetch)(backend + '/v1/profile-media', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.any([requestSignal, AbortSignal.timeout(15000)]),
          headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
          body: JSON.stringify({ jpeg }),
        });
        const data = (await response.json()) as { path?: unknown; error?: { message?: string } };
        if (!response.ok)
          throw new ServerTripError(
            'UPLOAD_FAILED',
            data.error?.message || 'Chưa tải được ảnh. Hãy thử lại.',
            response.status,
          );
        if (
          typeof data.path !== 'string' ||
          !/^\/v1\/profile-media\/[a-f0-9]{24}-[a-f0-9-]{36}\.jpg$/.test(data.path)
        )
          throw Error('Phản hồi ảnh không hợp lệ.');
        return backend + data.path;
      }, signal);
    },
    async discoveryPreview(input: DiscoveryRequest, signal?: AbortSignal) {
      return verifiedDiscovery(
        (backend, access, requestSignal) =>
          callDiscoveryApi(backend, access, input, {
            ...(options.fetcher ? { fetcher: options.fetcher } : {}),
            signal: requestSignal,
          }),
        signal,
      );
    },
    async searchDestinations(query: string, signal?: AbortSignal) {
      return verifiedDiscovery(
        (backend, access, requestSignal) =>
          callDestinationSearchApi(backend, access, query, {
            ...(options.fetcher ? { fetcher: options.fetcher } : {}),
            signal: requestSignal,
          }),
        signal,
      );
    },
    async serverTrips(operation: ServerTripRequest) {
      const active = session,
        backend = verifiedBackend,
        generation = epoch;
      if (
        pending ||
        !active ||
        active.expires <= now() ||
        !backend ||
        state.phase !== 'backend-verified'
      )
        throw new ServerTripError(
          'AUTH_REQUIRED',
          'Cần đăng nhập/khôi phục và xác minh backend trước thao tác chuyến server.',
        );
      const controller = new AbortController();
      current = controller;
      publish({ busy: true });
      const task = callServerTripApi(backend, active.access, operation, {
        ...(options.fetcher ? { fetcher: options.fetcher } : {}),
        signal: controller.signal,
      });
      pending = task.then(
        () => {},
        () => {},
      );
      try {
        const result = await task;
        if (generation !== epoch || controller.signal.aborted || active.expires <= now())
          throw new ServerTripError(
            'CANCELLED',
            'Phiên đã đổi; không áp dụng phản hồi. Đọc lại server để đối soát.',
          );
        return result;
      } catch (error) {
        if (error instanceof ServerTripError && error.status === 401) {
          cancel();
          if (!options.refreshOnUnauthorized) await erase();
        }
        throw error;
      } finally {
        if (current === controller) {
          current = null;
          pending = null;
          publish({ busy: false });
        }
      }
    },
  };
}
