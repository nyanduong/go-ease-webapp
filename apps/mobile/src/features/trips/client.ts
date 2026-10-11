import { isCreateTripRequest, isTripDetail, isTripListResponse, isTripUuid, isUpdateTripRequest, isOpaqueToken,
  type TripCursor, type TripDetail, type TripListResponse } from '@goease/contracts';

export type TripFailureCode = 'configuration' | 'network' | 'timeout' | 'cancelled' | 'contract' | 'session' | 'conflict' | 'missing' | 'unavailable';
const messages: Record<TripFailureCode, string> = {
  configuration: 'API chuyến chưa được cấu hình.', network: 'Chưa kết nối được máy chủ. Nội dung đang chỉnh vẫn còn trong phiên app.',
  timeout: 'Chưa xác nhận được kết quả trong thời gian chờ.', cancelled: 'Yêu cầu đã dừng; chưa xác nhận kết quả lưu.',
  contract: 'Chưa đọc được phản hồi chuyến hợp lệ.', session: 'Cần kiểm tra lại phiên GoEase.',
  conflict: 'Chuyến hoặc địa điểm đã thay đổi trên máy chủ. Bản đang chỉnh vẫn được giữ.', missing: 'Không tìm thấy chuyến thuộc tài khoản này.',
  unavailable: 'Máy chủ chưa xử lý được yêu cầu. Hãy thử lại khi sẵn sàng.',
};
export class TripFailure extends Error {
  readonly code: TripFailureCode;
  constructor(code: TripFailureCode) { super(messages[code]); this.code = code; }
}
export const TRIP_RESPONSE_LIMIT = 6 * 1024 * 1024;
export const TRIP_REQUEST_LIMIT = 1536 * 1024;
export function utf8Size(text: string) {
  let size = 0;
  for (const character of text) { const point = character.codePointAt(0)!; size += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4; }
  return size;
}
/** Fatal UTF-8 decoder also works where native fetch buffers a body without a stream/TextDecoder. */
export function decodeTripUtf8(bytes: Uint8Array): string {
  const parts: string[] = []; let part = '';
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i++]!; let point: number, remaining: number, minimum: number;
    if (first < 128) { point = first; remaining = 0; minimum = 0; }
    else if (first >= 0xc2 && first <= 0xdf) { point = first & 31; remaining = 1; minimum = 128; }
    else if (first >= 0xe0 && first <= 0xef) { point = first & 15; remaining = 2; minimum = 2048; }
    else if (first >= 0xf0 && first <= 0xf4) { point = first & 7; remaining = 3; minimum = 65536; }
    else throw new TripFailure('contract');
    if (i + remaining > bytes.length) throw new TripFailure('contract');
    for (let j = 0; j < remaining; j++) { const next = bytes[i++]!; if ((next & 0xc0) !== 0x80) throw new TripFailure('contract'); point = (point << 6) | (next & 63); }
    if (point < minimum || point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) throw new TripFailure('contract');
    part += String.fromCodePoint(point);
    if (part.length >= 4096) { parts.push(part); part = ''; }
  }
  return parts.join('') + part;
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal, late?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cancel = () => { if (!settled) { settled = true; signal.removeEventListener('abort', cancel); reject(new TripFailure('cancelled')); } };
    signal.addEventListener('abort', cancel, { once: true });
    promise.then(value => { if (settled) { late?.(value); return; } settled = true; signal.removeEventListener('abort', cancel); resolve(value); }, error => {
      if (!settled) { settled = true; signal.removeEventListener('abort', cancel); reject(error); }
    });
    if (signal.aborted) cancel();
  });
}
export interface TripMutation { operation: 'create' | 'update'; tripId: string | null; key: string; body: string }
export function createTripsClient(base: string, fetcher: (url: string, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, init), timeoutMs = 15_000) {
  let configured = false;
  try { const url = new URL(base); configured = ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash; } catch { /* Fixed error before fetch. */ }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30_000) throw new TripFailure('configuration');
  async function request<T>(path: string, token: string, caller: AbortSignal, guard: (value: unknown) => value is T, mutation?: TripMutation): Promise<T> {
    if (!configured) throw new TripFailure('configuration');
    if (!isOpaqueToken(token)) throw new TripFailure('session');
    if (caller.aborted) throw new TripFailure('cancelled');
    const controller = new AbortController(), started = performance.now(); let timedOut = false;
    const cancel = () => controller.abort(); caller.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const deadline = () => {
      if (caller.aborted) throw new TripFailure('cancelled');
      if (performance.now() - started >= timeoutMs) { timedOut = true; controller.abort(); throw new TripFailure('timeout'); }
    };
    const discard = (response: Response) => { void response.body?.cancel().catch(() => {}); };
    try {
      const response = await abortable(fetcher(`${base.replace(/\/+$/, '')}/trips${path}`, {
        method: mutation ? mutation.operation === 'create' ? 'POST' : 'PUT' : 'GET', signal: controller.signal,
        credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`,
          ...(mutation ? { 'Content-Type': 'application/json', 'Idempotency-Key': mutation.key } : {}) },
        ...(mutation ? { body: mutation.body } : {}),
      }), controller.signal, discard);
      deadline();
      if (!response.ok) { discard(response); throw new TripFailure(response.status === 401 || response.status === 403 ? 'session'
        : response.status === 409 ? 'conflict' : response.status === 404 ? 'missing' : 'unavailable'); }
      if (response.status !== (mutation?.operation === 'create' ? 201 : 200)
        || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')
        || Number(response.headers.get('content-length')) > TRIP_RESPONSE_LIMIT) { discard(response); throw new TripFailure('contract'); }
      let bytes: Uint8Array;
      if (response.body?.getReader) {
        const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0, complete = false;
        try {
          for (;;) {
            const next = await abortable(reader.read(), controller.signal); deadline();
            if (next.done) break;
            size += next.value.byteLength; if (size > TRIP_RESPONSE_LIMIT) throw new TripFailure('contract'); chunks.push(next.value);
          }
          bytes = new Uint8Array(size); let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
          complete = true;
        } finally { if (!complete) void reader.cancel().catch(() => {}); reader.releaseLock(); }
      } else {
        const buffer = await abortable(response.arrayBuffer(), controller.signal); deadline();
        if (buffer.byteLength > TRIP_RESPONSE_LIMIT) throw new TripFailure('contract'); bytes = new Uint8Array(buffer);
      }
      const text = decodeTripUtf8(bytes); deadline();
      let value: unknown; try { value = JSON.parse(text) as unknown; } catch { throw new TripFailure('contract'); }
      if (!guard(value)) throw new TripFailure('contract'); deadline(); return value;
    } catch (error) {
      if (caller.aborted) throw new TripFailure('cancelled'); if (timedOut) throw new TripFailure('timeout');
      throw error instanceof TripFailure ? error : new TripFailure('network');
    } finally { clearTimeout(timer); caller.removeEventListener('abort', cancel); controller.abort(); }
  }
  return {
    list(token: string, signal: AbortSignal, cursor?: TripCursor): Promise<TripListResponse> {
      const query = cursor ? `?cursorUpdatedAt=${encodeURIComponent(cursor.updatedAt)}&cursorId=${encodeURIComponent(cursor.id)}` : '';
      return request(query, token, signal, isTripListResponse);
    },
    detail(id: string, token: string, signal: AbortSignal): Promise<TripDetail> {
      if (!isTripUuid(id)) return Promise.reject(new TripFailure('contract'));
      return request(`/${id.toLowerCase()}`, token, signal, (value): value is TripDetail => isTripDetail(value) && value.id.toLowerCase() === id.toLowerCase());
    },
    mutate(mutation: TripMutation, token: string, signal: AbortSignal): Promise<TripDetail> {
      let value: unknown; try { value = JSON.parse(mutation.body) as unknown; } catch { return Promise.reject(new TripFailure('contract')); }
      if (!isTripUuid(mutation.key) || utf8Size(mutation.body) > TRIP_REQUEST_LIMIT
        || (mutation.operation === 'create' ? mutation.tripId !== null || !isCreateTripRequest(value) : !isTripUuid(mutation.tripId) || !isUpdateTripRequest(value))) return Promise.reject(new TripFailure('contract'));
      return request(mutation.operation === 'create' ? '' : `/${mutation.tripId!.toLowerCase()}`, token, signal,
        (result): result is TripDetail => {
          if (!isTripDetail(result)) return false;
          if (mutation.operation === 'create' && isCreateTripRequest(value)) return result.title === value.title.trim() && result.destinationCode === value.destinationCode
            && result.startDate === value.startDate && result.durationDays === value.durationDays && result.groupSize === value.groupSize && result.budgetVnd === value.budgetVnd && result.version === 1;
          if (!isUpdateTripRequest(value) || result.id.toLowerCase() !== mutation.tripId?.toLowerCase() || result.version !== value.expectedVersion + 1
            || result.title !== value.title.trim() || result.groupSize !== value.groupSize || result.budgetVnd !== value.budgetVnd || result.days.length !== value.days.length) return false;
          return value.days.every((day, index) => result.days[index]!.activities.length === day.activities.length && day.activities.every((activity, position) => {
            const actual = result.days[index]!.activities[position]!;
            return (activity.id === null || actual.id.toLowerCase() === activity.id.toLowerCase()) && (actual.place?.id.toLowerCase() ?? null) === (activity.placeId?.toLowerCase() ?? null)
              && actual.title === activity.title.trim() && actual.notes === activity.notes && actual.startMinute === activity.startMinute && actual.endMinute === activity.endMinute && actual.estimatedCostVnd === activity.estimatedCostVnd;
          }));
        }, mutation);
    },
  };
}
