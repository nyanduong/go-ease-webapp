import {
  apiErrorResponseSchema,
  discoveryPreviewRequestSchema,
  discoveryPreviewResponseSchema,
  type DiscoveryPreviewRequest,
} from '@goease/contracts';
import { ServerTripError } from './server-trip-controller.js';

export type DiscoveryRequest = DiscoveryPreviewRequest;

/** The provider key never enters the client; this calls only the verified GoEase origin. */
export async function callDiscoveryApi(
  base: string,
  token: string,
  input: DiscoveryRequest,
  options: { fetcher?: typeof fetch; signal?: AbortSignal } = {},
) {
  const url = new URL(base);
  if (
    url.protocol !== 'https:' ||
    url.origin !== base ||
    url.username ||
    url.password ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ||
    token.length > 4096
  )
    throw new ServerTripError('CONFIG', 'Chưa cấu hình kết nối GoEase hợp lệ.');
  const payload = discoveryPreviewRequestSchema.safeParse(input);
  if (!payload.success)
    throw new ServerTripError('INVALID', 'Kiểm tra thông tin chuyến đi trước khi tìm địa điểm.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timeout = setTimeout(abort, 45000);
  try {
    if (controller.signal.aborted) throw new ServerTripError('CANCELLED', 'Đã dừng tìm địa điểm.');
    const response = await (options.fetcher ?? fetch)(base + '/v1/discovery/preview', {
      method: 'POST',
      redirect: 'error',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload.data),
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
    const result = discoveryPreviewResponseSchema.safeParse(data);
    if (!result.success)
      throw new ServerTripError('OUTPUT_INVALID', 'Dữ liệu địa điểm chưa hợp lệ. Hãy thử lại.');
    if (
      result.data.destination.id !== payload.data.input.destinationId ||
      result.data.result.trip.destinationId !== payload.data.input.destinationId
    )
      throw new ServerTripError(
        'OUTPUT_INVALID',
        'Địa điểm trả về không khớp thành phố đã chọn. Hãy thử lại.',
      );
    if (controller.signal.aborted) throw new ServerTripError('CANCELLED', 'Đã dừng tìm địa điểm.');
    return result.data;
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
