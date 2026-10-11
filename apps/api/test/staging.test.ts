import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runStagingOperator } from '../scripts/staging-operator.js';
import { grantRuntime, operatorConnection, verifyRuntime } from '../scripts/lib/runtime-role.js';
import { createIsolatedDatabase, fixtureDirectory, LocalPostgres } from './helpers/postgres.js';

test('staging operator resets dirty direct grants, refuses elevation and uses explicit migration seed (real private PG)', { timeout: 90_000 }, async () => {
  const cluster = await LocalPostgres.initialize(await fixtureDirectory());
  try {
    await cluster.start();
    const db = await createIsolatedDatabase(cluster, 'goease_staging');
    const env = { ...process.env, DATABASE_MIGRATION_URL: db.migrationUrl, DATABASE_URL: db.runtimeUrl, RUNTIME_ROLE: db.runtime };
    await runStagingOperator('migrate', env);
    const operator = operatorConnection(db.migrationUrl); await operator.connect();
    try {
      await operator.query(`GRANT ALL ON "User", "Session" TO ${db.runtime}`);
      await operator.query(`GRANT UPDATE (role, "disabledAt") ON "User" TO ${db.runtime}`);
      await runStagingOperator('grants', env); await runStagingOperator('verify', env);
      await operator.query(`REVOKE INSERT, UPDATE ON "Trip" FROM ${db.runtime}`);
      await assert.rejects(verifyRuntime(db.runtimeUrl, db.runtime), /verification failed/);
      await grantRuntime(db.migrationUrl, db.runtime);
      await operator.query(`REVOKE INSERT (id, "googleSubject", "displayName", "createdAt", "updatedAt") ON "User" FROM ${db.runtime}`);
      await assert.rejects(verifyRuntime(db.runtimeUrl, db.runtime), /verification failed/);
      await grantRuntime(db.migrationUrl, db.runtime); await verifyRuntime(db.runtimeUrl, db.runtime);
      await runStagingOperator('seed-sample', env);
      const runtime = operatorConnection(db.runtimeUrl); await runtime.connect();
      try {
        assert.equal((await runtime.query('SELECT count(*)::int AS count FROM "Place"')).rows[0].count, 3);
        await assert.rejects(runtime.query('CREATE TABLE forbidden(id int)'), /permission denied/);
        await assert.rejects(runtime.query('UPDATE "User" SET role = \'ADMIN\''), /permission denied/);
        await assert.rejects(runtime.query('UPDATE "Session" SET "tokenHash" = \'TEST_ONLY\''), /permission denied/);
        await assert.rejects(runtime.query('SELECT * FROM "_prisma_migrations"'), /permission denied/);
      } finally { await runtime.end(); }
      await assert.rejects(runStagingOperator('seed-sample', { DATABASE_URL: db.migrationUrl }), /Explicit migration/);
      await assert.rejects(runStagingOperator('unknown', env), /Expected/);
      // PUBLIC privilege survives a direct-role revoke; transaction must fail closed.
      await operator.query('GRANT UPDATE (role) ON "User" TO PUBLIC');
      await assert.rejects(grantRuntime(db.migrationUrl, db.runtime), /Runtime grant failed/);
      await operator.query('REVOKE UPDATE (role) ON "User" FROM PUBLIC');
      await grantRuntime(db.migrationUrl, db.runtime);
    } finally { await operator.end(); }
    const admin = operatorConnection(cluster.url()); await admin.connect();
    try {
      await admin.query(`CREATE ROLE goease_staging_privileged NOLOGIN`);
      await admin.query(`GRANT goease_staging_privileged TO ${db.runtime}`);
      await assert.rejects(grantRuntime(db.migrationUrl, db.runtime), /Runtime grant failed/);
      await admin.query(`REVOKE goease_staging_privileged FROM ${db.runtime}`);
      await admin.query(`ALTER ROLE ${db.runtime} BYPASSRLS`);
      await assert.rejects(verifyRuntime(db.runtimeUrl, db.runtime), /verification failed/);
      await admin.query(`ALTER ROLE ${db.runtime} NOBYPASSRLS`);
    } finally { await admin.end(); }
    const owner = operatorConnection(cluster.url(db.databaseName)); await owner.connect();
    try {
      await owner.query(`ALTER FUNCTION public.goease_immutable_parent() OWNER TO ${db.runtime}`);
      await assert.rejects(verifyRuntime(db.runtimeUrl, db.runtime), /verification failed/);
      await assert.rejects(grantRuntime(db.migrationUrl, db.runtime), /Runtime grant failed/);
      await owner.query(`ALTER FUNCTION public.goease_immutable_parent() OWNER TO ${db.migrator}`);
      await verifyRuntime(db.runtimeUrl, db.runtime);
      await owner.query("CREATE TYPE public.test_only_role_enum AS ENUM ('TEST_ONLY')");
      await owner.query(`ALTER TYPE public.test_only_role_enum OWNER TO ${db.runtime}`);
      await assert.rejects(verifyRuntime(db.runtimeUrl, db.runtime), /verification failed/);
      await owner.query('DROP TYPE public.test_only_role_enum');
      await owner.query(`ALTER TABLE "Place" OWNER TO ${db.runtime}`);
      await assert.rejects(grantRuntime(db.migrationUrl, db.runtime), /Runtime grant failed/);
    } finally { await owner.end(); }
  } finally { await cluster.stopIfRunning(); }
});
