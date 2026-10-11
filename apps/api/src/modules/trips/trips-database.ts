import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabaseClient } from '../../database/client.js';
import type { Environment } from '../../config.js';
import { ApiFault } from '../../common/api-fault.js';

@Injectable()
export class TripsDatabase implements OnModuleDestroy {
  private readonly client: ReturnType<typeof createDatabaseClient> | undefined;
  constructor(config: ConfigService<Environment, true>) {
    const url = config.get('DATABASE_URL', { infer: true });
    this.client = url ? createDatabaseClient(url) : undefined;
  }
  get db() {
    if (!this.client) throw new ApiFault('TRIP_TEMPLATE_UNAVAILABLE', 503);
    return this.client;
  }
  async onModuleDestroy() { await this.client?.$disconnect(); }
}
