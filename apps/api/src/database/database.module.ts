import { Module } from '@nestjs/common';
import { API_CONFIG } from '../config/config.module.js';
import type { ApiConfig } from '../config/env.js';
import { PrismaService } from './prisma.service.js';
import { ActorTransactionService } from './actor-transaction.service.js';
@Module({
  providers: [
    {
      provide: PrismaService,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) => new PrismaService(config),
    },
    {
      provide: ActorTransactionService,
      inject: [API_CONFIG, PrismaService],
      useFactory: (config: ApiConfig, db: PrismaService) => new ActorTransactionService(config, db),
    },
  ],
  exports: [PrismaService, ActorTransactionService],
})
export class DatabaseModule {}
