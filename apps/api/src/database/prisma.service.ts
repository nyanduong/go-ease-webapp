import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { ApiConfig } from '../config/env.js';
import { checkDatabase } from './database-checks.js';
import { ApiFailure } from '../common/errors/api-failure.js';
export class PrismaService {
  private client?: PrismaClient;
  constructor(config: ApiConfig) {
    if (config.TRIPS_ENABLED && config.DATABASE_URL)
      this.client = new PrismaClient({
        adapter: new PrismaPg(
          {
            connectionString: config.DATABASE_URL,
            max: 4,
            connectionTimeoutMillis: 2000,
            idleTimeoutMillis: 5000,
            // adapter-pg normalizes timestamptz offsets to UTC without shifting the
            // wall clock. Request UTC from PostgreSQL so timestamps stay accurate
            // on hosts whose database defaults to Asia/Ho_Chi_Minh (or any zone).
            options: `-c timezone=UTC -c statement_timeout=${config.TRIPS_DB_TIMEOUT_MS} -c lock_timeout=1000`,
            application_name: 'goease-private-trips',
          },
          { onPoolError: () => {} },
        ),
        log: [],
      });
  }

  async onModuleInit() {
    if (!this.client) return;
    try {
      await checkDatabase(this.client);
    } catch {
      await this.client.$disconnect();
      throw new Error('Private trip database unavailable, unsafe role or catalog seed missing');
    }
  }
  async onModuleDestroy() {
    await this.client?.$disconnect();
  }
  healthState() {
    return this.client ? ('configured-unverified' as const) : ('not-configured' as const);
  }
  get configured() {
    return !!this.client;
  }
  requireClient() {
    if (!this.client)
      throw new ApiFailure(503, 'TRIPS_NOT_CONFIGURED', 'Chưa cấu hình database riêng cho chuyến.');
    return this.client;
  }
}
