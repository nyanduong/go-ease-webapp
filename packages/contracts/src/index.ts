export * from './auth.js';

export const API_SERVICE = 'goease-api' as const;

export * from './ai.js';
export * from './maps.js';

/** Chỉ xác nhận tiến trình API trả lời, chưa kiểm tra dịch vụ ngoài. */
export interface HealthResponse {
  status: 'ok';
  service: typeof API_SERVICE;
  scope: 'api-only';
  timestamp: string;
}

export interface ApiErrorResponse {
  error: { code: string; message: string; statusCode: number };
  path: string;
  timestamp: string;
}

export function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) return false;
  const health = value as Record<string, unknown>;
  return health.status === 'ok' && health.service === API_SERVICE &&
    health.scope === 'api-only' && typeof health.timestamp === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(health.timestamp) && Number.isFinite(Date.parse(health.timestamp));
}
