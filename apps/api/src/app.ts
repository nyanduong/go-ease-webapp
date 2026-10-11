import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import type { Environment } from './config.js';

export interface AppOptions {
  logging?: boolean;
  environment?: Record<string, unknown>;
  closeWatchConnections?: boolean;
}

export async function createApp({ logging = true, environment, closeWatchConnections = false }: AppOptions = {}) {
  const module = await AppModule.register(environment);
  // Dev watch must release browser preconnect/keep-alive sockets before restart.
  // Regular start retains Nest's default graceful response draining.
  const app = await NestFactory.create(module, {
    logger: logging ? ['log', 'warn', 'error'] : false,
    abortOnError: false,
    forceCloseConnections: closeWatchConnections,
  });
  const config = app.get(ConfigService<Environment, true>);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get('WEB_ORIGINS', { infer: true }), credentials: false, methods: ['GET', 'OPTIONS'] });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
