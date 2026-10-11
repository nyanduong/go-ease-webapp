import assert from 'node:assert/strict';
import net, { type Socket } from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createDatabaseClient } from '../src/database/client.js';
import { createIsolatedDatabase, fixtureDirectory, grantRuntime, LocalPostgres, runTool } from './helpers/postgres.js';

// Driver errors can contain SQL/URLs. Never let them become test-runner output.
async function sanitized(work: () => Promise<void>) {
  try { await work(); }
  catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    throw new Error('Owned database-client fixture failed; inspect private fixture logs locally.');
  }
}
async function outcome(work: () => PromiseLike<unknown>) {
  const start = Date.now();
  try { await work(); return { rejected: false, elapsed: Date.now() - start }; }
  catch { return { rejected: true, elapsed: Date.now() - start }; }
}
function bounded(result: Awaited<ReturnType<typeof outcome>>, minimum: number, maximum: number) {
  assert.equal(result.rejected, true, 'The deliberately stalled operation must reject');
  assert.ok(result.elapsed >= minimum && result.elapsed < maximum, `Bounded rejection took ${result.elapsed}ms`);
}

test('database client bounds a real TCP handshake blackhole', { timeout: 20_000 }, () => sanitized(async () => {
  const sockets = new Set<Socket>();
  let received = 0;
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('data', bytes => { received += bytes.length; });
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.resume(); // Consume PostgreSQL startup bytes, but never answer.
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = new URL(`postgresql://test_fixture:test_fixture@127.0.0.1:${address.port}/goease_blackhole`);
  url.searchParams.set('query_timeout', '0');
  const db = createDatabaseClient(url.toString());
  try {
    const result = await outcome(() => db.$queryRaw`SELECT 1`);
    bounded(result, 2500, 8000);
    assert.ok(received > 0, 'A genuine TCP peer received PostgreSQL startup bytes');
  } finally {
    for (const socket of sockets) socket.destroy();
    const cleanup = await Promise.allSettled([
      db.$disconnect(),
      new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
    ]);
    assert.ok(cleanup.every(result => result.status === 'fulfilled'), 'Owned TCP fixture cleanup succeeds');
  }
}));

