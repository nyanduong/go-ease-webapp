import { isOpaqueToken, isSampleMapCatalog, isSampleRouteRequest, isSampleRouteResult, type SampleMapCatalog, type SampleRouteRequest, type SampleRouteResult } from '@goease/contracts';

export type MapFailureCode = 'configuration' | 'network' | 'timeout' | 'cancelled' | 'contract' | 'session' | 'disabled' | 'limited' | 'provider';
const messages: Record<MapFailureCode, string> = {
  configuration: 'API bản đồ chưa được cấu hình.', network: 'Chưa kết nối được API bản đồ. Hãy thử lại.', timeout: 'Bản đồ quá thời gian chờ. Hãy thử lại.',
  cancelled: 'Đã hủy yêu cầu bản đồ.', contract: 'Dữ liệu bản đồ chưa hợp lệ.', session: 'Cần phiên GoEase còn hiệu lực để xem tuyến.',
  disabled: 'Routes chưa được bật hoặc danh mục mẫu chưa sẵn sàng.', limited: 'Đã đạt giới hạn thử tuyến. Hãy chờ rồi thử lại.', provider: 'Chưa nhận được tuyến hợp lệ từ nhà cung cấp.',
};
export class MapFailure extends Error {
  readonly code: MapFailureCode;
  constructor(code: MapFailureCode) { super(messages[code]); this.code = code; }
}
export function safeMapFailure(error: unknown) { return error instanceof MapFailure ? error : new MapFailure('network'); }
export function mapAbortable<T>(operation: Promise<T>, signal: AbortSignal, late?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const cancel = () => { if (!finished) { finished = true; signal.removeEventListener('abort', cancel); reject(new MapFailure('cancelled')); } };
    signal.addEventListener('abort', cancel, { once: true });
    operation.then(value => { if (finished) { late?.(value); return; } finished = true; signal.removeEventListener('abort', cancel); resolve(value); }, error => {
      if (finished) return; finished = true; signal.removeEventListener('abort', cancel); reject(error);
    });
    if (signal.aborted) cancel();
  });
}
export function createMapsClient(baseUrl: string, fetcher: (url: string, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, init), timeoutMs = 18_000) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 20_000) throw new MapFailure('configuration');
  async function request(path: string, signal: AbortSignal, body?: SampleRouteRequest, token?: string): Promise<unknown> {
    if (!baseUrl) throw new MapFailure('configuration');
    if (signal.aborted) throw new MapFailure('cancelled');
    const controller = new AbortController(), started = performance.now(); let timedOut = false;
    const cancel = () => controller.abort(); signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const discard = (response: Response) => { void response.body?.cancel().catch(() => {}); };
    try {
      const response = await mapAbortable(fetcher(`${baseUrl}/maps/${path}`, { method: body ? 'POST' : 'GET', credentials: 'omit',
        redirect: 'error', cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) }), controller.signal, discard);
      if (!response.ok) { discard(response); throw new MapFailure(response.status === 401 || response.status === 403 ? 'session'
        : response.status === 503 ? 'disabled' : response.status === 429 ? 'limited' : 'provider'); }
      // Native fetch buffers text; the decoded DTO may be larger than Google's encoded response.
      const limit = body ? 524_288 : 65_536;
      if (Number(response.headers.get('content-length')) > limit) { discard(response); throw new MapFailure('contract'); }
      const text = await mapAbortable(response.text(), controller.signal);
      if (text.length > limit) throw new MapFailure('contract');
      let bytes = 0;
      for (const character of text) { const point = character.codePointAt(0)!; bytes += point < 128 ? 1 : point < 2048 ? 2 : point < 65_536 ? 3 : 4; }
      if (bytes > limit) throw new MapFailure('contract');
      if (controller.signal.aborted || performance.now() - started >= timeoutMs) throw new MapFailure('timeout');
      try { return JSON.parse(text) as unknown; } catch { throw new MapFailure('contract'); }
    } catch (error) {
      if (signal.aborted) throw new MapFailure('cancelled');
      if (timedOut) throw new MapFailure('timeout');
      throw safeMapFailure(error);
    } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
  }
  return {
    async catalog(signal: AbortSignal): Promise<SampleMapCatalog> {
      const value = await request('catalog', signal); if (!isSampleMapCatalog(value)) throw new MapFailure('contract'); return value;
    },
    async route(body: SampleRouteRequest, token: string, signal: AbortSignal): Promise<SampleRouteResult> {
      if (!isSampleRouteRequest(body)) throw new MapFailure('contract'); if (!isOpaqueToken(token)) throw new MapFailure('session');
      const value = await request('sample-route', signal, body, token); if (!isSampleRouteResult(value)) throw new MapFailure('contract'); return value;
    },
  };
}
