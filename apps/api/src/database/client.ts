import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function createDatabaseClient(connectionString = process.env['DATABASE_URL']) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  // No query/bind/connection-string logging: these can contain private data.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
