import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { ApiConfig } from './env.js';
import type { AuthOptions } from '../modules/auth/auth-verifier.service.js';
import type { AiOptions } from '../modules/ai/ai.service.js';
import type { CatalogLoader } from '../modules/catalog/catalog.service.js';
import type { DiscoveryOptions } from '../modules/discovery/discovery.service.js';
export const API_CONFIG = Symbol('API_CONFIG');
export const API_OPTIONS = Symbol('API_OPTIONS');
export interface ApiOptions {
  auth?: AuthOptions;
  ai?: AiOptions;
  catalogLoader?: CatalogLoader;
  discovery?: DiscoveryOptions;
}
@Global()
@Module({})
export class ConfigModule {
  static register(config: ApiConfig, options: ApiOptions): DynamicModule {
    return {
      module: ConfigModule,
      providers: [
        { provide: API_CONFIG, useValue: config },
        { provide: API_OPTIONS, useValue: options },
      ],
      exports: [API_CONFIG, API_OPTIONS],
    };
  }
}