test('database client UTC, URL override protection, statement/lock and pool bounds on real PostgreSQL', { timeout: 120_000 }, async t => sanitized(async () => {
  const cluster = await LocalPostgres.initialize(await fixtureDirectory());
  const close: Array<() => Promise<unknown>> = [];
  t.after(async () => {
    try {
      const cleanup = await Promise.allSettled(close.map(work => work()));
      assert.ok(cleanup.every(result => result.status === 'fulfilled'), 'Owned PostgreSQL clients close');
    } finally { await cluster.stopIfRunning(); }
  });
  await cluster.start();
  const env = await createIsolatedDatabase(cluster, 'goease_client_bounds');
  const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
  await runTool(process.execPath, [path.join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', path.join(apiRoot, 'prisma7.config.ts')], { ...process.env, DATABASE_MIGRATION_URL: env.migrationUrl });
  await grantRuntime(env.migrationUrl, env.runtime);
  const input = new URL(env.runtimeUrl);
  input.searchParams.set('statement_timeout', '0');
  input.searchParams.set('query_timeout', '0');
  input.searchParams.set('options', '-c timezone=Asia/Bangkok -c statement_timeout=0 -c application_name=goease_bounds_fixture');
  const db = createDatabaseClient(input.toString());
  close.push(() => db.$disconnect());
  const rawUrl = new URL(env.migrationUrl);
  rawUrl.searchParams.set('options', '-c timezone=Asia/Bangkok');
  const raw = new pg.Client({ connectionString: rawUrl.toString() });
  close.push(() => raw.end());
  await raw.connect();

  await t.test('Prisma forces UTC/bounds and preserves safe options; raw non-UTC timestamps roundtrip both ways', () => sanitized(async () => {
    assert.equal((await raw.query('SHOW TimeZone')).rows[0].TimeZone, 'Asia/Bangkok');
    assert.equal((await db.$queryRaw<Array<{ TimeZone: string }>>`SHOW TimeZone`)[0]?.TimeZone, 'UTC');
    assert.equal((await db.$queryRaw<Array<{ statement_timeout: string }>>`SHOW statement_timeout`)[0]?.statement_timeout, '5s');
    assert.equal((await db.$queryRaw<Array<{ application_name: string }>>`SHOW application_name`)[0]?.application_name, 'goease_bounds_fixture');
    const instant = new Date('2026-10-11T09:36:14.123Z');
    const inserted = await raw.query('INSERT INTO "User" ("googleSubject","createdAt","updatedAt") VALUES ($1,$2::timestamptz,$2::timestamptz) RETURNING id', ['TEST-ONLY-raw-utc', instant.toISOString()]);
    const read = await db.user.findUniqueOrThrow({ where: { id: inserted.rows[0].id as string } });
    assert.equal(read.createdAt.toISOString(), instant.toISOString());
    assert.equal(read.updatedAt.toISOString(), instant.toISOString());
    // Omit role: runtime INSERT is intentionally column-scoped, never admin provisioning.
    const written = await db.$queryRaw<Array<{ id: string }>>`INSERT INTO "User" ("googleSubject","createdAt","updatedAt")
      VALUES ('TEST-ONLY-prisma-utc', ${instant}, ${instant}) RETURNING id`;
    const physical = await raw.query('SELECT "createdAt","updatedAt" FROM "User" WHERE id=$1', [written[0]?.id]);
    assert.equal((physical.rows[0].createdAt as Date).toISOString(), instant.toISOString());
    assert.equal((physical.rows[0].updatedAt as Date).toISOString(), instant.toISOString());
  }));

  await t.test('pg_sleep cannot disable the five-second bound through URL options; next query recovers', () => sanitized(async () => {
    const result = await outcome(() => db.$queryRaw`SELECT pg_sleep(15)::text`);
    bounded(result, 4500, 10_000);
    assert.equal((await db.$queryRaw<Array<{ value: number }>>`SELECT 1::integer AS value`)[0]?.value, 1);
  }));

  await t.test('a real table lock rejects at the statement bound and the pool recovers after unlock', () => sanitized(async () => {
    const locker = new pg.Client({ connectionString: env.migrationUrl });
    let pending: Promise<Awaited<ReturnType<typeof outcome>>> | undefined;
    try {
      await locker.connect(); await locker.query('BEGIN');
      await locker.query('LOCK TABLE "User" IN ACCESS EXCLUSIVE MODE');
      pending = outcome(() => db.user.count());
      const deadline = Date.now() + 2000;
      let observed = false;
      while (Date.now() < deadline) {
        const state = await raw.query('SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event_type=\'Lock\'', [env.runtime]);
        if (state.rowCount) { observed = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(observed, true, 'The runtime connection genuinely waited on a PostgreSQL lock');
      bounded(await pending, 4500, 10_000);
    } finally {
      try { await locker.query('ROLLBACK'); }
      finally { await locker.end(); if (pending) await pending; }
    }
    assert.equal(await db.user.count(), 2);
  }));

  await t.test('five real held connections cap the pool; sixth acquisition rejects in three seconds and recovers', () => sanitized(async () => {
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const allReady = new Promise<void>(resolve => { ready = resolve; });
    const pids = new Set<number>();
    const holders = Array.from({ length: 5 }, () => db.$transaction(async tx => {
      const result = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid()::integer AS pid`;
      pids.add(result[0]!.pid);
      if (pids.size === 5) ready();
      await gate;
    }, { maxWait: 3000, timeout: 15_000 }));
    // Observe every rejection immediately; no raw driver error escapes to TAP.
    const settled = Promise.allSettled(holders);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([allReady, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Owned pool holders were not acquired')), 8000);
      })]);
      assert.equal(pids.size, 5);
      bounded(await outcome(() => db.$queryRaw`SELECT 1`), 2500, 8000);
    } finally {
      if (timer) clearTimeout(timer);
      release();
      assert.ok((await settled).every(result => result.status === 'fulfilled'), 'All five held transactions finish cleanly');
    }
    assert.equal((await db.$queryRaw<Array<{ value: number }>>`SELECT 1::integer AS value`)[0]?.value, 1);
  }));
}));
