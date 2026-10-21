import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { authProject } from './auth-pilot-controller.js';

export function safeReturnPath(value: string | null): string {
  // Preserve only the supported, local create-form handoff across Google OAuth.
  if (
    value &&
    !/[\r\n]/.test(value) &&
    /^\/trips\/new\?(?:destination=[a-z0-9-]{1,80}|choose=1)$/.test(value)
  )
    return value;
  return value &&
    /^\/(?:trips(?:\/(?:new|[A-Za-z0-9_-]{1,80}))?|account|about|travel-services)?$/.test(value)
    ? value
    : '/';
}

// Only PKCE material survives the redirect in this tab. SDK session/provider tokens stay in RAM.
export function createBrowserGoogleAuth(options: {
  url?: string;
  key?: string;
  storage: Storage;
  origin: string;
  callbackPath?: string;
  namespace: string;
  now?: () => number;
}) {
  const markerKey = `${options.namespace}.google-flow`,
    sdkKey = `${options.namespace}.oauth`;
  const memory = new Map<string, string>();
  const now = options.now ?? Date.now;
  const verifierKey = (key: string) => key.startsWith(sdkKey) && key.includes('code-verifier');
  let client: SupabaseClient | undefined;
  function clear() {
    memory.clear();
    options.storage.removeItem(markerKey);
    for (let i = options.storage.length - 1; i >= 0; i--) {
      const key = options.storage.key(i);
      if (key && verifierKey(key)) options.storage.removeItem(key);
    }
  }
  async function sdk() {
    const config = authProject(options.url, options.key);
    const origin = new URL(options.origin);
    if (
      origin.origin !== options.origin ||
      !(
        origin.protocol === 'https:' ||
        (origin.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
      )
    )
      throw Error('Google login cần HTTPS hoặc localhost.');
    const { createClient } = await import('@supabase/supabase-js');
    client ??= createClient(config.url, config.key, {
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)])
              : AbortSignal.timeout(10000),
          }),
      },
      auth: {
        flowType: 'pkce',
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: true,
        storageKey: sdkKey,
        storage: {
          getItem: (key) =>
            verifierKey(key) ? options.storage.getItem(key) : (memory.get(key) ?? null),
          setItem: (key, value) => {
            if (verifierKey(key)) options.storage.setItem(key, value);
            else memory.set(key, value);
          },
          removeItem: (key) => {
            if (verifierKey(key)) options.storage.removeItem(key);
            else memory.delete(key);
          },
        },
      },
    });
    return client;
  }
  return {
    clear,
    async begin(returnTo: string): Promise<string> {
      clear();
      const flow = crypto.randomUUID();
      options.storage.setItem(
        markerKey,
        JSON.stringify({ flow, startedAt: now(), returnTo: safeReturnPath(returnTo) }),
      );
      try {
        const redirect = new URL(options.callbackPath ?? '/auth/callback', options.origin);
        redirect.searchParams.set('flow', flow);
        const { data, error } = await (
          await sdk()
        ).auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirect.href,
            skipBrowserRedirect: true,
            queryParams: { prompt: 'select_account' },
          },
        });
        if (error || !data.url)
          throw Error('Chưa mở được đăng nhập Google. Kiểm tra cấu hình và thử lại.');
        const target = new URL(data.url);
        if (
          target.origin !== options.url ||
          target.pathname !== '/auth/v1/authorize' ||
          target.searchParams.get('provider') !== 'google'
        )
          throw Error('Địa chỉ Google Auth không hợp lệ.');
        return target.href;
      } catch {
        clear();
        throw Error('Chưa mở được đăng nhập Google. Kiểm tra cấu hình hoặc bộ nhớ trình duyệt.');
      }
    },
    async complete(href: string): Promise<{ session: Session; returnTo: string }> {
      const url = new URL(href),
        raw = options.storage.getItem(markerKey);
      options.storage.removeItem(markerKey); // Single use even when callback fails.
      try {
        const marker = JSON.parse(raw ?? 'null');
        if (
          url.origin !== options.origin ||
          url.pathname !== (options.callbackPath ?? '/auth/callback') ||
          url.hash ||
          !marker ||
          typeof marker.flow !== 'string' ||
          url.searchParams.getAll('flow').length !== 1 ||
          url.searchParams.get('flow') !== marker.flow ||
          !Number.isFinite(marker.startedAt) ||
          now() < marker.startedAt ||
          now() - marker.startedAt > 10 * 60_000
        )
          throw Error();
        if (url.searchParams.has('error') || url.searchParams.has('error_description'))
          throw Error();
        const code = url.searchParams.get('code');
        if (url.searchParams.getAll('code').length !== 1 || !code || code.length > 2048)
          throw Error();
        const { data, error } = await (await sdk()).auth.exchangeCodeForSession(code);
        if (error || !data.session) throw Error();
        return { session: data.session, returnTo: safeReturnPath(marker.returnTo) };
      } catch {
        throw Error(
          'Đăng nhập Google bị hủy, hết hạn hoặc chưa được cấu hình đúng. Hãy đăng nhập lại.',
        );
      } finally {
        clear();
      }
    },
  };
}
