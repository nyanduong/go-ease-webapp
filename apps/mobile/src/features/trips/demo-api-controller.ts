import { aiItineraryResponseSchema, apiErrorResponseSchema, catalogResponseSchema, createTripInputSchemaFor, healthResponseSchema, todayAtDestination, type CreateTripInput } from '@goease/contracts';

export class DemoApiError extends Error {
  constructor(readonly code: 'CONFIG' | 'NETWORK' | 'TIMEOUT' | 'CANCELLED' | 'HTTP' | 'INVALID_RESPONSE', message: string) { super(message); }
}
export type DemoOperation = 'health' | 'catalog' | 'ai';
export async function callDemoApi(base: string | undefined, token: string, operation: DemoOperation, options: { fetcher?: typeof fetch; signal?: AbortSignal; timeoutMs?: number; input?: CreateTripInput } = {}) {
  let origin: string;
  try {
    if (!base) throw new Error();
    const url = new URL(base);
    if (url.protocol !== 'https:' || url.origin !== base || url.username || url.password) throw new Error();
    origin = url.origin;
  } catch { throw new DemoApiError('CONFIG', 'Cần cấu hình HTTPS API URL, không phải QR Metro.'); }
  if (!origin.startsWith('https://') || !/^[A-Za-z0-9_-]{22,64}$/.test(token) || !['health', 'catalog', 'ai'].includes(operation)) throw new DemoApiError('CONFIG', 'Cần HTTPS API URL và mã phiên demo hợp lệ từ người vận hành.');
  const input = operation === 'ai' ? createTripInputSchemaFor(todayAtDestination(new Date())).safeParse(options.input ?? { name: 'QA HTTPS demo', destinationId: 'da-lat', startDate: todayAtDestination(new Date()), durationDays: 1, people: 2, budgetVnd: null }) : null;
  if (input && !input.success) throw new DemoApiError('CONFIG', 'Nhu cầu AI không hợp lệ. Kiểm tra tên/ngày/số người/ngân sách.');
  const ms = options.timeoutMs ?? 25000;
  if (!Number.isInteger(ms) || ms < 100 || ms > 30000) throw new DemoApiError('CONFIG', 'Timeout demo phải từ 100 đến 30000 ms.');
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => {
    cancel = () => { controller.abort(); reject(new DemoApiError('CANCELLED', 'Đã hủy kiểm tra.')); };
    if (options.signal?.aborted) cancel(); else options.signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new DemoApiError('TIMEOUT', 'HTTPS API quá thời gian; không tự gọi AI lại.')); }, ms);
  });
  const work = async () => {
    if (controller.signal.aborted) throw new DemoApiError('CANCELLED', 'Đã hủy kiểm tra.');
    const path = operation === 'ai' ? '/v1/ai/itineraries' : operation === 'catalog' ? '/v1/catalog?destinationId=da-lat' : '/v1/health';
    try {
      const response = await (options.fetcher ?? fetch)(origin + path, {
        method: operation === 'ai' ? 'POST' : 'GET', redirect: 'error', signal: controller.signal,
        headers: { accept: 'application/json', authorization: `Bearer ${token}`, ...(operation === 'ai' ? { 'content-type': 'application/json' } : {}) },
        ...(input?.success ? { body: JSON.stringify(input.data) } : {}),
      });
      const raw = await response.text();
      if (raw.length > 150000) throw new DemoApiError('INVALID_RESPONSE', 'Phản hồi HTTPS quá lớn.');
      let body: unknown; try { body = JSON.parse(raw); } catch { throw new DemoApiError('INVALID_RESPONSE', 'HTTPS API không trả JSON hợp lệ.'); }
      if (!response.ok) {
        const error = apiErrorResponseSchema.safeParse(body);
        if (!error.success || error.data.statusCode !== response.status) throw new DemoApiError('INVALID_RESPONSE', 'Lỗi API sai contract.');
        throw new DemoApiError('HTTP', `API ${response.status} · ${error.data.error.code} · ${error.data.error.requestId}`);
      }
      const result = operation === 'ai' ? aiItineraryResponseSchema.safeParse(body) : operation === 'catalog' ? catalogResponseSchema.safeParse(body) : healthResponseSchema.safeParse(body);
      if (!result.success) throw new DemoApiError('INVALID_RESPONSE', 'HTTPS API trả dữ liệu sai contract.');
      const requestId = response.headers?.get('x-request-id');
      return { operation, data: result.data, requestId: requestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId) ? requestId : null };
    } catch (error) {
      if (error instanceof DemoApiError) throw error;
      throw new DemoApiError('NETWORK', 'Không kết nối được HTTPS API. Kiểm tra mạng/tunnel rồi thử lại; không tự retry AI.');
    }
  };
  try { return await Promise.race([stopped, work()]); }
  finally { if (timer) clearTimeout(timer); if (cancel) options.signal?.removeEventListener('abort', cancel); controller.abort(); }
}
