import { isAuthChallengeResponse, isCurrentSessionResponse, isGoogleExchangeRequest, isSessionResponse,
  type AuthChallengeResponse, type CurrentSessionResponse, type NativeSessionResponse } from '@goease/contracts';

export type AuthFailureCode = 'configuration' | 'network' | 'timeout' | 'cancelled' | 'contract' | 'expired' | 'rejected' | 'provider' | 'storage' | 'cleanup';
const messages: Record<AuthFailureCode, string> = {
  configuration: 'Đăng nhập Google chưa được cấu hình cho bản app này.',
  network: 'Chưa kết nối được máy chủ. Vui lòng thử lại.', timeout: 'Yêu cầu quá thời gian. Vui lòng thử lại.',
  cancelled: 'Đã hủy đăng nhập.', contract: 'Phản hồi đăng nhập không hợp lệ.', expired: 'Phiên đã hết hạn. Vui lòng đăng nhập lại.',
  rejected: 'Máy chủ chưa chấp nhận đăng nhập. Hãy bắt đầu lại.', provider: 'Google chưa hoàn tất đăng nhập. Kiểm tra cấu hình hoặc thử lại.',
  storage: 'Chưa truy cập được kho phiên an toàn. Vui lòng thử lại.',
  cleanup: 'Chưa hoàn tất thu hồi hoặc xóa phiên. Vui lòng thử đăng xuất lại.',
};
export class AuthFailure extends Error {
  readonly code: AuthFailureCode;
  constructor(code: AuthFailureCode) { super(messages[code]); this.code = code; }
}
export function safeAuthFailure(error: unknown) { return error instanceof AuthFailure ? error : new AuthFailure('network'); }
export function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new AuthFailure('cancelled'));
    if (signal.aborted) { operation.catch(() => {}); cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    operation.then(value => { signal.removeEventListener('abort', cancel); resolve(value); }, error => {
      signal.removeEventListener('abort', cancel); reject(error);
    });
  });
}
export type AuthFetch = (url: string, init: RequestInit) => Promise<Response>;
export function createNativeAuthClient(baseUrl: string, fetcher: AuthFetch = (url, init) => fetch(url, init), timeoutMs = 8000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30_000) throw new AuthFailure('configuration');
  async function request(path: string, signal: AbortSignal, token?: string, body?: unknown, proof?: string): Promise<unknown> {
    if (signal.aborted) throw new AuthFailure('cancelled');
    const controller = new AbortController(); let timeout = false;
    const cancel = () => controller.abort(); signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timeout = true; controller.abort(); }, timeoutMs);
    try {
      const response = await abortable(fetcher(`${baseUrl}/auth/${path}`, {
        method: body === undefined ? 'GET' : 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(proof ? { 'X-GoEase-Auth-Proof': proof } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }), controller.signal);
      if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new AuthFailure(response.status === 401 ? 'expired' : 'rejected'); }
      if (path === 'logout') { if (response.status !== 204) throw new AuthFailure('contract'); return undefined; }
      if (Number(response.headers.get('content-length')) > 65_536) throw new AuthFailure('contract');
      // React Native fetch buffers bodies; bound accepted text as well as the entire fetch/read time.
      const text = await abortable(response.text(), controller.signal);
      if (text.length > 65_536) throw new AuthFailure('contract');
      let bytes = 0;
      for (const character of text) { const point = character.codePointAt(0)!; bytes += point < 128 ? 1 : point < 2048 ? 2 : point < 65_536 ? 3 : 4; }
      if (bytes > 65_536) throw new AuthFailure('contract');
      try { return JSON.parse(text) as unknown; } catch { throw new AuthFailure('contract'); }
    } catch (error) {
      if (signal.aborted) throw new AuthFailure('cancelled');
      if (timeout) throw new AuthFailure('timeout');
      throw safeAuthFailure(error);
    } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
  }
  return {
    async challenge(signal: AbortSignal): Promise<AuthChallengeResponse> {
      const value = await request('challenges/native', signal, undefined, {});
      if (!isAuthChallengeResponse(value) || value.transport !== 'native') throw new AuthFailure('contract');
      if (Date.parse(value.expiresAt) <= Date.now()) throw new AuthFailure('expired');
      return value;
    },
    async exchange(challenge: AuthChallengeResponse, idToken: string, signal: AbortSignal): Promise<NativeSessionResponse> {
      const body = { challengeId: challenge.challengeId, idToken };
      if (!isGoogleExchangeRequest(body) || Date.parse(challenge.expiresAt) <= Date.now()) throw new AuthFailure('rejected');
      const value = await request('google/native', signal, undefined, body, challenge.proof);
      if (!isSessionResponse(value) || value.transport !== 'native' || Date.parse(value.expiresAt) <= Date.now()) throw new AuthFailure('contract');
      return value;
    },
    async current(token: string, signal: AbortSignal): Promise<Extract<CurrentSessionResponse, { transport: 'native' }>> {
      const value = await request('me', signal, token);
      if (!isCurrentSessionResponse(value) || value.transport !== 'native') throw new AuthFailure('contract');
      if (Date.parse(value.expiresAt) <= Date.now()) throw new AuthFailure('expired');
      return value;
    },
    async logout(token: string, signal: AbortSignal) { await request('logout', signal, token, {}); },
  };
}
