import {
  apiErrorResponseSchema,
  destinationSearchResponseSchema,
  discoveryPreviewRequestSchema,
  discoveryPreviewResponseSchema,
  type DiscoveryPreviewRequest,
} from '@goease/contracts';
import { ServerTripError } from './server-trip-controller.js';
import { isAccountApiOrigin } from './api-origin.js';

export type DiscoveryRequest = DiscoveryPreviewRequest;
type RequestOptions = { fetcher?: typeof fetch; signal?: AbortSignal };

/** The provider key never enters the client; this calls only the verified GoEase origin. */
async function requestDiscovery(
  base: string,
  token: string,
  path: string,
  body: unknown | undefined,
  options: RequestOptions,
) {
  if (
    !isAccountApiOrigin(base) ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ||
    token.length > 4096
  )
    throw new ServerTripError('CONFIG', 'Chưa cấu hình kết nối GoEase hợp lệ.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timeout = setTimeout(abort, 45000);
  try {
    if (controller.signal.aborted) throw new ServerTripError('CANCELLED', 'Đã dừng tìm địa điểm.');
    const response = await (options.fetcher ?? fetch)(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const reader = response.body?.getReader();
    let raw = '';
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 512000)
            throw new ServerTripError('OUTPUT_INVALID', 'Phản hồi lịch trình quá lớn.');
          raw += decoder.decode(chunk.value, { stream: true });
        }
        raw += decoder.decode();
      } finally {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } else {
      raw = await response.text();
      if (raw.length > 512000)
        throw new ServerTripError('OUTPUT_INVALID', 'Phản hồi lịch trình quá lớn.');
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new ServerTripError('OUTPUT_INVALID', 'Chưa đọc được dữ liệu địa điểm.');
    }
    if (!response.ok) {
      const error = apiErrorResponseSchema.safeParse(data);
      throw new ServerTripError(
        error.success ? error.data.error.code : 'DISCOVERY_UNAVAILABLE',
        error.success
          ? error.data.error.message
          : 'Chưa tìm được địa điểm. Thông tin chuyến của bạn vẫn được giữ.',
        response.status,
      );
    }
    if (controller.signal.aborted) throw new ServerTripError('CANCELLED', 'Đã dừng tìm địa điểm.');
    return data;
  } catch (error) {
    if (error instanceof ServerTripError) throw error;
    throw new ServerTripError(
      controller.signal.aborted ? 'CANCELLED' : 'DISCOVERY_UNAVAILABLE',
      controller.signal.aborted
        ? 'Tìm địa điểm đã dừng hoặc quá thời gian. Bạn có thể thử lại.'
        : 'Chưa kết nối được nguồn địa điểm. Bạn có thể thử lại.',
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
    controller.abort();
  }
}

/** Destination search is explicit and authenticated; keystrokes never query the provider. */
export async function callDestinationSearchApi(
  base: string,
  token: string,
  query: string,
  options: RequestOptions = {},
) {
  const q = query.trim();
  if (q.length < 2 || q.length > 120)
    throw new ServerTripError('INVALID', 'Nhập tên nơi muốn đến từ 2 đến 120 ký tự.');
  const data = await requestDiscovery(
    base,
    token,
    '/v1/destinations?q=' + encodeURIComponent(q),
    undefined,
    options,
  );
  const result = destinationSearchResponseSchema.safeParse(data);
  if (
    !result.success ||
    result.data.destinations.some((destination) => destination.countryCode !== 'VN')
  )
    throw new ServerTripError('OUTPUT_INVALID', 'Dữ liệu điểm đến chưa hợp lệ. Hãy thử lại.');
  return result.data;
}

export async function callDiscoveryApi(
  base: string,
  token: string,
  input: DiscoveryRequest,
  options: RequestOptions = {},
) {
  const payload = discoveryPreviewRequestSchema.safeParse(input);
  if (!payload.success)
    throw new ServerTripError('INVALID', 'Kiểm tra thông tin chuyến đi trước khi tìm địa điểm.');
  const data = await requestDiscovery(base, token, '/v1/discovery/preview', payload.data, options);
  const result = discoveryPreviewResponseSchema.safeParse(data);
  if (!result.success)
    throw new ServerTripError('OUTPUT_INVALID', 'Dữ liệu địa điểm chưa hợp lệ. Hãy thử lại.');
  if (
    result.data.destination.id !== payload.data.input.destinationId ||
    result.data.result.trip.destinationId !== payload.data.input.destinationId ||
    (payload.data.input.destination &&
      JSON.stringify(result.data.destination) !== JSON.stringify(payload.data.input.destination))
  )
    throw new ServerTripError(
      'OUTPUT_INVALID',
      'Điểm đến trả về không khớp nơi đã chọn. Hãy thử lại.',
    );
  return result.data;
}
