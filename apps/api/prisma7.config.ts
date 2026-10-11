import { defineConfig } from 'prisma/config';

// Generation needs no credential. Migration requires an explicit operator URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(process.env['DATABASE_MIGRATION_URL']
    ? { datasource: { url: process.env['DATABASE_MIGRATION_URL'] } }
    : {}),
});
