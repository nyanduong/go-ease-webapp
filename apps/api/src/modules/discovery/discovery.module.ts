import { Module } from '@nestjs/common';
import { API_CONFIG, API_OPTIONS, type ApiOptions } from '../../config/config.module.js';
import type { ApiConfig } from '../../config/env.js';
import { AuthModule } from '../auth/auth.module.js';
import { DiscoveryController } from './discovery.controller.js';
import { DiscoveryService } from './discovery.service.js';
@Module({
  imports: [AuthModule],
  controllers: [DiscoveryController],
  providers: [
    {
      provide: DiscoveryService,
      inject: [API_CONFIG, API_OPTIONS],
      useFactory: (config: ApiConfig, options: ApiOptions) =>
        new DiscoveryService(config, options.discovery),
    },
  ],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
