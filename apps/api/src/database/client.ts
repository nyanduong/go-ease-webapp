import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function createDatabaseClient(connectionString = process.env['DATABASE_URL']) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  // pg parses URL query settings after Pool options; keep URL overrides from
  // accidentally disabling the runtime statement/read bounds.
  let bounded: URL;
  try { bounded = new URL(connectionString); } catch { throw new Error('DATABASE_URL must be a PostgreSQL URL'); }
  bounded.searchParams.set('statement_timeout', '5000');
  bounded.searchParams.set('query_timeout', '5000');
  // No query/bind/connection-string logging: these can contain private data.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: bounded.toString(), max: 5,
    connectionTimeoutMillis: 3000, statement_timeout: 5000, query_timeout: 5000, idleTimeoutMillis: 10_000 }) });
}
