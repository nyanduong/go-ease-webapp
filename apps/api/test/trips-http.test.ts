import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response as ExpressResponse, NextFunction } from 'express';
import { isAuthChallengeResponse, isSessionResponse, isTripDetail, isTripListResponse, MAX_AMOUNT_VND,
  SAMPLE_DESTINATION, type CreateTripRequest, type TripDetail, type UpdateTripActivity, type UpdateTripRequest } from '@goease/contracts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.js';
import { GoogleIdentityVerifier, type VerifiedGoogleIdentity } from '../src/modules/auth/google-verifier.js';
import { LOGIN_COOKIE, SESSION_COOKIE } from '../src/modules/auth/http.js';
import { ApiFault } from '../src/common/api-fault.js';
import { createDatabaseClient } from '../src/database/client.js';
import { seedCatalog } from '../src/database/seed.js';
import { isReceiptRace } from '../src/modules/trips/trips.service.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { createIsolatedDatabase, fixtureDirectory, grantRuntime, LocalPostgres, runTool } from './helpers/postgres.js';

const origin = 'https://admin.test.example';
const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
class TestIdentities extends GoogleIdentityVerifier {
  readonly identities = new Map<string, VerifiedGoogleIdentity>();
  async verify(token: string) {
    const value = this.identities.get(token);
    if (!value) throw new ApiFault('AUTH_INVALID_IDENTITY', 401);
    return value;
  }
}
function binding(response: Response, name: string) {
  const value = response.headers.getSetCookie().find(value => value.startsWith(`${name}=`));
  assert.ok(value); return value.split(';')[0]!;
}
function create(patch: Partial<CreateTripRequest> = {}): CreateTripRequest {
  return { title: 'Chuyến mẫu TEST ONLY', destinationCode: SAMPLE_DESTINATION, startDate: '2028-02-28', durationDays: 3,
    groupSize: 2, budgetVnd: null, ...patch };
}
function activity(patch: Partial<UpdateTripActivity> = {}): UpdateTripActivity {
  return { id: null, placeId: null, title: 'Hoạt động TEST ONLY', notes: null, startMinute: null, endMinute: null,
    estimatedCostVnd: null, ...patch };
}
function editable(detail: TripDetail): UpdateTripRequest {
  return { expectedVersion: detail.version, title: detail.title, groupSize: detail.groupSize, budgetVnd: detail.budgetVnd,
    days: detail.days.map(day => ({ dayNumber: day.dayNumber, activities: day.activities.map(a => ({ id: a.id, placeId: a.place?.id ?? null,
      title: a.title, notes: a.notes, startMinute: a.startMinute, endMinute: a.endMinute, estimatedCostVnd: a.estimatedCostVnd })) })) };
}
async function detail(response: Response, status = 200) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body: unknown = await response.json(); assert.ok(isTripDetail(body));
  const json = JSON.stringify(body); assert.ok(!json.includes('ownerId') && !json.includes('googleSubject') && !json.includes('postgresql://'));
  return body;
}
async function fault(response: Response, status: number, code?: string) {
  assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json() as { error: { code: string; message: string }; path: string };
  if (code) assert.equal(body.error.code, code);
  assert.ok(!JSON.stringify(body).includes('postgresql://') && !JSON.stringify(body).includes('TESTONLY.') && !body.error.message.includes('INSERT'));
}
async function raw(url: string, headers: string[], body: string) {
  return new Promise<{ status: number | undefined; body: string; cache: string | undefined }>((resolve, reject) => {
    const request = httpRequest(url, { method: 'POST', headers: ['Host', new URL(url).host, ...headers] }, response => {
      const parts: Buffer[] = []; response.on('data', (value: Buffer) => parts.push(value));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(parts).toString(), cache: response.headers['cache-control'] }));
      response.on('error', reject);
    });
    request.setTimeout(5000, () => request.destroy(new Error('Owned trip HTTP fixture timeout')));
    request.on('error', reject); request.end(body);
  });
}
async function sanitized(work: () => Promise<void>) {
  let caught: unknown;
  try { await work(); return; } catch (error) { caught = error; }
  if (caught instanceof assert.AssertionError) throw caught;
  throw new Error('Owned trip HTTP/PG fixture failed; private driver details are not printed.');
}

