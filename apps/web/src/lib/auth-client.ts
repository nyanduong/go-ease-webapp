import { isAuthChallengeResponse, isCurrentSessionResponse, isGoogleExchangeRequest, isSessionResponse,
  type AuthChallengeResponse, type CurrentSessionResponse, type WebSessionResponse } from '@goease/contracts';
import { resolveApiBase } from './api-base';

export type WebAuthFailureCode = 'configuration' | 'network' | 'timeout' | 'cancelled' | 'expired' | 'contract' | 'rejected' | 'provider';
const messages: Record<WebAuthFailureCode, string> = {
  configuration: 'Đăng nhập quản trị cần OAuth client ID và web/API HTTPS cùng origin qua reverse proxy.',
  network: 'Chưa kết nối được máy chủ. Vui lòng thử lại.', timeout: 'Yêu cầu quá thời gian. Vui lòng thử lại.',
  cancelled: 'Đã hủy đăng nhập.', expired: 'Phiên đã hết hạn. Vui lòng đăng nhập lại.', contract: 'Phản hồi đăng nhập không hợp lệ.',
  rejected: 'Máy chủ chưa chấp nhận đăng nhập. Hãy bắt đầu lại.', provider: 'Google chưa hoàn tất đăng nhập. Vui lòng thử lại.',
};
export class WebAuthFailure extends Error {
  readonly code: WebAuthFailureCode;
  constructor(code: WebAuthFailureCode) { super(messages[code]); this.code = code; }
}
export function webAuthConfig(clientId: string | undefined, apiBase: string, pageOrigin: string) {
  try {
    if (!clientId || !/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error();
    return { clientId, apiBase: resolveApiBase(apiBase, pageOrigin) };
  } catch { throw new WebAuthFailure('configuration'); }
}
export function webAbortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new WebAuthFailure('cancelled'));
    if (signal.aborted) { promise.catch(() => {}); cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    promise.then(value => { signal.removeEventListener('abort', cancel); resolve(value); }, error => { signal.removeEventListener('abort', cancel); reject(error); });
  });
}
export function createWebAuthClient(apiBase: string, fetcher: typeof fetch = fetch, timeoutMs = 8000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30_000) throw new WebAuthFailure('configuration');
  async function request(path: string, signal: AbortSignal, body?: unknown, headers: Record<string, string> = {}) {
    if (signal.aborted) throw new WebAuthFailure('cancelled');
    const controller = new AbortController(); let timedOut = false;
    const cancel = () => controller.abort(); signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await webAbortable(fetcher(`${apiBase}/auth/${path}`, { method: body === undefined ? 'GET' : 'POST',
        credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), controller.signal);
      if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new WebAuthFailure(response.status === 401 ? 'expired' : 'rejected'); }
      if (path === 'logout') { if (response.status !== 204) throw new WebAuthFailure('contract'); return undefined; }
      if (Number(response.headers.get('content-length')) > 65_536) throw new WebAuthFailure('contract');
      const text = await webAbortable(response.text(), controller.signal);
      if (text.length > 65_536) throw new WebAuthFailure('contract');
      let bytes = 0;
      for (const character of text) { const point = character.codePointAt(0)!; bytes += point < 128 ? 1 : point < 2048 ? 2 : point < 65_536 ? 3 : 4; }
      if (bytes > 65_536) throw new WebAuthFailure('contract');
      try { return JSON.parse(text) as unknown; } catch { throw new WebAuthFailure('contract'); }
    } catch (error) {
      if (signal.aborted) throw new WebAuthFailure('cancelled');
      if (timedOut) throw new WebAuthFailure('timeout');
      throw error instanceof WebAuthFailure ? error : new WebAuthFailure('network');
    } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
  }
  return {
    async challenge(signal: AbortSignal): Promise<AuthChallengeResponse> {
      const value = await request('challenges/web', signal, {});
      if (!isAuthChallengeResponse(value) || value.transport !== 'web') throw new WebAuthFailure('contract');
      if (Date.parse(value.expiresAt) <= Date.now()) throw new WebAuthFailure('expired');
      return value;
    },
    async exchange(challenge: AuthChallengeResponse, idToken: string, signal: AbortSignal): Promise<WebSessionResponse> {
      const body = { challengeId: challenge.challengeId, idToken };
      if (!isGoogleExchangeRequest(body) || Date.parse(challenge.expiresAt) <= Date.now()) throw new WebAuthFailure('rejected');
      const value = await request('google/web', signal, body, { 'X-GoEase-Auth-Proof': challenge.proof });
      if (!isSessionResponse(value) || value.transport !== 'web' || Date.parse(value.expiresAt) <= Date.now()) throw new WebAuthFailure('contract');
      return value;
    },
    async current(signal: AbortSignal): Promise<Extract<CurrentSessionResponse, { transport: 'web' }>> {
      const value = await request('me', signal);
      if (!isCurrentSessionResponse(value) || value.transport !== 'web') throw new WebAuthFailure('contract');
      if (Date.parse(value.expiresAt) <= Date.now()) throw new WebAuthFailure('expired');
      return value;
    },
    async logout(signal: AbortSignal, csrfToken?: string) { await request('logout', signal, {}, csrfToken ? { 'X-CSRF-Token': csrfToken } : {}); },
  };
}
