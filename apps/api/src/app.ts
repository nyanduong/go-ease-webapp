import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import type { Environment } from './config.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import { json } from 'express';
import { boundNativeTrialServer, nativeTrialIngress } from './native-trial.js';

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
  const trial = config.get('GOEASE_NATIVE_TRIAL_EMAILS', { infer: true }) !== undefined;
  if (trial) {
    app.set('trust proxy', false);
    app.disable('x-powered-by');
    app.use(nativeTrialIngress());
    boundNativeTrialServer(app.getHttpServer());
  }
  app.use(['/api/auth', '/api/admin', '/api/trips', '/api/maps'], (_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store'); next();
  });
  // The bounded 250-activity DTO can exceed 1 MiB with Unicode notes/title.
  app.use('/api/trips', json({ limit: '1536kb', ...(trial ? { inflate: false } : {}) }));
  app.useBodyParser('json', { limit: '24kb', ...(trial ? { inflate: false } : {}) });
  const webAuth = Boolean(config.get('DATABASE_URL', { infer: true }) && config.get('GOOGLE_WEB_CLIENT_ID', { infer: true }));
  app.enableCors({ origin: config.get('WEB_ORIGINS', { infer: true }), credentials: webAuth,
    methods: webAuth ? ['GET', 'POST', 'PUT', 'OPTIONS'] : ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-GoEase-Auth-Proof', 'X-CSRF-Token', 'Idempotency-Key'] });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
}
