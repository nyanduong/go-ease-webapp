import type { Request } from 'express';
import type { ApiConfig } from '../../../src/config/env.js';
import { ApiFailure } from '../../../src/common/errors/api-failure.js';

export interface AuthDemoSession {
  expiresAt: number;
  now?: () => number;
}
// Separate from the AI demo: no internal bearer, catalog, database or AI route.
export function authDemoGuard(session: AuthDemoSession, config: ApiConfig) {
  const now = session.now ?? Date.now;
  if (
    config.API_HOST !== '127.0.0.1' ||
    !config.AUTH_ENABLED ||
    !config.SUPABASE_AUTH_URL ||
    !config.SUPABASE_PUBLISHABLE_KEY ||
    config.GEMINI_ENABLED ||
    config.GEMINI_API_KEY ||
    config.AI_ACCESS_TOKEN ||
    !Number.isSafeInteger(session.expiresAt) ||
    session.expiresAt <= now() ||
    session.expiresAt > now() + 1800000
  )
    throw new Error('Invalid auth-only session configuration');
  let minute = Math.floor(now() / 60000),
    attempts = 0;
  return (req: Request) => {
    const current = now(),
      bucket = Math.floor(current / 60000);
    if (bucket !== minute) {
      minute = bucket;
      attempts = 0;
    }
    if (++attempts > 60)
      throw new ApiFailure(429, 'AUTH_RATE_LIMITED', 'Phiên Auth quá 60 request/phút.');
    if (current >= session.expiresAt)
      throw new ApiFailure(401, 'AUTH_INVALID', 'Phiên kiểm tra Auth đã hết hạn.');
    if (req.headers.origin)
      throw new ApiFailure(403, 'ORIGIN_NOT_ALLOWED', 'Phiên Auth chỉ dành Expo Go/CLI nội bộ.');
    if (
      req.method !== 'GET' ||
      req.originalUrl !== '/v1/auth/me' ||
      req.headers['transfer-encoding'] ||
      Number(req.headers['content-length'] ?? 0) !== 0
    )
      throw new ApiFailure(404, 'NOT_FOUND', 'Route không được mở trong phiên Auth.');
    // Preserve the user's access JWT. AuthVerifier must verify it with Supabase.
  };
}
