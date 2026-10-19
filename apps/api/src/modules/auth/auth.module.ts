import { Module } from '@nestjs/common';
import { API_CONFIG, API_OPTIONS, type ApiOptions } from '../../config/config.module.js';
import type { ApiConfig } from '../../config/env.js';
import { DatabaseModule } from '../../database/database.module.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuthVerifier } from './auth-verifier.service.js';
import { AccountIdentityService } from './account-identity.service.js';
import { AuthController } from './auth.controller.js';
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    {
      provide: AuthVerifier,
      inject: [API_CONFIG, API_OPTIONS],
      useFactory: (config: ApiConfig, options: ApiOptions) =>
        new AuthVerifier(config, options.auth),
    },
    {
      provide: AccountIdentityService,
      inject: [API_CONFIG, PrismaService, AuthVerifier],
      useFactory: (config: ApiConfig, db: PrismaService, auth: AuthVerifier) =>
        new AccountIdentityService(config, db, auth),
    },
  ],
  exports: [AuthVerifier, AccountIdentityService],
})
export class AuthModule {}
