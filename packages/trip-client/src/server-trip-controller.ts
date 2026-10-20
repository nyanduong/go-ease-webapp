import {
  apiErrorResponseSchema,
  createServerTripSchema,
  updateServerTripSchema,
  deleteServerTripSchema,
  idSchema,
  serverTripListQuerySchema,
  serverTripListResponseSchema,
  serverTripResponseSchema,
  tripMutationResponseSchema,
  type Trip,
} from '@goease/contracts';
export type ServerTripRequest =
  | { kind: 'list'; cursor?: string }
  | { kind: 'get'; id: string }
  | { kind: 'create'; mutationId: string; trip: Trip }
  | {
      kind: 'update';
      id: string;
      mutationId: string;
      expectedVersion: number;
      trip: Trip;
    }
  | { kind: 'delete'; id: string; mutationId: string; expectedVersion: number };
export class ServerTripError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
    readonly requestId: string | null = null,
  ) {
    super(message);
  }
}
export async function callServerTripApi(
  base: string,
  token: string,
  operation: ServerTripRequest,
  options: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
) {
  try {
    const u = new URL(base);
    if (
      u.protocol !== 'https:' ||
      u.origin !== base ||
      u.username ||
      u.password ||
      token.length > 4096 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
    )
      throw Error();
  } catch {
    throw new ServerTripError(
      'CONFIG',
      'Cần HTTPS backend và phiên user đã xác minh, không dùng URL LAN/QR Metro.',
    );
  }
  let path = '/v1/trips',
    method = 'GET',
    body: unknown;
  if (operation.kind === 'list') {
    const q = serverTripListQuerySchema.safeParse(
      operation.cursor === undefined ? {} : { cursor: operation.cursor },
    );
    if (!q.success) throw new ServerTripError('INVALID', 'Cursor không hợp lệ.');
    if (q.data.cursor) path += '?cursor=' + encodeURIComponent(q.data.cursor);
  } else if (operation.kind === 'get') {
    const id = idSchema.safeParse(operation.id);
    if (!id.success) throw new ServerTripError('INVALID', 'ID chuyến không hợp lệ.');
    path += '/' + encodeURIComponent(id.data);
  } else if (['create', 'update', 'delete'].includes(operation.kind)) {
    const { kind, ...fields } = operation;
    const payload = { ...fields } as Record<string, unknown>;
    delete payload.id;
    const parsed = (
      kind === 'create'
        ? createServerTripSchema
        : kind === 'update'
          ? updateServerTripSchema
          : deleteServerTripSchema
    ).safeParse(payload);
    if (!parsed.success)
      throw new ServerTripError('INVALID', 'Nội dung/version/mutationId chuyến không hợp lệ.');
    body = parsed.data;
    if (kind === 'create') method = 'POST';
    else {
      const id = idSchema.safeParse('id' in operation ? operation.id : undefined);
      if (
        !id.success ||
        (kind === 'update' && 'trip' in operation && operation.trip.id !== id.data)
      )
        throw new ServerTripError('INVALID', 'ID path và nội dung không khớp.');
      path += '/' + encodeURIComponent(id.data);
      method = kind === 'update' ? 'PUT' : 'DELETE';
    }
  } else throw new ServerTripError('INVALID', 'Thao tác không hợp lệ.');
  const controller = new AbortController(),
    ms = options.timeoutMs ?? 15000;
  if (!Number.isInteger(ms) || ms < 100 || ms > 30000)
    throw new ServerTripError('CONFIG', 'Timeout không hợp lệ.');
  let timer: ReturnType<typeof setTimeout> | undefined, cancel: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(
        new ServerTripError(
          'CANCELLED',
          'Đã hủy chờ. Server có thể đã ghi; giữ mutationId cũ và đọc lại để đối soát.',
        ),
      );
    };
    if (options.signal?.aborted) cancel();
    else options.signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new ServerTripError(
          'TIMEOUT',
          'Chưa xác nhận server đã ghi. Thử lại đúng mutationId/nội dung, không tạo ID mới.',
        ),
      );
    }, ms);
  });
  const work = async () => {
    if (controller.signal.aborted) throw new ServerTripError('CANCELLED', 'Đã hủy yêu cầu.');
    const response = await (options.fetcher ?? fetch)(base + path, {
      method,
      signal: controller.signal,
      redirect: 'error',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer ' + token,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const raw = await response.text();
    if (raw.length > 262144)
      throw new ServerTripError('INVALID_RESPONSE', 'Phản hồi server quá lớn.');
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ServerTripError('INVALID_RESPONSE', 'Server không trả JSON hợp lệ.');
    }
    if (!response.ok) {
      const error = apiErrorResponseSchema.safeParse(value);
      if (!error.success || error.data.statusCode !== response.status)
        throw new ServerTripError('INVALID_RESPONSE', 'Lỗi server sai contract.');
      throw new ServerTripError(
        error.data.error.code,
        `Server ${response.status} · ${error.data.error.code}. Conflict cần đọc lại; lỗi mạng/5xx cần đối soát mutationId cũ.`,
        response.status,
        error.data.error.requestId,
      );
    }
    if (operation.kind === 'list') {
      const data = serverTripListResponseSchema.safeParse(value);
      if (
        !data.success ||
        (data.data.nextCursor && data.data.nextCursor !== data.data.items.at(-1)?.id)
      )
        throw new ServerTripError('INVALID_RESPONSE', 'Danh sách sai contract.');
      return { kind: 'list' as const, data: data.data };
    }
    if (operation.kind === 'get') {
      const data = serverTripResponseSchema.safeParse(value);
      if (!data.success || data.data.trip.id !== operation.id)
        throw new ServerTripError('INVALID_RESPONSE', 'Chuyến server sai contract/ID.');
      return { kind: 'get' as const, data: data.data };
    }
    const data = tripMutationResponseSchema.safeParse(value);
    if (
      !data.success ||
      data.data.mutationId !== operation.mutationId ||
      data.data.result.version !==
        (operation.kind === 'create' ? 1 : operation.expectedVersion + 1) ||
      (operation.kind === 'delete'
        ? data.data.result.kind !== 'deleted' || data.data.result.id !== operation.id
        : data.data.result.kind !== 'saved' || data.data.result.trip.id !== operation.trip.id)
    )
      throw new ServerTripError(
        'INVALID_RESPONSE',
        'Kết quả ghi sai mutationId/version/ID; cần đối soát trước khi thử lại.',
      );
    return { kind: 'mutation' as const, data: data.data };
  };
  try {
    return await Promise.race([stopped, work()]);
  } catch (error) {
    if (error instanceof ServerTripError) throw error;
    throw new ServerTripError(
      'NETWORK',
      'Mất kết nối; chưa biết server đã ghi chưa. Giữ nguyên mutationId/nội dung để đối soát.',
    );
  } finally {
    clearTimeout(timer);
    if (cancel) options.signal?.removeEventListener('abort', cancel);
    controller.abort();
  }
}
