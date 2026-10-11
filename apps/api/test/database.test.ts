import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createDatabaseClient } from '../src/database/client.js';
import { samplePlaces, seedCatalog } from '../src/database/seed.js';
import { createIsolatedDatabase, fixtureDirectory, grantRuntime, LocalPostgres, postgresVersion, runTool } from './helpers/postgres.js';

const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
const prismaCli = path.join(apiRoot, 'node_modules/prisma/build/index.js');
async function migrate(url: string, config = path.join(apiRoot, 'prisma7.config.ts')) {
  await runTool(process.execPath, [prismaCli, 'migrate', 'deploy', '--config', config], { ...process.env, DATABASE_MIGRATION_URL: url });
}
function isSqlError(code: string) { return (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === code); }

test('PostgreSQL: fresh/upgrade migrations, constraints, seed, privilege, concurrency, restart and restore', { timeout: 300_000 }, async t => {
  const directory = await fixtureDirectory();
  const cluster = await LocalPostgres.initialize(directory);
  const closeClients: Array<() => Promise<unknown>> = [];
  t.after(async () => {
    try {
      const results = await Promise.allSettled(closeClients.map(close => close()));
      if (results.some(result => result.status === 'rejected')) throw new Error('Owned fixture client cleanup failed.');
    } finally { await cluster.stopIfRunning(); }
  });
  await cluster.start();
  const version = await postgresVersion(cluster.bin);
  t.diagnostic(version);
  assert.match(version, /PostgreSQL\) (16|17|18)\./);
  const env = await createIsolatedDatabase(cluster, 'goease_test');
  await migrate(env.migrationUrl);
  await runTool(process.execPath, [prismaCli, 'migrate', 'diff', '--from-config-datasource', '--to-schema', path.join(apiRoot, 'prisma/schema.prisma'), '--exit-code', '--config', path.join(apiRoot, 'prisma7.config.ts')], { ...process.env, DATABASE_MIGRATION_URL: env.migrationUrl });
  await grantRuntime(env.migrationUrl, env.runtime);
  const db = createDatabaseClient(env.runtimeUrl);
  const operator = createDatabaseClient(env.migrationUrl);
  closeClients.push(() => db.$disconnect(), () => operator.$disconnect());
  const sql = new pg.Client({ connectionString: env.runtimeUrl });
  closeClients.push(() => sql.end());
  await sql.connect();
  const owner = await operator.user.create({ data: { googleSubject: 'TEST-ONLY-customer-A', displayName: 'TEST FIXTURE A' } });
  const other = await operator.user.create({ data: { googleSubject: 'TEST-ONLY-customer-B', displayName: 'TEST FIXTURE B' } });
  const admin = await operator.user.create({ data: { googleSubject: 'TEST-ONLY-admin', role: 'ADMIN', displayName: 'TEST FIXTURE ADMIN — not a login' } });
  const createTrip = (durationDays = 1) => db.$transaction(tx => tx.trip.create({ data: {
    ownerId: owner.id, title: 'Chuyến thử riêng', destinationCode: 'VN-HANOI-SAMPLE', isSample: true,
    startDate: new Date('2026-12-29T00:00:00.000Z'), durationDays, groupSize: 4, budgetVnd: 6_000_000n,
    days: { create: Array.from({ length: durationDays }, (_, i) => ({ dayNumber: i + 1 })) },
  }, include: { days: { orderBy: { dayNumber: 'asc' } } } }));
  const trip = await createTrip(5);

  await t.test('seed twice is idempotent, source/precision labels preserved, no seed users', async () => {
    await seedCatalog(operator); await seedCatalog(operator);
    const places = await db.place.findMany({ orderBy: { code: 'asc' } });
    assert.equal(places.length, samplePlaces.length);
    assert.equal(await db.user.count(), 3);
    assert.ok(places.every(place => place.isSample && place.attribution.includes('CC0-1.0') && place.attribution.includes('source precision')));
    assert.deepEqual([owner.role, other.role, admin.role], ['CUSTOMER', 'CUSTOMER', 'ADMIN']);
    assert.equal(trip.startDate.toISOString().slice(0, 10), '2026-12-29');
    assert.deepEqual(trip.days.map(day => day.dayNumber), [1, 2, 3, 4, 5]);
    assert.equal(trip.budgetVnd, 6_000_000n);
  });

  await t.test('row CHECK/FK/unique limits reject real SQL without partial writes', async () => {
    for (const [column, value] of [['durationDays', 0], ['durationDays', 6], ['groupSize', 0], ['groupSize', 51], ['budgetVnd', -1], ['budgetVnd', 1000000000001], ['version', 0]] as const) {
      await assert.rejects(sql.query(`UPDATE "Trip" SET "${column}"=$1 WHERE id=$2`, [value, trip.id]), isSqlError('23514'));
    }
    await assert.rejects(sql.query('UPDATE "Trip" SET title=$1 WHERE id=$2', ['  ', trip.id]), isSqlError('23514'));
    await assert.rejects(sql.query('UPDATE "Trip" SET "startDate"=$1 WHERE id=$2', ['2099-12-31', trip.id]), isSqlError('23514'));
    await assert.rejects(sql.query('UPDATE "Trip" SET "timeZone"=$1 WHERE id=$2', ['UTC', trip.id]), isSqlError('23514'));
    await assert.rejects(sql.query('INSERT INTO "TripDay" ("tripId","dayNumber") VALUES ($1,1)', [trip.id]), isSqlError('23505'));
    await assert.rejects(sql.query('INSERT INTO "TripDay" ("tripId","dayNumber") VALUES ($1,1)', [randomUUID()]), isSqlError('23503'));
    const day = trip.days[0]!;
    const activity = await db.activity.create({ data: { tripDayId: day.id, position: 0, title: 'Miễn phí', estimatedCostVnd: 0n, startMinute: 1410, endMinute: 1440 } });
    const unknown = await db.activity.create({ data: { tripDayId: day.id, position: 1, title: 'Chưa biết', estimatedCostVnd: null } });
    assert.equal(activity.estimatedCostVnd, 0n); assert.equal(unknown.estimatedCostVnd, null);
    for (const query of [
      'UPDATE "Activity" SET position=50 WHERE id=$1',
      'UPDATE "Activity" SET "startMinute"=1440 WHERE id=$1',
      'UPDATE "Activity" SET "endMinute"=NULL WHERE id=$1',
      'UPDATE "Activity" SET "estimatedCostVnd"=-1 WHERE id=$1',
    ]) await assert.rejects(sql.query(query, [activity.id]), isSqlError('23514'));
    await assert.rejects(sql.query('UPDATE "Place" SET latitude=91'), isSqlError('23514'));
    await assert.rejects(sql.query('UPDATE "Place" SET longitude=181'), isSqlError('23514'));
    await assert.rejects(sql.query('INSERT INTO "Session" ("userId","tokenHash","expiresAt") VALUES ($1,$2,now()-interval \'1 day\')', [owner.id, 'a'.repeat(64)]), isSqlError('23514'));
    await assert.rejects(sql.query('INSERT INTO "Session" ("userId","tokenHash","expiresAt") VALUES ($1,$2,now()+interval \'1 day\')', [owner.id, 'invalid-hash']), isSqlError('23514'));
    await assert.rejects(sql.query('INSERT INTO "IdempotencyRecord" ("userId",operation,key,"requestHash","tripId","statusCode","responseBody") VALUES ($1,\'trip.create\',$2,$3,$4,201,\'{}\')', [owner.id, randomUUID(), 'invalid-hash', trip.id]), isSqlError('23514'));
    assert.equal((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).version, 1);
  });

  await t.test('deferred exact-day check rejects gaps/extra days/deletion; parent fields immutable', async () => {
    const before = await db.trip.count();
    await assert.rejects(db.trip.create({ data: { ownerId: owner.id, title: 'Thiếu ngày', destinationCode: 'VN-HANOI-SAMPLE', isSample: true, startDate: new Date('2026-10-11Z'), durationDays: 1, groupSize: 1 } }));
    assert.equal(await db.trip.count(), before);
    await assert.rejects(sql.query('DELETE FROM "TripDay" WHERE id=$1', [trip.days[2]!.id]), isSqlError('23514'));
    await assert.rejects(sql.query('UPDATE "Trip" SET "ownerId"=$1 WHERE id=$2', [other.id, trip.id]), isSqlError('23514'));
    const second = await createTrip();
    await assert.rejects(sql.query('UPDATE "TripDay" SET "tripId"=$1 WHERE id=$2', [second.id, trip.days[0]!.id]), isSqlError('23514'));
    assert.equal(await db.tripDay.count({ where: { tripId: trip.id } }), 5);
  });

  await t.test('runtime cannot provision roles/disable users/migrate or inherit elevated membership', async () => {
    const rows = await sql.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname=current_user');
    assert.deepEqual(rows.rows[0], { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false });
    assert.equal((await sql.query('SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)')).rowCount, 0);
    await assert.rejects(sql.query('CREATE TABLE "Forbidden" (id integer)'), isSqlError('42501'));
    await assert.rejects(sql.query('SELECT * FROM _prisma_migrations'), isSqlError('42501'));
    await assert.rejects(sql.query('UPDATE "User" SET role=\'ADMIN\' WHERE id=$1', [owner.id]), isSqlError('42501'));
    await assert.rejects(sql.query('UPDATE "User" SET "disabledAt"=now() WHERE id=$1', [owner.id]), isSqlError('42501'));
    await assert.rejects(sql.query('INSERT INTO "User" ("googleSubject",role) VALUES ($1,\'ADMIN\')', ['TEST-ONLY-forged-admin']), isSqlError('42501'));
    // Prisma static role defaults may be emitted by create(); explicit columns
    // make the privileged default a DB decision. #4 uses verified identity only.
    const inserted = await db.$queryRaw<Array<{ role: string }>>`INSERT INTO "User" ("googleSubject") VALUES ('TEST-ONLY-safe-column-insert') RETURNING role`;
    assert.equal(inserted[0]!.role, 'CUSTOMER');
    await db.user.update({ where: { id: owner.id }, data: { displayName: 'TEST FIXTURE renamed' } });
  });

  await t.test('receipt unique scope and composite owner FK are real and transaction rollback is atomic', async () => {
    const key = randomUUID();
    const receipt = { userId: owner.id, operation: 'trip.create', key, requestHash: 'a'.repeat(64), tripId: trip.id, statusCode: 201, responseBody: { id: trip.id, version: 1 } };
    await db.idempotencyRecord.create({ data: receipt });
    await assert.rejects(db.idempotencyRecord.create({ data: receipt }));
    await assert.rejects(db.idempotencyRecord.create({ data: { ...receipt, userId: other.id } }));
    await assert.rejects(db.$transaction(async tx => {
      await tx.trip.update({ where: { id: trip.id }, data: { title: 'Must rollback' } });
      await tx.idempotencyRecord.create({ data: receipt });
    }));
    assert.equal((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).title, 'Chuyến thử riêng');
  });

  await t.test('two genuine connections serialize day-set edits and reject a stale destructive commit', async () => {
    const twoDays = await createTrip(2);
    const first = new pg.Client({ connectionString: env.runtimeUrl });
    const second = new pg.Client({ connectionString: env.runtimeUrl });
    try {
      await first.connect(); await second.connect();
      await first.query('BEGIN'); await second.query('BEGIN');
      await first.query('UPDATE "Trip" SET "durationDays"=1 WHERE id=$1', [twoDays.id]);
      await first.query('DELETE FROM "TripDay" WHERE id=$1', [twoDays.days[1]!.id]);
      const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
      let completed = false;
      const pending = second.query('DELETE FROM "TripDay" WHERE id=$1', [twoDays.days[0]!.id]).finally(() => { completed = true; });
      const deadline = Date.now() + 5000;
      let waiting = false;
      while (Date.now() < deadline) {
        const state = await sql.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [secondPid]);
        if (state.rows[0]?.wait_event_type === 'Lock') { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(completed, false); assert.equal(waiting, true, 'second connection must actually wait for parent lock');
      await first.query('COMMIT'); await pending;
      await assert.rejects(second.query('COMMIT'), isSqlError('23514'));
      assert.equal(await db.tripDay.count({ where: { tripId: twoDays.id } }), 1);
    } finally {
      // Disconnect rolls back any open transaction; never queue ROLLBACK on a
      // client whose connect may have failed (that query would wait forever).
      await Promise.all([first.end(), second.end()]);
    }
  });

  await t.test('genuine pending invariant migration preserves valid populated core schema', async () => {
    const upgrade = await createIsolatedDatabase(cluster, 'goease_upgrade');
    const temp = path.join(apiRoot, '.database-upgrade-test');
    await mkdir(path.join(temp, 'migrations/202610110001_core'), { recursive: true });
    await cp(path.join(apiRoot, 'prisma/migrations/202610110001_core/migration.sql'), path.join(temp, 'migrations/202610110001_core/migration.sql'));
    await cp(path.join(apiRoot, 'prisma/migrations/migration_lock.toml'), path.join(temp, 'migrations/migration_lock.toml'));
    await writeFile(path.join(temp, 'config.ts'), `import { defineConfig } from 'prisma/config'; export default defineConfig({schema:'../prisma/schema.prisma',migrations:{path:'migrations'},datasource:{url:process.env.DATABASE_MIGRATION_URL}});`);
    await migrate(upgrade.migrationUrl, path.join(temp, 'config.ts'));
    const upgraded = createDatabaseClient(upgrade.migrationUrl);
    try {
      const user = await upgraded.user.create({ data: { googleSubject: 'TEST-ONLY-upgrade' } });
      const original = await upgraded.trip.create({ data: { ownerId: user.id, title: 'Giữ nguyên dữ liệu', destinationCode: 'VN-HANOI-SAMPLE', isSample: true, startDate: new Date('2028-02-28Z'), durationDays: 3, groupSize: 1, days: { create: [{ dayNumber: 1 }, { dayNumber: 2 }, { dayNumber: 3 }] } } });
      assert.equal(await upgraded.$queryRaw<Array<unknown>>`SELECT 1 FROM _prisma_migrations`.then(rows => rows.length), 1);
      await migrate(upgrade.migrationUrl);
      assert.equal(await upgraded.$queryRaw<Array<unknown>>`SELECT 1 FROM _prisma_migrations`.then(rows => rows.length), 2);
      assert.equal((await upgraded.trip.findUniqueOrThrow({ where: { id: original.id } })).title, original.title);
      await assert.rejects(upgraded.trip.update({ where: { id: original.id }, data: { groupSize: 0 } }));
    } finally { await upgraded.$disconnect(); }
  });

  await t.test('restart keeps durable rows and custom backup restores into another isolated database', async () => {
    await db.$disconnect(); await operator.$disconnect(); await sql.end();
    await cluster.restart();
    assert.equal((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).budgetVnd, 6_000_000n);
    const dump = path.join(directory, 'goease-test.dump');
    const migration = new URL(env.migrationUrl);
    const pgEnv = { ...process.env, PGPASSWORD: decodeURIComponent(migration.password) };
    await runTool(path.join(cluster.bin, 'pg_dump'), ['-h', '127.0.0.1', '-p', `${cluster.port}`, '-U', env.migrator, '-d', env.databaseName, '-Fc', '-f', dump], pgEnv);
    const restore = await createIsolatedDatabase(cluster, 'goease_restore');
    const target = new URL(restore.migrationUrl);
    await runTool(path.join(cluster.bin, 'pg_restore'), ['-h', '127.0.0.1', '-p', `${cluster.port}`, '-U', restore.migrator, '-d', restore.databaseName, '--no-owner', '--no-privileges', '--exit-on-error', dump], { ...process.env, PGPASSWORD: decodeURIComponent(target.password) });
    await grantRuntime(restore.migrationUrl, restore.runtime);
    const restored = createDatabaseClient(restore.runtimeUrl);
    try {
      assert.equal((await restored.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { days: true } })).days.length, 5);
      assert.equal(await restored.idempotencyRecord.count(), 1);
      assert.equal(await restored.place.count(), 3);
      await assert.rejects(restored.tripDay.delete({ where: { id: trip.days[0]!.id } }));
    } finally { await restored.$disconnect(); }
  });
  assert.ok((await readFile(path.join(apiRoot, 'prisma/migrations/202610110002_invariants/migration.sql'), 'utf8')).includes('DEFERRABLE INITIALLY DEFERRED'));
});
