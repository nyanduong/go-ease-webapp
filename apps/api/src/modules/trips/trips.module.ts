import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { ActorTransactionService } from '../../database/actor-transaction.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { TripsService } from './trips.service.js';
import { TripsRepository } from './trips.repository.js';
import { TripsController } from './trips.controller.js';
@Module({
  imports: [DatabaseModule, AuthModule, CatalogModule],
  controllers: [TripsController],
  providers: [
    TripsRepository,
    {
      provide: TripsService,
      inject: [ActorTransactionService, TripsRepository, CatalogService],
      useFactory: (
        transactions: ActorTransactionService,
        repo: TripsRepository,
        catalog: CatalogService,
      ) => new TripsService(transactions, repo, catalog),
    },
  ],
})
export class TripsModule {}
