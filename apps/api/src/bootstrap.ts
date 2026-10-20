import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { readConfig } from './config/env.js';
import { configureHttp, type HttpOptions } from './common/http/configure-http.js';
import type { CatalogLoader } from './modules/catalog/catalog.service.js';
import type { AiOptions } from './modules/ai/ai.service.js';
import type { AuthOptions } from './modules/auth/auth-verifier.service.js';
import type { DiscoveryOptions } from './modules/discovery/discovery.service.js';
export async function createApi(
  env: Record<string, string | undefined> = process.env,
  load?: CatalogLoader,
  aiOptions: AiOptions = {},
  authOptions: AuthOptions = {},
  httpOptions: HttpOptions = {},
  discoveryOptions: DiscoveryOptions = {},
) {
  const config = readConfig(env);
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(config, {
      ...(load ? { catalogLoader: load } : {}),
      ai: aiOptions,
      auth: authOptions,
      discovery: discoveryOptions,
    }),
    { bodyParser: false, logger: ['error', 'warn'], abortOnError: false },
  );
  configureHttp(app, config, httpOptions);
  return { app, config };
}
