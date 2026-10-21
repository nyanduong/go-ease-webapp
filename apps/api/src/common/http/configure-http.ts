import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'node:http';
import type { ApiConfig } from '../../config/env.js';
import { ApiFailure } from '../errors/api-failure.js';
import { ApiExceptionFilter } from './api-exception.filter.js';
import { Deadline } from './deadline.interceptor.js';
import { attachRequestContext } from './request-context.middleware.js';
export interface HttpOptions {
  guard?: (req: Request) => void;
}
const largeBody = (url: string) =>
  /^\/v1\/(?:trips(?:\/|\?|$)|profile-media(?:\/|\?|$)|admin\/content(?:\/|\?|$))/.test(url);
export function configureHttp(
  app: NestExpressApplication,
  config: ApiConfig,
  { guard }: HttpOptions = {},
) {
  app.disable('x-powered-by');
  let tripsMinute = Math.floor(Date.now() / 60000),
    tripsAttempts = 0;
  app.use((req: Request, res: Response, next: NextFunction) => {
    attachRequestContext(req, res);
    try {
      guard?.(req);
    } catch (error) {
      return next(error);
    }
    if (/^\/v1\/trips(?:\/|\?|$)/.test(req.originalUrl)) {
      const minute = Math.floor(Date.now() / 60000);
      if (minute !== tripsMinute) {
        tripsMinute = minute;
        tripsAttempts = 0;
      }
      if (++tripsAttempts > 120)
        return next(
          new ApiFailure(429, 'TRIP_LIMIT', 'Trip API quá 120 request/phút trong process.'),
        );
    }
    if (req.originalUrl.length > 2048)
      return next(new ApiFailure(414, 'URI_TOO_LONG', 'URL vượt giới hạn 2048 ký tự.'));
    const limit = largeBody(req.originalUrl) ? 262144 : 8192;
    if (Number(req.headers['content-length'] ?? 0) > limit)
      return next(new ApiFailure(413, 'PAYLOAD_TOO_LARGE', 'Body vượt giới hạn endpoint.'));
    if (
      (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) > 0) &&
      !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')
    )
      return next(new ApiFailure(415, 'UNSUPPORTED_MEDIA_TYPE', 'Body phải là application/json.'));
    if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')
      return next(new ApiFailure(415, 'UNSUPPORTED_MEDIA_TYPE', 'Không hỗ trợ body nén.'));
    next();
  });
  app.enableCors({
    origin: (origin, callback) =>
      !origin || config.API_CORS_ORIGINS.includes(origin)
        ? callback(null, true)
        : callback(new ApiFailure(403, 'ORIGIN_NOT_ALLOWED', 'Origin không được cho phép.')),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600,
  });
  const bodyOptions = {
    limit: 262144,
    inflate: false,
    verify: (req: Request, _res: unknown, buffer: Buffer) => {
      if (!largeBody(req.originalUrl) && buffer.length > 8192)
        throw Object.assign(new Error('Body limit'), { code: 'GOEASE_BODY_LIMIT' });
    },
  };
  app.useBodyParser('json', bodyOptions);
  // Normalize parser failures before Nest maps SyntaxError to generic BadRequestException.
  app.use((error: unknown, _req: Request, _res: Response, next: NextFunction) => {
    if (error instanceof Error && 'code' in error && error.code === 'GOEASE_BODY_LIMIT')
      return next(new ApiFailure(413, 'PAYLOAD_TOO_LARGE', 'Body vượt giới hạn endpoint.'));
    if (error instanceof Error && 'type' in error && error.type === 'entity.parse.failed')
      return next(new ApiFailure(400, 'BAD_JSON', 'Body JSON không hợp lệ.'));
    next(error);
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new Deadline(config.API_REQUEST_TIMEOUT_MS));
  const server = app.getHttpServer() as Server;
  server.requestTimeout = config.API_RECEIVE_TIMEOUT_MS;
  server.headersTimeout = Math.min(10000, config.API_RECEIVE_TIMEOUT_MS);
  server.keepAliveTimeout = 5000;
  app.enableShutdownHooks();
}
