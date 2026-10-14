import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { getDalatCatalog } from '@goease/catalog';
import { catchError, finalize, throwError, timeout, TimeoutError } from 'rxjs';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'node:http';
import { ApiModule, CATALOG_LOADER } from './catalog.js';
import type { CatalogLoader } from './catalog.js';
import { ApiExceptionFilter, ApiFailure } from './errors.js';
import { readConfig } from './config.js';
import { AiService } from './ai/service.js';
import type { AiOptions } from './ai/service.js';
import { attachRequestSignal, abortRequest } from './request-signal.js';
import { demoGuard, type DemoSession } from './demo-session.js';

class Deadline implements NestInterceptor {
  constructor(private readonly ms: number) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(timeout({ first: this.ms }), catchError((error: unknown) => throwError(() => error instanceof TimeoutError ? new ApiFailure(504, 'REQUEST_TIMEOUT', 'API quá thời gian xử lý. Hãy thử lại.') : error)), finalize(() => abortRequest(context.switchToHttp().getRequest<Request>())));
  }
}
export async function createApi(env: Record<string, string | undefined> = process.env, load: CatalogLoader = getDalatCatalog, aiOptions: AiOptions = {}, demo?: DemoSession) {
  const config = readConfig(env); // Fail before opening a socket, without printing env values.
  const guard = demo ? demoGuard(demo, config.AI_ACCESS_TOKEN, config.API_HOST) : undefined;
  const ai = new AiService(config, aiOptions);
  const app = await NestFactory.create<NestExpressApplication>({ module: ApiModule, providers: [{ provide: CATALOG_LOADER, useValue: load }, { provide: AiService, useValue: ai }] }, { bodyParser: false, logger: ['error', 'warn'], abortOnError: false });
  app.disable('x-powered-by');
  app.use((req: Request, res: Response, next: NextFunction) => {
    attachRequestSignal(req, res);
    res.setHeader('x-request-id', randomUUID()); res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('cache-control', 'no-store');
    try { guard?.(req); } catch (error) { return next(error); }
    if (req.originalUrl.length > 2048) return next(new ApiFailure(414, 'URI_TOO_LONG', 'URL vượt giới hạn 2048 ký tự.'));
    if (Number(req.headers['content-length'] ?? 0) > 8192) return next(new ApiFailure(413, 'PAYLOAD_TOO_LARGE', 'Body vượt giới hạn 8 KiB.'));
    if ((req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) > 0) && !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) return next(new ApiFailure(415, 'UNSUPPORTED_MEDIA_TYPE', 'Body phải là application/json.'));
    if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') return next(new ApiFailure(415, 'UNSUPPORTED_MEDIA_TYPE', 'Không hỗ trợ body nén.'));
    next();
  });
  app.enableCors({
    origin: (origin, callback) => !origin || config.API_CORS_ORIGINS.includes(origin) ? callback(null, true) : callback(new ApiFailure(403, 'ORIGIN_NOT_ALLOWED', 'Origin không được cho phép.')),
    methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'], credentials: false, maxAge: 600,
  });
  app.useBodyParser('json', { limit: 8192, inflate: false });
  // Normalize parser failures before Nest maps SyntaxError to generic BadRequestException.
  app.use((error: unknown, _req: Request, _res: Response, next: NextFunction) => {
    if (error instanceof Error && 'type' in error && error.type === 'entity.parse.failed') return next(new ApiFailure(400, 'BAD_JSON', 'Body JSON không hợp lệ.'));
    next(error);
  });
  app.useGlobalFilters(new ApiExceptionFilter()); app.useGlobalInterceptors(new Deadline(config.API_REQUEST_TIMEOUT_MS));
  const server = app.getHttpServer() as Server;
  server.requestTimeout = config.API_RECEIVE_TIMEOUT_MS;
  server.headersTimeout = Math.min(10000, config.API_RECEIVE_TIMEOUT_MS);
  server.keepAliveTimeout = 5000;
  app.enableShutdownHooks();
  return { app, config };
}
