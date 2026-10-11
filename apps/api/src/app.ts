import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import type { Environment } from './config.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';

export interface AppOptions {
  logging?: boolean;
  environment?: Record<string, unknown>;
  closeWatchConnections?: boolean;
}

export async function createApp({ logging = true, environment, closeWatchConnections = false }: AppOptions = {}) {
  const module = await AppModule.register(environment);
  // Dev watch must release browser preconnect/keep-alive sockets before restart.
  // Regular start retains Nest's default graceful response draining.
  const app = await NestFactory.create<NestExpressApplication>(module, {
    logger: logging ? ['log', 'warn', 'error'] : false,
    abortOnError: false,
    forceCloseConnections: closeWatchConnections,
  });
  configureApp(app);
  return app;
}

export function configureApp(app: NestExpressApplication) {
  const config = app.get(ConfigService<Environment, true>);
  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: '24kb' });
  const webAuth = Boolean(config.get('DATABASE_URL', { infer: true }) && config.get('GOOGLE_WEB_CLIENT_ID', { infer: true }));
  app.enableCors({ origin: config.get('WEB_ORIGINS', { infer: true }), credentials: webAuth,
    methods: webAuth ? ['GET', 'POST', 'OPTIONS'] : ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-GoEase-Auth-Proof', 'X-CSRF-Token'] });
  app.use(['/api/auth', '/api/admin'], (_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store'); next();
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
}
