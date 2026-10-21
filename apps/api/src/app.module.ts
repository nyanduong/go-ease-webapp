import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule, type ApiOptions } from './config/config.module.js';
import type { ApiConfig } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { TripsModule } from './modules/trips/trips.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { DiscoveryModule } from './modules/discovery/discovery.module.js';
import { ProfileMediaModule } from './modules/profile-media/profile-media.module.js';
import { ContentModule } from './modules/content/content.module.js';
@Module({})
export class AppModule {
  static register(config: ApiConfig, options: ApiOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config, options),
        DatabaseModule,
        AuthModule,
        CatalogModule,
        TripsModule,
        AiModule,
        HealthModule,
        DiscoveryModule,
        ProfileMediaModule,
        ContentModule,
      ],
    };
  }
}
