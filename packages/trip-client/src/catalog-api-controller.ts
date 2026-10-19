import {
  apiErrorResponseSchema,
  catalogResponseSchema,
  managedCatalogSchema,
  type CatalogResponse,
} from '@goease/contracts';

export class CatalogApiError extends Error {
  constructor(
    readonly code: 'CONFIG' | 'NETWORK' | 'TIMEOUT' | 'HTTP' | 'INVALID_RESPONSE',
    message: string,
  ) {
    super(message);
  }
}
export async function fetchManagedCatalog(base: string, fetcher: typeof fetch = fetch) {
  const origin = apiOrigin(base);
  if (!origin.startsWith('https://'))
    throw new CatalogApiError('CONFIG', 'Catalog tài khoản cần HTTPS.');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new CatalogApiError('TIMEOUT', 'Catalog quá thời gian.'));
    }, 8000);
  });
  try {
    return await Promise.race([
      deadline,
      (async () => {
        const response = await fetcher(origin + '/v1/catalog/places', {
          signal: controller.signal,
          redirect: 'error',
        });
        const raw = await response.text();
        if (!response.ok || raw.length > 200000)
          throw new CatalogApiError('HTTP', 'Không tải được catalog server.');
        return managedCatalogSchema.parse(JSON.parse(raw));
      })(),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
export function apiOrigin(value: string | undefined) {
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== value ||
      url.username ||
      url.password
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new CatalogApiError(
      'CONFIG',
      'Cấu hình EXPO_PUBLIC_API_BASE_URL bằng origin http(s), không path/credential.',
    );
  }
}
export async function fetchApiCatalog(
  baseUrl: string | undefined,
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<CatalogResponse> {
  const origin = apiOrigin(baseUrl),
    ms = options.timeoutMs ?? 8000;
  if (!Number.isInteger(ms) || ms < 100 || ms > 30000)
    throw new CatalogApiError('CONFIG', 'Timeout API phải từ 100 đến 30000 ms.');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new CatalogApiError('TIMEOUT', 'API quá thời gian. Kiểm tra mạng và thử lại.'));
      controller.abort();
    }, ms);
  });
  const operation = async () => {
    try {
      const response = await (options.fetcher ?? fetch)(
        `${origin}/v1/catalog?destinationId=da-lat`,
        { signal: controller.signal, headers: { accept: 'application/json' } },
      );
      const raw = await response.text();
      if (raw.length > 150000)
        throw new CatalogApiError('INVALID_RESPONSE', 'Phản hồi API vượt giới hạn.');
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new CatalogApiError('INVALID_RESPONSE', 'API không trả JSON hợp lệ.');
      }
      if (!response.ok) {
        const error = apiErrorResponseSchema.safeParse(body);
        if (!error.success || error.data.statusCode !== response.status)
          throw new CatalogApiError('INVALID_RESPONSE', 'API trả lỗi sai contract.');
        throw new CatalogApiError(
          'HTTP',
          `API ${response.status} · ${error.data.error.code} · Mã yêu cầu ${error.data.error.requestId}. Thử lại sau khi kiểm tra server.`,
        );
      }
      const result = catalogResponseSchema.safeParse(body);
      if (!result.success)
        throw new CatalogApiError(
          'INVALID_RESPONSE',
          'Catalog API không hợp lệ; không dùng dữ liệu này.',
        );
      return result.data;
    } catch (error) {
      if (error instanceof CatalogApiError) throw error;
      throw new CatalogApiError(
        'NETWORK',
        'Không kết nối được API. Kiểm tra URL, Metro không chuyển tiếp API, và thử lại.',
      );
    }
  };
  try {
    return await Promise.race([deadline, operation()]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
