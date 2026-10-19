import { Module } from '@nestjs/common';
import { API_CONFIG, API_OPTIONS, type ApiOptions } from '../../config/config.module.js';
import type { ApiConfig } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { DatabaseModule } from '../../database/database.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { AI_PROVIDER, type AiPlanner } from './ai-provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { AiService } from './ai.service.js';
import { AiController } from './ai.controller.js';
@Module({
  imports: [DatabaseModule, CatalogModule],
  controllers: [AiController],
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [API_CONFIG, API_OPTIONS],
      useFactory: (config: ApiConfig, options: ApiOptions): AiPlanner =>
        new GeminiProvider(config, options.ai?.fetcher, options.ai?.provider),
    },
    {
      provide: AiService,
      inject: [API_CONFIG, API_OPTIONS, AI_PROVIDER, CatalogService, PrismaService],
      useFactory: (
        config: ApiConfig,
        options: ApiOptions,
        provider: AiPlanner,
        catalog: CatalogService,
        db: PrismaService,
      ) =>
        new AiService(
          config,
          db.configured
            ? { ...options.ai, catalog: () => catalog.enabledEntries() }
            : (options.ai ?? {}),
          provider,
        ),
    },
  ],
  exports: [AiService],
})
export class AiModule {}
