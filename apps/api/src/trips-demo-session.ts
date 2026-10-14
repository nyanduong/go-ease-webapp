import type { Request } from 'express';
import type { ApiConfig } from './config.js';
import { ApiFailure } from './errors.js';
export interface TripsDemoSession { expiresAt: number; now?: () => number }
export function tripsDemoGuard(session: TripsDemoSession, config: ApiConfig) {
  const now = session.now ?? Date.now;
  if (config.API_HOST !== '127.0.0.1' || !config.TRIPS_ENABLED || !config.DATABASE_URL || !config.AUTH_ENABLED || config.GEMINI_ENABLED || config.GEMINI_API_KEY || config.AI_ACCESS_TOKEN || !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= now() || session.expiresAt > now() + 1800000) throw new Error('Invalid private-trip QA session');
  let minute = Math.floor(now() / 60000), attempts = 0;
  return (req: Request) => {
    const bucket = Math.floor(now() / 60000); if (bucket !== minute) { minute = bucket; attempts = 0; }
    if (++attempts > 60) throw new ApiFailure(429, 'TRIP_LIMIT', 'Phiên chuyến server quá 60 request/phút.');
    if (now() >= session.expiresAt) throw new ApiFailure(401, 'AUTH_INVALID', 'Phiên QA chuyến đã hết hạn.');
    if (req.headers.origin) throw new ApiFailure(403, 'ORIGIN_NOT_ALLOWED', 'Phiên QA chỉ dành native/CLI.');
    const route = req.originalUrl.split('?')[0];
    if (!((req.method === 'GET' && ['/v1/auth/me','/v1/catalog/places'].includes(req.originalUrl)) || (route === '/v1/trips' && ['GET', 'POST'].includes(req.method)) || (/^\/v1\/trips\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(route ?? '') && ['GET', 'PUT', 'DELETE'].includes(req.method)))) throw new ApiFailure(404, 'NOT_FOUND', 'Route không được mở trong phiên chuyến riêng.');
  };
}