test('Trips HTTP: real PostgreSQL, reviewed auth with identity doubles, atomic retry/version/ownership/restart', { timeout: 240_000 }, async t => sanitized(async () => {
  const cluster = await LocalPostgres.initialize(await fixtureDirectory());
  let op: ReturnType<typeof createDatabaseClient> | undefined;
  const apps = new Set<NestExpressApplication>();
  const sqlClients = new Set<pg.Client>();
  t.after(async () => {
    try {
      const results = await Promise.allSettled([...apps].map(app => app.close()));
      const clients = await Promise.allSettled([...sqlClients].map(client => client.end()));
      await op?.$disconnect();
      assert.ok([...results, ...clients].every(result => result.status === 'fulfilled'), 'owned trip clients/apps close');
    } finally { await cluster.stopIfRunning(); }
  });
  await cluster.start();
  const database = await createIsolatedDatabase(cluster, 'goease_trips');
  await runTool(process.execPath, [path.join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', path.join(apiRoot, 'prisma7.config.ts')],
    { ...process.env, DATABASE_MIGRATION_URL: database.migrationUrl });
  await grantRuntime(database.migrationUrl, database.runtime);
  op = createDatabaseClient(database.migrationUrl);
  await seedCatalog(op);
  async function sql(connectionString: string) {
    const client = new pg.Client({ connectionString }); sqlClients.add(client); await client.connect(); return client;
  }
  async function server() {
    const identities = new TestIdentities();
    const module = await Test.createTestingModule({ imports: [await AppModule.register({ NODE_ENV: 'test', WEB_ORIGINS: origin,
      DATABASE_URL: database.runtimeUrl, GOOGLE_WEB_CLIENT_ID: 'test-client.apps.googleusercontent.com' })] })
      .overrideProvider(GoogleIdentityVerifier).useValue(identities).compile();
    const app = module.createNestApplication<NestExpressApplication>({ logger: false });
    let lostBody: TripDetail | undefined;
    // TEST ONLY: suppress the HTTP response after controller awaited the real COMMIT.
    app.use((request: Request, response: ExpressResponse, next: NextFunction) => {
      if (request.headers['x-test-lose-response'] === 'after-commit') {
        response.json = (body: unknown) => { assert.ok(isTripDetail(body)); lostBody = body; response.socket?.destroy(); return response; };
      }
      next();
    });
    configureApp(app); apps.add(app); await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    const get = (route: string, headers: Record<string, string> = {}) => fetch(`${url}/api/${route}`, { headers });
    const send = (route: string, body: unknown, headers: Record<string, string> = {}, method = 'POST') => fetch(`${url}/api/${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    async function login(subject: string, kind: 'native' | 'web' = 'native') {
      const response = await send(`auth/challenges/${kind}`, {}, kind === 'web' ? { Origin: origin } : {});
      assert.equal(response.status, 201); const challenge: unknown = await response.json(); assert.ok(isAuthChallengeResponse(challenge));
      const token = `TESTONLY.${Buffer.from(randomUUID()).toString('base64url')}.SIGNATURE`;
      identities.identities.set(token, { subject, displayName: 'TEST ONLY trip identity', nonce: challenge.nonce });
      const result = await send(`auth/google/${kind}`, { challengeId: challenge.challengeId, idToken: token }, {
        'X-GoEase-Auth-Proof': challenge.proof, ...(kind === 'web' ? { Origin: origin, Cookie: binding(response, LOGIN_COOKIE) } : {}),
      });
      assert.equal(result.status, 200); const body: unknown = await result.json(); assert.ok(isSessionResponse(body));
      const headers: Record<string, string> = body.transport === 'native' ? { Authorization: `Bearer ${body.accessToken}` } : {
        Cookie: binding(result, SESSION_COOKIE), Origin: origin, 'X-CSRF-Token': body.csrfToken,
      };
      return { body, headers };
    }
    return { app, url, get, send, login, lost: () => lostBody };
  }
  let api = await server();
  const a = await api.login('trip-fixture-A'), b = await api.login('trip-fixture-B'), admin = await api.login('trip-fixture-admin');
  await op.user.update({ where: { id: admin.body.user.id }, data: { role: 'ADMIN' } });
  const post = (body: unknown, key: string = randomUUID(), headers = a.headers) => api.send('trips', body, { ...headers, 'Idempotency-Key': key });
  const put = (id: string, body: unknown, key: string = randomUUID(), headers = a.headers) => api.send(`trips/${id}`, body, { ...headers, 'Idempotency-Key': key }, 'PUT');
  let main!: TripDetail;
  await t.test('create deterministic sample, real date/timezone semantics and private ownership matrix', async () => {
    main = await detail(await post(create()), 201);
    assert.deepEqual(main.days.map(day => day.date), ['2028-02-28', '2028-02-29', '2028-03-01']);
    const catalog = await op!.place.findMany({ orderBy: { code: 'asc' } });
    assert.deepEqual(main.days.map(day => day.activities[0]!.place!.id), catalog.map(place => place.id));
    assert.ok(main.days.every(day => day.activities[0]!.startMinute === null && day.activities[0]!.estimatedCostVnd === null));
    assert.deepEqual(main.totals, { knownSubtotalVnd: 0, unknownCostCount: 3, estimatedTotalVnd: null });
    for (const headers of [b.headers, admin.headers]) {
      await fault(await api.get(`trips/${main.id}`, headers), 404, 'TRIP_NOT_FOUND');
      await fault(await put(main.id, editable(main), randomUUID(), headers), 404, 'TRIP_NOT_FOUND');
      const list = await api.get('trips', headers); assert.equal(list.status, 200); assert.deepEqual((await list.json() as { trips: unknown[] }).trips, []);
    }
    await fault(await api.get(`trips/${main.id}`), 401);
    await fault(await post({ ...create(), ownerId: b.body.user.id }), 400, 'TRIP_INVALID_REQUEST');
    await fault(await put(main.id, { ...editable(main), role: 'ADMIN' }), 400, 'TRIP_INVALID_REQUEST');
    const cross = await detail(await post(create({ startDate: '2026-12-29', durationDays: 5 })), 201);
    assert.equal(cross.days[4]!.date, '2027-01-02');
    assert.equal((await detail(await post(create({ startDate: '2099-12-27', durationDays: 5 })), 201)).days[4]!.date, '2099-12-31');
    for (const patch of [{ startDate: '2026-02-29' }, { startDate: '2026-04-31' }, { startDate: '2099-12-28', durationDays: 5 },
      { startDate: '1999-12-31' }, { startDate: '2026-10-11T00:00:00Z' }, { durationDays: 0 }, { durationDays: 6 }, { durationDays: 1.5 },
      { groupSize: 0 }, { groupSize: 51 }, { budgetVnd: -1 }, { budgetVnd: 0.5 }, { budgetVnd: MAX_AMOUNT_VND + 1 }, { budgetVnd: '10' }]) {
      await fault(await post({ ...create(), ...patch }), 400, 'TRIP_INVALID_REQUEST');
    }
    const changed = editable(main); changed.days[0]!.activities[0]!.startMinute = 1410; changed.days[0]!.activities[0]!.endMinute = 1440;
    main = await detail(await put(main.id, changed));
    assert.equal(main.days[0]!.date, '2028-02-28'); assert.equal(main.days[0]!.activities[0]!.endMinute, 1440);
  });
  await t.test('retained child IDs move/reorder/delete, immutable days, invalid foreign IDs and strict times', async () => {
    const foreign = await detail(await post(create({ durationDays: 1 }), randomUUID(), b.headers), 201);
    for (const body of [{ ...editable(main), startDate: '2029-01-01' }, { ...editable(main), days: editable(main).days.slice(0, 1) }]) {
      await fault(await put(main.id, body), 400, 'TRIP_INVALID_REQUEST');
    }
    const original = structuredClone(main), dto = editable(main);
    const moved = dto.days[0]!.activities.pop()!; dto.days[1]!.activities.unshift(moved);
    dto.days[1]!.activities.reverse(); dto.days[2]!.activities = [];
    dto.days[1]!.activities.push(activity({ title: 'Tự nhập mới', estimatedCostVnd: 0 }));
    main = await detail(await put(main.id, dto));
    assert.deepEqual(main.days.map(day => day.id), original.days.map(day => day.id));
    assert.equal(main.days[1]!.activities[1]!.id, moved.id); assert.equal(main.days[2]!.activities.length, 0);
    assert.deepEqual(main.days[1]!.activities.map(a => a.position), [0, 1, 2]);
    const bad = editable(main); bad.days[0]!.activities = [activity({ id: foreign.days[0]!.activities[0]!.id })];
    await fault(await put(main.id, bad), 400, 'TRIP_INVALID_REQUEST');
    bad.days[0]!.activities = [activity({ id: randomUUID() })]; await fault(await put(main.id, bad), 400, 'TRIP_INVALID_REQUEST');
    const duplicate = editable(main); duplicate.days[0]!.activities = [{ ...duplicate.days[1]!.activities[0]!, id: duplicate.days[1]!.activities[0]!.id!.toUpperCase() }];
    await fault(await put(main.id, duplicate), 400, 'TRIP_INVALID_REQUEST');
    for (const patch of [{ startMinute: 10, endMinute: null }, { startMinute: 10, endMinute: 10 }, { startMinute: -1, endMinute: 20 },
      { startMinute: 0, endMinute: 1441 }, { estimatedCostVnd: 0.1 }, { estimatedCostVnd: MAX_AMOUNT_VND + 1 }]) {
      const body = editable(main); body.days[0]!.activities = [activity(patch)]; await fault(await put(main.id, body), 400, 'TRIP_INVALID_REQUEST');
    }
    assert.deepEqual(await detail(await api.get(`trips/${main.id}`, a.headers)), main);
  });
  await t.test('group totals preserve null versus zero, overlap warnings, 250-item maximum and no group multiplier', async () => {
    let trip = await detail(await post(create({ durationDays: 5, budgetVnd: 0 })), 201);
    const dto = editable(trip);
    dto.days.forEach(day => { day.activities = Array.from({ length: 50 }, () => activity({ estimatedCostVnd: MAX_AMOUNT_VND })); });
    trip = await detail(await put(trip.id, dto));
    assert.equal(trip.totals.estimatedTotalVnd, 250_000_000_000_000); assert.deepEqual(trip.warnings, [{ code: 'BUDGET_EXCEEDED' }]);
    const group = editable(trip); group.groupSize = 50;
    trip = await detail(await put(trip.id, group)); assert.equal(trip.totals.estimatedTotalVnd, 250_000_000_000_000);
    const mixed = editable(trip); mixed.days.forEach(day => { day.activities = []; });
    mixed.days[0]!.activities = [activity({ estimatedCostVnd: 0, startMinute: 0, endMinute: 60 }), activity({ startMinute: 59, endMinute: 120 })];
    trip = await detail(await put(trip.id, mixed));
    assert.deepEqual(trip.totals, { knownSubtotalVnd: 0, unknownCostCount: 1, estimatedTotalVnd: null });
    assert.deepEqual(trip.warnings, [{ code: 'ACTIVITY_OVERLAP', dayNumber: 1 }]);
    const tooMany = editable(trip); tooMany.days[0]!.activities = Array.from({ length: 51 }, () => activity());
    await fault(await put(trip.id, tooMany), 400, 'TRIP_INVALID_REQUEST');
  });
  await t.test('full valid 250-activity UTF-8 notes/title payload fits the trip-only 1536KiB limit', async () => {
    const trip = await detail(await post(create({ durationDays: 5 })), 201), body = editable(trip);
    const notes = `\n\r\t${'🧳'.repeat(997)}`;
    body.days.forEach(day => { day.activities = Array.from({ length: 50 }, () => activity({ title: '🧳'.repeat(160), notes, estimatedCostVnd: 0 })); });
    const bytes = Buffer.byteLength(JSON.stringify(body)); assert.ok(bytes > 256 * 1024 && bytes < 1536 * 1024);
    const saved = await detail(await put(trip.id, body));
    assert.equal(saved.days.flatMap(day => day.activities).length, 250);
    assert.ok(saved.days.every(day => day.activities.every(a => a.notes === notes && [...a.title].length === 160)));
    assert.equal(saved.totals.estimatedTotalVnd, 0);
  });
  await t.test('same-key create/update races replay once; different-key CAS has one winner; hash normalizes titles/UUID case', async () => {
    const key = randomUUID(), body = create({ durationDays: 1 });
    const count = await op!.trip.count();
    const gate = await sql(database.migrationUrl), monitor = await sql(cluster.url(database.databaseName));
    let requests: Array<Promise<Response>> = [];
    let results!: Response[];
    // Owned fixture-only trigger: both real aggregates reach receipt INSERT
    // before either can commit. This proves the compound P2002 loser path,
    // rather than a second request merely observing a pre-existing receipt.
    await gate.query('CREATE FUNCTION fixture_receipt_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(7904255); RETURN NEW; END $$');
    await gate.query('CREATE TRIGGER fixture_receipt_gate BEFORE INSERT ON "IdempotencyRecord" FOR EACH ROW EXECUTE FUNCTION fixture_receipt_gate()');
    await gate.query('SELECT pg_advisory_lock(7904255)');
    try {
      requests = [post(body, key), post({ ...body, title: ` ${body.title} ` }, key.toUpperCase())];
      let waiting = 0;
      for (let i = 0; i < 100; i++) {
        const rows = await monitor.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND wait_event_type=\'Lock\' AND query LIKE \'%IdempotencyRecord%\'', [database.databaseName]);
        waiting = rows.rows[0].count as number; if (waiting === 2) break; await delay(10);
      }
      assert.equal(waiting, 2, 'both transactions must reach the real receipt INSERT before commit');
      await gate.query('SELECT pg_advisory_unlock(7904255)'); results = await Promise.all(requests);
    } finally {
      await gate.query('SELECT pg_advisory_unlock(7904255)'); await Promise.allSettled(requests);
      await gate.query('DROP TRIGGER fixture_receipt_gate ON "IdempotencyRecord"'); await gate.query('DROP FUNCTION fixture_receipt_gate()');
      await gate.end(); sqlClients.delete(gate); await monitor.end(); sqlClients.delete(monitor);
    }
    const saved = await Promise.all(results.map(response => detail(response, 201)));
    assert.deepEqual(saved[0], saved[1]); assert.equal(await op!.trip.count(), count + 1);
    await fault(await post({ ...body, groupSize: 3 }, key), 409, 'TRIP_IDEMPOTENCY_CONFLICT');
    let trip = saved[0]!, dto = editable(trip); dto.title = 'Concurrent save';
    const saveKey = randomUUID(); const same = await Promise.all([put(trip.id, dto, saveKey), put(trip.id.toUpperCase(), dto, saveKey.toUpperCase())]);
    const updated = await Promise.all(same.map(response => detail(response))); assert.deepEqual(updated[0], updated[1]);
    trip = updated[0]!; dto = editable(trip);
    const competing = await Promise.all([put(trip.id, { ...dto, title: 'A wins or loses' }), put(trip.id, { ...dto, title: 'B wins or loses' })]);
    assert.deepEqual(competing.map(response => response.status).sort(), [200, 409]);
    await fault(competing.find(response => response.status === 409)!, 409, 'TRIP_VERSION_CONFLICT');
    const winner = await detail(competing.find(response => response.status === 200)!); assert.equal(winner.version, trip.version + 1);
    await op!.trip.update({ where: { id: winner.id }, data: { version: 2_147_483_647 } });
    await fault(await put(winner.id, { ...editable(winner), expectedVersion: 2_147_483_647 }), 409, 'TRIP_VERSION_LIMIT');
  });
  await t.test('historical PUT receipt replays before deleted-child/version/inactive-Place validation', async () => {
    let trip = await detail(await post(create({ durationDays: 1 })), 201);
    const body = editable(trip), key = randomUUID(); body.days[0]!.activities[0]!.notes = 'Original committed snapshot';
    const snapshot = await detail(await put(trip.id, body, key));
    const placeId = snapshot.days[0]!.activities[0]!.place!.id;
    const clear = editable(snapshot); clear.days[0]!.activities = [];
    trip = await detail(await put(trip.id, clear));
    await op!.place.update({ where: { id: placeId }, data: { active: false } });
    try {
      assert.deepEqual(await detail(await put(trip.id, body, key)), snapshot);
      assert.equal((await detail(await api.get(`trips/${trip.id}`, a.headers))).version, trip.version);
      await fault(await put(trip.id, { ...body, title: 'Changed after successful save' }, key), 409, 'TRIP_IDEMPOTENCY_CONFLICT');
      const fresh = editable(trip); fresh.days[0]!.activities = [activity({ placeId })];
      await fault(await put(trip.id, fresh), 409, 'TRIP_PLACE_UNAVAILABLE');
    } finally { await op!.place.update({ where: { id: placeId }, data: { active: true } }); }
  });
  await t.test('actual pinned PG adapter receipt P2002 is recognized; actual child unique violation is not', async () => {
    const key = randomUUID();
    const trip = await detail(await post(create({ durationDays: 1 }), key), 201);
    const record = await op!.idempotencyRecord.findUniqueOrThrow({ where: { userId_operation_key: { userId: a.body.user.id, operation: 'trip.create', key } } });
    let receiptCollision: unknown, childCollision: unknown;
    try { await op!.idempotencyRecord.create({ data: { ...record, responseBody: record.responseBody as Prisma.InputJsonValue } }); }
    catch (error) { receiptCollision = error; }
    assert.equal(isReceiptRace(receiptCollision), true, 'real PG23505 receipt descriptor must be recognized without reading its message');
    try { await op!.tripDay.create({ data: { tripId: trip.id, dayNumber: 1 } }); }
    catch (error) { childCollision = error; }
    assert.ok(childCollision, 'real child unique violation must occur');
    assert.equal(isReceiptRace(childCollision), false, 'a different actual PG unique violation must never replay a receipt');
    assert.equal(await op!.idempotencyRecord.count({ where: { key } }), 1);
    assert.deepEqual(await detail(await api.get(`trips/${trip.id}`, a.headers)), trip);
  });
  await t.test('empty template fails without writes; original create replays before current catalog availability', async () => {
    const key = randomUUID(), body = create({ durationDays: 1 });
    const snapshot = await detail(await post(body, key), 201), count = await op!.trip.count();
    await op!.place.updateMany({ data: { active: false } });
    try {
      await fault(await post(body), 503, 'TRIP_TEMPLATE_UNAVAILABLE');
      assert.equal(await op!.trip.count(), count); assert.deepEqual(await detail(await post(body, key), 201), snapshot);
    } finally { await seedCatalog(op!); }
  });
  await t.test('new/changed Place references require same sample destination and active catalog rows', async () => {
    const trip = await detail(await post(create({ durationDays: 1 })), 201);
    const other = (await op!.place.findMany({ where: { id: { not: trip.days[0]!.activities[0]!.place!.id } }, orderBy: { id: 'asc' } }))[0]!;
    for (const patch of [{ active: false }, { isSample: false }, { destinationCode: 'ANOTHER-DESTINATION' }]) {
      await op!.place.update({ where: { id: other.id }, data: patch });
      try {
        const body = editable(trip); body.days[0]!.activities[0]!.placeId = other.id;
        await fault(await put(trip.id, body), 409, 'TRIP_PLACE_UNAVAILABLE');
        assert.equal((await detail(await api.get(`trips/${trip.id}`, a.headers))).version, trip.version);
      } finally { await seedCatalog(op!); }
    }
    const missing = editable(trip); missing.days[0]!.activities.push(activity({ placeId: randomUUID() }));
    await fault(await put(trip.id, missing), 409, 'TRIP_PLACE_UNAVAILABLE');
  });
  await t.test('inactive retained Place allowed, new inactive reference denied, sorted FOR SHARE blocks non-key catalog update', async () => {
    let trip = await detail(await post(create({ durationDays: 1 })), 201);
    const placeId = trip.days[0]!.activities[0]!.place!.id;
    await op!.place.update({ where: { id: placeId }, data: { active: false } });
    try {
      trip = await detail(await put(trip.id, { ...editable(trip), title: 'Retained inactive place' }));
      assert.equal(trip.days[0]!.activities[0]!.place!.active, false);
      const body = editable(trip); body.days[0]!.activities.push(activity({ placeId }));
      await fault(await put(trip.id, body), 409, 'TRIP_PLACE_UNAVAILABLE');
    } finally { await op!.place.update({ where: { id: placeId }, data: { active: true } }); }
    const lock = await sql(database.migrationUrl), monitor = await sql(cluster.url(database.databaseName));
    let pending: Promise<Response> | undefined;
    await lock.query('BEGIN');
    try {
      await lock.query('UPDATE "Place" SET active=false WHERE id=$1', [placeId]);
      const body = editable(trip); body.days[0]!.activities = [activity({ placeId })];
      pending = put(trip.id, body);
      let observed = false;
      for (let i = 0; i < 100; i++) {
        const rows = await monitor.query('SELECT query FROM pg_stat_activity WHERE datname=$1 AND wait_event_type=\'Lock\' AND query LIKE \'%FOR SHARE%\'', [database.databaseName]);
        if (rows.rowCount) { observed = true; break; } await delay(10);
      }
      assert.equal(observed, true, 'real API Place FOR SHARE must wait for a non-key UPDATE');
      await lock.query('COMMIT'); await fault(await pending, 409, 'TRIP_PLACE_UNAVAILABLE'); pending = undefined;
      assert.deepEqual(await detail(await api.get(`trips/${trip.id}`, a.headers)), { ...trip, days: trip.days.map(day => ({ ...day,
        activities: day.activities.map(a => ({ ...a, place: a.place ? { ...a.place, active: false } : null })) })) });
    } finally {
      await lock.query('ROLLBACK'); if (pending) await pending;
      await op!.place.update({ where: { id: placeId }, data: { active: true } });
      await lock.end(); sqlClients.delete(lock); await monitor.end(); sqlClients.delete(monitor);
    }
  });
  await t.test('receipt INSERT permission fault after CAS/child replacement rolls back everything; SAME key then succeeds', async () => {
    const trip = await detail(await post(create({ durationDays: 1 })), 201), body = editable(trip), key = randomUUID();
    body.days[0]!.activities = [activity({ title: 'Should roll back' })];
    const migration = await sql(database.migrationUrl);
    await migration.query(`REVOKE INSERT ON "IdempotencyRecord" FROM ${database.runtime}`);
    try {
      await fault(await put(trip.id, body, key), 500, 'INTERNAL_ERROR');
      assert.deepEqual(await detail(await api.get(`trips/${trip.id}`, a.headers)), trip);
      assert.equal(await op!.idempotencyRecord.count({ where: { key } }), 0);
    } finally { await migration.query(`GRANT INSERT ON "IdempotencyRecord" TO ${database.runtime}`); await migration.end(); sqlClients.delete(migration); }
    const saved = await detail(await put(trip.id, body, key)); assert.equal(saved.version, trip.version + 1);
    assert.equal(saved.days[0]!.activities[0]!.title, 'Should roll back');
  });
  await t.test('repeatable-read detail stays internally old while operator commits new parent/child, then GET is new', async () => {
    const trip = await detail(await post(create({ durationDays: 1 })), 201);
    const lock = await sql(database.migrationUrl), monitor = await sql(cluster.url(database.databaseName));
    let pending: Promise<Response> | undefined;
    await lock.query('BEGIN');
    try {
      await lock.query('LOCK TABLE "Activity" IN ACCESS EXCLUSIVE MODE');
      pending = api.get(`trips/${trip.id}`, a.headers);
      let observed = false;
      for (let i = 0; i < 100; i++) {
        const rows = await monitor.query('SELECT query FROM pg_stat_activity WHERE datname=$1 AND wait_event_type=\'Lock\' AND query LIKE \'%Activity%\'', [database.databaseName]);
        if (rows.rowCount) { observed = true; break; } await delay(10);
      }
      assert.equal(observed, true, 'real detail must be blocked at activity read');
      await lock.query('UPDATE "Trip" SET title=\'New parent\',version=version+1 WHERE id=$1', [trip.id]);
      await lock.query('UPDATE "Activity" SET title=\'New child\' WHERE id=$1', [trip.days[0]!.activities[0]!.id]);
      await lock.query('COMMIT');
      assert.deepEqual(await detail(await pending), trip); pending = undefined;
      const current = await detail(await api.get(`trips/${trip.id}`, a.headers));
      assert.equal(current.title, 'New parent'); assert.equal(current.days[0]!.activities[0]!.title, 'New child'); assert.equal(current.version, trip.version + 1);
    } finally { await lock.query('ROLLBACK'); if (pending) await pending; await lock.end(); sqlClients.delete(lock); await monitor.end(); sqlClients.delete(monitor); }
  });
  await t.test('list stable timestamp/id cursor, strict bounds and no private trips', async () => {
    const stamp = new Date('2026-10-11T12:00:00.000Z');
    await op!.trip.updateMany({ where: { ownerId: a.body.user.id }, data: { updatedAt: stamp } });
    const expected = (await op!.trip.findMany({ where: { ownerId: a.body.user.id }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] })).map(row => row.id);
    const ids: string[] = []; let query = 'trips?limit=2';
    for (let i = 0; i < 30; i++) {
      const response = await api.get(query, a.headers); assert.equal(response.status, 200); const body: unknown = await response.json(); assert.ok(isTripListResponse(body));
      ids.push(...body.trips.map(trip => trip.id));
      if (!body.nextCursor) break;
      query = `trips?limit=2&cursorUpdatedAt=${encodeURIComponent(body.nextCursor.updatedAt)}&cursorId=${body.nextCursor.id.toUpperCase()}`;
    }
    assert.deepEqual(ids, expected);
    for (const query of ['limit=0', 'limit=51', 'limit=1.5', 'limit=2%0A', 'limit=2&limit=3', 'ownerId=x', 'cursorId=x', 'cursorUpdatedAt=2026-10-11', 'cursorId=x&cursorUpdatedAt=x']) {
      await fault(await api.get(`trips?${query}`, a.headers), 400, 'TRIP_INVALID_REQUEST');
    }
  });
  await t.test('parser/header/CSRF/Origin/preflight safety preserves auth 24KiB while accepting large valid trip', async () => {
    const before = await op!.trip.count();
    for (const key of [undefined, 'not-uuid']) await fault(await api.send('trips', create(), { ...a.headers, ...(key ? { 'Idempotency-Key': key } : {}) }), 400, 'TRIP_INVALID_REQUEST');
    for (const body of ['{', JSON.stringify({ payload: 'x'.repeat(1536 * 1024) })]) {
      const response = await fetch(`${api.url}/api/trips`, { method: 'POST', headers: { ...a.headers, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body });
      await fault(response, body === '{' ? 400 : 413);
    }
    const duplicate = await raw(`${api.url}/api/trips`, ['Authorization', a.headers['Authorization']!, 'Content-Type', 'application/json',
      'Idempotency-Key', randomUUID(), 'Idempotency-Key', randomUUID()], JSON.stringify(create()));
    assert.equal(duplicate.status, 400); assert.equal(duplicate.cache, 'no-store'); assert.ok(!duplicate.body.includes('postgresql://'));
    await fault(await api.send('auth/challenges/native', { payload: 'x'.repeat(25 * 1024) }), 413);
    assert.equal(await op!.trip.count(), before);
    const web = await api.login('trip-fixture-web', 'web');
    const cookieOnly = { Cookie: web.headers['Cookie']! };
    await fault(await post(create(), randomUUID(), cookieOnly), 403, 'ORIGIN_FORBIDDEN');
    await fault(await post(create(), randomUUID(), { ...cookieOnly, Origin: origin }), 403, 'CSRF_INVALID');
    await fault(await post(create(), randomUUID(), { ...web.headers, Origin: 'https://wrong.example' }), 403, 'ORIGIN_FORBIDDEN');
    const trip = await detail(await post(create({ durationDays: 1 }), randomUUID(), web.headers), 201);
    await fault(await put(trip.id, editable(trip), randomUUID(), { ...cookieOnly, Origin: origin }), 403, 'CSRF_INVALID');
    assert.equal((await detail(await put(trip.id, editable(trip), randomUUID(), web.headers))).version, 2);
    const preflight = await fetch(`${api.url}/api/trips/${trip.id}`, { method: 'OPTIONS', headers: { Origin: origin,
      'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'Content-Type,Idempotency-Key,X-CSRF-Token' } });
    assert.equal(preflight.status, 204); assert.ok(preflight.headers.get('access-control-allow-methods')?.includes('PUT'));
    assert.ok(preflight.headers.get('access-control-allow-headers')?.includes('Idempotency-Key'));
  });
  await t.test('expired/revoked/disabled/current admin roles cannot bypass trip auth or replay', async () => {
    const expired = await api.login('trip-fixture-expired'), revoked = await api.login('trip-fixture-revoked'), disabled = await api.login('trip-fixture-disabled');
    await op!.session.updateMany({ where: { userId: expired.body.user.id }, data: { createdAt: new Date(Date.now() - 10_000), expiresAt: new Date(Date.now() - 1000) } });
    await op!.session.updateMany({ where: { userId: revoked.body.user.id }, data: { revokedAt: new Date() } });
    await op!.user.update({ where: { id: disabled.body.user.id }, data: { disabledAt: new Date() } });
    for (const headers of [expired.headers, revoked.headers, disabled.headers]) {
      await fault(await api.get('trips', headers), 401); await fault(await post(create(), randomUUID(), headers), 401);
      await fault(await api.get(`trips/${main.id}`, headers), 401);
    }
    const key = randomUUID(); await detail(await post(create({ durationDays: 1 }), key), 201);
    await op!.user.update({ where: { id: a.body.user.id }, data: { disabledAt: new Date() } });
    try { await fault(await post(create({ durationDays: 1 }), key), 401); }
    finally { await op!.user.update({ where: { id: a.body.user.id }, data: { disabledAt: null } }); }
  });
  await t.test('after-COMMIT lost response survives API and PostgreSQL restart and replays original 201', async () => {
    const key = randomUUID(), body = create({ durationDays: 1 });
    await assert.rejects(post(body, key, { ...a.headers, 'X-Test-Lose-Response': 'after-commit' }));
    const snapshot = api.lost(); assert.ok(snapshot); assert.equal(await op!.idempotencyRecord.count({ where: { key } }), 1);
    await api.app.close(); apps.delete(api.app); await op!.$disconnect();
    await cluster.restart(); op = createDatabaseClient(database.migrationUrl); api = await server();
    assert.deepEqual(await detail(await post(body, key), 201), snapshot);
    const latest = editable(snapshot); latest.days[0]!.activities = [];
    await detail(await put(snapshot.id, latest));
    assert.deepEqual(await detail(await post(body, key), 201), snapshot);
    assert.equal((await detail(await api.get(`trips/${snapshot.id}`, a.headers))).version, 2);
  });
}));
