import { Module } from '@nestjs/common';
import { API_CONFIG, API_OPTIONS, type ApiOptions } from '../../config/config.module.js';
import type { ApiConfig } from '../../config/env.js';
import { DatabaseModule } from '../../database/database.module.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ActorTransactionService } from '../../database/actor-transaction.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { AccountIdentityService } from '../auth/account-identity.service.js';
import { CatalogRepository } from './catalog.repository.js';
import { CatalogService } from './catalog.service.js';
import { CatalogController } from './catalog.controller.js';
import { AdminCatalogController } from './admin/admin-catalog.controller.js';
import { AdminCatalogService } from './admin/admin-catalog.service.js';
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CatalogController, AdminCatalogController],
  providers: [
    {
      provide: CatalogRepository,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => new CatalogRepository(db),
    },
    {
      provide: CatalogService,
      inject: [PrismaService, CatalogRepository, API_OPTIONS],
      useFactory: (db: PrismaService, repo: CatalogRepository, options: ApiOptions) =>
        new CatalogService(db, repo, options.catalogLoader),
    },
    {
      provide: AdminCatalogService,
      inject: [API_CONFIG, AccountIdentityService, ActorTransactionService, CatalogRepository],
      useFactory: (
        config: ApiConfig,
        identity: AccountIdentityService,
        transactions: ActorTransactionService,
        repo: CatalogRepository,
      ) => new AdminCatalogService(config, identity, transactions, repo),
    },
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
