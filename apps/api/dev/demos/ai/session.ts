import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { ApiFailure } from '../../../src/common/errors/api-failure.js';

export interface DemoSession {
  token: string;
  expiresAt: number;
  now?: () => number;
}
export function demoGuard(session: DemoSession, backendToken: string, host: string) {
  const now = session.now ?? Date.now;
  if (
    host !== '127.0.0.1' ||
    !/^[A-Za-z0-9_-]{22,64}$/.test(session.token) ||
    !Number.isSafeInteger(session.expiresAt) ||
    session.expiresAt <= now() ||
    session.expiresAt > now() + 3600000
  ) {
    throw new Error('Invalid demo session configuration');
  }
  const expected = Buffer.from(`Bearer ${session.token}`);
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
      throw new ApiFailure(
        429,
        'AI_RATE_LIMITED',
        'Phiên demo quá 60 request/phút. Chờ rồi thử lại.',
      );
    const supplied = Buffer.from(req.headers.authorization ?? '');
    if (
      current >= session.expiresAt ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      throw new ApiFailure(
        401,
        'AI_ACCESS_DENIED',
        'Mã phiên demo sai hoặc hết hạn. Nhận mã mới từ người vận hành.',
      );
    }
    if (req.headers.origin)
      throw new ApiFailure(
        403,
        'ORIGIN_NOT_ALLOWED',
        'Phiên demo chỉ dành native Expo Go/CLI nội bộ.',
      );
    const route = req.originalUrl.split('?')[0];
    if (!(
      (req.method === 'GET' && ['/v1/health', '/v1/catalog'].includes(route ?? '')) ||
      (req.method === 'POST' && route === '/v1/ai/itineraries')
    )) {
      throw new ApiFailure(404, 'NOT_FOUND', 'Route không được mở trong phiên demo.');
    }
    // Session credential is temporary and scoped. The backend bearer never reaches the device.
    req.headers.authorization = `Bearer ${backendToken}`;
  };
}
