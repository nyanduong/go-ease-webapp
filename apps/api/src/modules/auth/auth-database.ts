import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabaseClient } from '../../database/client.js';
import type { Environment } from '../../config.js';
import { ApiFault } from '../../common/api-fault.js';

@Injectable()
export class AuthDatabase implements OnModuleDestroy {
  private readonly client: ReturnType<typeof createDatabaseClient> | undefined;
  constructor(config: ConfigService<Environment, true>) {
    const url = config.get('DATABASE_URL', { infer: true });
    // Explicit missing config never falls back to personal process.env.
    this.client = url ? createDatabaseClient(url) : undefined;
  }
  get db() {
    if (!this.client) throw new ApiFault('AUTH_NOT_CONFIGURED', 503);
    return this.client;
  }
  async onModuleDestroy() { await this.client?.$disconnect(); }
}
