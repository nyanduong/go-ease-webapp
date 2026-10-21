import {
  adminCatalogPageSchema,
  CATALOG_LIMITS,
  managedPlaceSchema,
  adminPlaceCreateSchema,
  adminPlaceUpdateSchema,
  type ManagedPlace,
} from '@goease/contracts';
type Mutation =
  | { kind: 'create'; entry: ManagedPlace['entry'] }
  | { kind: 'update'; entry: ManagedPlace['entry']; enabled: boolean; expectedVersion: number };
export function createAdminClient(options: {
  base: string;
  url: string;
  key: string;
  fetcher?: typeof fetch;
  now?: () => number;
}) {
  let access: string | null = null,
    expires = 0,
    epoch = 0,
    current: AbortController | null = null;
  const now = options.now ?? Date.now;
  function base() {
    const u = new URL(options.base);
    if (
      u.origin !== options.base ||
      u.username ||
      u.password ||
      !(
        u.protocol === 'https:' ||
        (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))
      )
    )
      throw Error('Cần HTTPS API hoặc loopback local.');
    return u.origin;
  }
  async function wire(url: string, init: RequestInit, signal: AbortSignal) {
    const control = new AbortController();
    const cancel = () => control.abort();
    signal.addEventListener('abort', cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          if (signal.aborted) throw Error('Đã hủy.');
          const response = await (options.fetcher ?? fetch)(url, {
            ...init,
            signal: control.signal,
            redirect: 'error',
            credentials: 'omit',
          });
          const raw = await response.text();
          if (raw.length > 200000) throw Error('Phản hồi quá lớn.');
          if (response.status === 401 || response.status === 403) stop();
          if (!response.ok)
            throw Error(
              `API ${response.status}. Kiểm tra quyền/phiên; 409 cần đọc lại, giữ form để đối chiếu. Không tự gửi lại.`,
            );
          return JSON.parse(raw) as unknown;
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            control.abort();
            reject(
              Error(
                'Quá thời gian; chưa rõ kết quả. Giữ nguyên form/ID/version và tải lại để đối soát.',
              ),
            );
          }, 8000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      control.abort();
      signal.removeEventListener('abort', cancel);
    }
  }
  function stop() {
    epoch++;
    current?.abort();
    access = null;
    expires = 0;
  }
  async function session<T>(work: (signal: AbortSignal, generation: number) => Promise<T>) {
    if (current) throw Error('Đang xử lý.');
    const generation = epoch,
      controller = new AbortController();
    current = controller;
    try {
      const result = await work(controller.signal, generation);
      if (generation !== epoch) throw Error('Phiên đã đổi.');
      return result;
    } finally {
      if (current === controller) current = null;
    }
  }
  const headers = () => {
    if (!access || expires <= now()) {
      stop();
      throw Error('Phiên hết hạn; đăng nhập lại.');
    }
    return { authorization: 'Bearer ' + access, 'content-type': 'application/json' };
  };
  return {
    logout: stop,
    valid: () => {
      if (access && expires <= now()) stop();
      return !!access;
    },
    acceptOAuth(data: unknown) {
      if (current) return Promise.reject(Error('Đang xử lý.'));
      stop();
      return session(async (signal) => {
        try {
          base();
          const value = data as Record<string, unknown>;
          if (
            !value ||
            value.token_type !== 'bearer' ||
            typeof value.access_token !== 'string' ||
            value.access_token.length > 4096 ||
            !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.access_token) ||
            typeof value.expires_at !== 'number' ||
            value.expires_at * 1000 <= now() ||
            value.expires_at * 1000 > now() + 7200000
          )
            throw Error('Phiên Google không hợp lệ.');
          access = value.access_token;
          expires = value.expires_at * 1000;
          const user = (await wire(
            options.url + '/auth/v1/user',
            { headers: { apikey: options.key, authorization: 'Bearer ' + access } },
            signal,
          )) as { is_anonymous?: boolean; identities?: { provider: string }[] };
          if (
            user.is_anonymous ||
            !user.identities?.some((identity) => identity.provider === 'google')
          )
            throw Error('Cần đăng nhập Google.');
          return adminCatalogPageSchema.parse(
            await wire(
              base() + '/v1/admin/catalog?limit=' + CATALOG_LIMITS.defaultPageSize,
              { headers: headers() },
              signal,
            ),
          );
        } catch (error) {
          stop();
          throw error;
        }
      });
    },
    login(email: string, password: string) {
      if (current) return Promise.reject(Error('Đang xử lý.'));
      stop();
      return session(async (signal) => {
        try {
          base();
          if (
            !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(options.url) ||
            !/^sb_publishable_[A-Za-z0-9_-]{16,200}$/.test(options.key)
          )
            throw Error('Chưa cấu hình Supabase public hợp lệ.');
          if (
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            !password ||
            password.length > 256
          )
            throw Error('Nhập email/mật khẩu hợp lệ.');
          const data = (await wire(
            options.url + '/auth/v1/token?grant_type=password',
            {
              method: 'POST',
              headers: { apikey: options.key, 'content-type': 'application/json' },
              body: JSON.stringify({ email, password }),
            },
            signal,
          )) as Record<string, unknown>;
          if (
            data.token_type !== 'bearer' ||
            typeof data.access_token !== 'string' ||
            data.access_token.length > 4096 ||
            !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.access_token) ||
            typeof data.expires_at !== 'number' ||
            data.expires_at * 1000 <= now() ||
            data.expires_at * 1000 > now() + 7200000
          )
            throw Error('Phiên không hợp lệ.');
          access = data.access_token;
          expires = data.expires_at * 1000;
          return adminCatalogPageSchema.parse(
            await wire(
              base() + '/v1/admin/catalog?limit=' + CATALOG_LIMITS.defaultPageSize,
              { headers: headers() },
              signal,
            ),
          );
        } catch (cause) {
          stop();
          throw cause;
        }
      });
    },
    list(after?: string) {
      return session(async (signal) =>
        adminCatalogPageSchema.parse(
          await wire(
            base() +
              '/v1/admin/catalog?limit=' +
              CATALOG_LIMITS.defaultPageSize +
              (after ? '&after=' + encodeURIComponent(after) : ''),
            { headers: headers() },
            signal,
          ),
        ),
      );
    },
    save(operation: Mutation) {
      return session(async (signal) => {
        const { kind, ...payload } = operation;
        const body = (kind === 'create' ? adminPlaceCreateSchema : adminPlaceUpdateSchema).parse(
          payload,
        );
        return managedPlaceSchema.parse(
          await wire(
            base() +
              '/v1/admin/catalog' +
              (kind === 'create' ? '' : '/' + encodeURIComponent(operation.entry.id)),
            {
              method: kind === 'create' ? 'POST' : 'PUT',
              headers: headers(),
              body: JSON.stringify(body),
            },
            signal,
          ),
        );
      });
    },
  };
}
