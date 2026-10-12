import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'node:http';

export const NATIVE_TRIAL_LIMITS = { active: 8, requestsPerMinute: 120, durationMs: 20_000,
  headerBytes: 8192, headerCount: 64, authBodyBytes: 24 * 1024, tripBodyBytes: 1536 * 1024 } as const;
const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const detail = new RegExp(`^/api/trips/${uuid}$`);
function allowed(method: string, pathname: string) {
  return method === 'GET' && ['/api/health', '/api/auth/me', '/api/trips', '/api/maps/catalog'].includes(pathname)
    || method === 'POST' && ['/api/auth/challenges/native', '/api/auth/google/native', '/api/auth/logout', '/api/trips'].includes(pathname)
    || (method === 'GET' || method === 'PUT') && detail.test(pathname);
}

/** Small single-process trial brake. Not a substitute for production ingress. */
export function nativeTrialIngress(limits: { active: number; requestsPerMinute: number; durationMs: number } = NATIVE_TRIAL_LIMITS) {
  let active = 0, count = 0, until = 0;
  return (request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const reject = (status: number) => {
      // No user path, headers, claims or parser/driver errors in the response/log.
      response.status(status).json({ error: { code: 'NATIVE_TRIAL_REJECTED', statusCode: status } });
      response.once('finish', () => request.destroy());
    };
    const pathname = request.url.split('?')[0] ?? '';
    const bytes = request.rawHeaders.reduce((total, value) => total + Buffer.byteLength(value) + 2, 0);
    // Node can truncate request.headers at maxHeadersCount; inspect raw fields
    // before relying on the Origin/Cookie and auth checks below.
    if (bytes > NATIVE_TRIAL_LIMITS.headerBytes || request.rawHeaders.length / 2 > NATIVE_TRIAL_LIMITS.headerCount) { reject(431); return; }
    if (request.socket.remoteAddress !== '127.0.0.1' && request.socket.remoteAddress !== '::ffff:127.0.0.1') { reject(403); return; }
    if (!allowed(request.method, pathname) || request.headers.origin !== undefined || request.headers.cookie !== undefined) { reject(403); return; }
    if (request.headers['content-encoding'] !== undefined && request.headers['content-encoding'] !== 'identity') { reject(415); return; }
    const write = request.method === 'POST' || request.method === 'PUT';
    if (!write && request.headers['transfer-encoding'] !== undefined) { reject(413); return; }
    if (write && request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') { reject(415); return; }
    const maximum = pathname === '/api/trips' || detail.test(pathname) ? NATIVE_TRIAL_LIMITS.tripBodyBytes : NATIVE_TRIAL_LIMITS.authBodyBytes;
    const length = request.headers['content-length'];
    if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > maximum || (!write && Number(length) !== 0))) { reject(413); return; }
    const now = Date.now();
    if (now >= until) { count = 0; until = now + 60_000; }
    if (active >= limits.active || ++count > limits.requestsPerMinute) { reject(429); return; }
    // Proxy identity is never trusted. Also remove raw fields used by auth's
    // duplicate-header checks, while preserving Authorization/proof/idempotency.
    const forwarded = /^(forwarded|x-forwarded-.*|cf-connecting-ip|true-client-ip)$/i;
    for (const name of Object.keys(request.headers)) if (forwarded.test(name)) delete request.headers[name];
    request.rawHeaders = request.rawHeaders.flatMap((value, index, all) => index % 2 === 0 && !forwarded.test(value) ? [value, all[index + 1]!] : []);
    active++;
    let settled = false;
    const release = () => {
      if (settled) return;
      settled = true; active--; clearTimeout(timer);
      request.off('aborted', release);
      response.off('finish', release); response.off('close', release);
    };
    const timer = setTimeout(() => { release(); if (!response.headersSent) reject(408); else request.destroy(); }, limits.durationMs);
    timer.unref();
    request.once('aborted', release);
    response.once('finish', release); response.once('close', release);
    next();
  };
}

export function boundNativeTrialServer(server: Server) {
  server.headersTimeout = 10_000;
  server.requestTimeout = NATIVE_TRIAL_LIMITS.durationMs;
  server.setTimeout(NATIVE_TRIAL_LIMITS.durationMs, socket => socket.destroy());
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = 16;
  server.maxHeadersCount = NATIVE_TRIAL_LIMITS.headerCount;
}
