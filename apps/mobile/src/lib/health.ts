import { isHealthResponse, type HealthResponse } from '@goease/contracts';

export type HealthFailureCode = 'http' | 'contract' | 'network' | 'timeout' | 'cancelled';
const messages: Record<HealthFailureCode, string> = {
  http: 'API chưa trả lời thành công. Vui lòng thử lại.',
  contract: 'Phản hồi API chưa đúng định dạng health.',
  network: 'Chưa kết nối được API. Kiểm tra mạng và địa chỉ máy chủ, rồi thử lại.',
  timeout: 'API phản hồi quá lâu. Vui lòng thử lại.',
  cancelled: 'Yêu cầu đã được hủy.',
};
export class HealthFailure extends Error {
  readonly code: HealthFailureCode;
  constructor(code: HealthFailureCode) { super(messages[code]); this.code = code; }
}
export type HealthFetch = (url: string, init: RequestInit) => Promise<Response>;

export function createHealthClient(baseUrl: string, fetcher: HealthFetch = (url, init) => fetch(url, init), timeoutMs = 8000) {
  return async (signal: AbortSignal): Promise<HealthResponse> => {
    if (signal.aborted) throw new HealthFailure('cancelled');
    const request = new AbortController();
    let timedOut = false;
    const cancel = () => request.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; request.abort(); }, timeoutMs);
    try {
      const response = await fetcher(`${baseUrl}/health`, { signal: request.signal,
        headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store' });
      if (!response.ok) throw new HealthFailure('http');
      let body: unknown;
      try { body = await response.json(); } catch { throw new HealthFailure('contract'); }
      if (!isHealthResponse(body)) throw new HealthFailure('contract');
      return body;
    } catch (error) {
      if (signal.aborted) throw new HealthFailure('cancelled');
      if (timedOut) throw new HealthFailure('timeout');
      if (error instanceof HealthFailure) throw error;
      throw new HealthFailure('network');
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    }
  };
}
