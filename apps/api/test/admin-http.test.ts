import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { isAdminPlacesResponse, isAuthChallengeResponse, isSessionResponse, type AuthChallengeResponse } from '@goease/contracts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.js';
import { ApiFault } from '../src/common/api-fault.js';
import { createDatabaseClient } from '../src/database/client.js';
import { samplePlaces, seedCatalog } from '../src/database/seed.js';
import { AdminModule } from '../src/modules/admin/admin.module.js';
import { GoogleIdentityVerifier, type VerifiedGoogleIdentity } from '../src/modules/auth/google-verifier.js';
import { LOGIN_COOKIE, SESSION_COOKIE } from '../src/modules/auth/http.js';
import { createIsolatedDatabase, fixtureDirectory, grantRuntime, LocalPostgres, runTool } from './helpers/postgres.js';

const origin = 'https://admin.test.example';
// Only the external Google verifier is doubled. Session/auth/guards/HTTP/PG are real.
class TestIdentityVerifier extends GoogleIdentityVerifier {
  readonly identities = new Map<string, VerifiedGoogleIdentity>();
  async verify(token: string) {
    const identity = this.identities.get(token);
    if (!identity) throw new ApiFault('AUTH_INVALID_IDENTITY', 401);
    return identity;
  }
  token(challenge: AuthChallengeResponse, subject: string) {
    const token = `TESTONLY.${Buffer.from(randomUUID()).toString('base64url')}.SIGNATURE`;
    this.identities.set(token, { subject, nonce: challenge.nonce, displayName: 'TEST ONLY admin fixture' });
    return token;
  }
}
function responseCookie(response: Response, name: string) {
  const value = response.headers.getSetCookie().find(value => value.startsWith(`${name}=`));
  assert.ok(value, 'Expected fixture cookie'); return value.split(';')[0]!;
}
async function sanitized(work: () => Promise<void>) {
  let caught: unknown;
  try { await work(); return; } catch (error) { caught = error; }
  if (caught instanceof assert.AssertionError) throw caught;
  throw new Error('Owned admin fixture failed; private database/driver details remain local.');
}

test('Admin read-only sample Places use current server role with isolated real PostgreSQL', { timeout: 120_000 }, async t => sanitized(async () => {
  const cluster = await LocalPostgres.initialize(await fixtureDirectory());
  const owned: { app?: NestExpressApplication; operator?: ReturnType<typeof createDatabaseClient> } = {};
  t.after(async () => {
    try {
      const results = await Promise.allSettled([owned.app?.close(), owned.operator?.$disconnect()]);
      assert.ok(results.every(result => result.status === 'fulfilled'), 'Owned admin clients/app close');
    } finally { await cluster.stopIfRunning(); }
  });
  await cluster.start();
  const database = await createIsolatedDatabase(cluster, 'goease_admin');
  const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
  await runTool(process.execPath, [path.join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', path.join(apiRoot, 'prisma7.config.ts')],
    { ...process.env, DATABASE_MIGRATION_URL: database.migrationUrl });
  await grantRuntime(database.migrationUrl, database.runtime);
  const db = owned.operator = createDatabaseClient(database.migrationUrl); await seedCatalog(db);
  const verifier = new TestIdentityVerifier();
  const module = await Test.createTestingModule({ imports: [await AppModule.register({ NODE_ENV: 'test', WEB_ORIGINS: origin,
    DATABASE_URL: database.runtimeUrl, GOOGLE_WEB_CLIENT_ID: 'test-client.apps.googleusercontent.com' }), AdminModule] })
    .overrideProvider(GoogleIdentityVerifier).useValue(verifier).compile();
  const app = owned.app = module.createNestApplication<NestExpressApplication>({ logger: false }); configureApp(app); await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const get = (route = 'admin/places', headers: Record<string, string> = {}) => fetch(`${url}/api/${route}`, { headers });
  const post = (route: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${url}/api/${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  async function login(subject: string, transport: 'web' | 'native' = 'web') {
    const challengeResponse = await post(`auth/challenges/${transport}`, {}, transport === 'web' ? { Origin: origin } : {});
    assert.equal(challengeResponse.status, 201);
    const challenge: unknown = await challengeResponse.json(); assert.ok(isAuthChallengeResponse(challenge));
    const exchange = await post(`auth/google/${transport}`, { challengeId: challenge.challengeId, idToken: verifier.token(challenge, subject) }, {
      'X-GoEase-Auth-Proof': challenge.proof, ...(transport === 'web' ? { Origin: origin, Cookie: responseCookie(challengeResponse, LOGIN_COOKIE) } : {}),
    });
    assert.equal(exchange.status, 200); const session: unknown = await exchange.json(); assert.ok(isSessionResponse(session));
    const headers: Record<string, string> = session.transport === 'web' ? { Cookie: responseCookie(exchange, SESSION_COOKIE) } : { Authorization: `Bearer ${session.accessToken}` };
    return { session, headers };
  }
  async function fault(response: Response, status: number, code: string) {
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
    const value = await response.json() as { error: { code: string } }; assert.equal(value.error.code, code);
    const text = JSON.stringify(value);
    for (const privateValue of ['TESTONLY.', 'TEST_ONLY_PRIVATE', database.runtimeUrl, database.migrationUrl]) assert.equal(text.includes(privateValue), false);
  }
  const customer = await login('TEST-ADMIN-CUSTOMER'), admin = await login('TEST-ADMIN-EMPLOYEE');
  assert.equal(admin.session.user.role, 'CUSTOMER', 'Login never provisions admin');
  await db.user.update({ where: { id: admin.session.user.id }, data: { role: 'ADMIN' } });

  await t.test('anonymous/customer A+B/forged cookie or role-owner headers cannot access catalog', () => sanitized(async () => {
    await fault(await get(), 401, 'SESSION_REQUIRED');
    await fault(await get('admin/places', { 'X-Role': 'ADMIN', 'X-Owner-Id': admin.session.user.id }), 401, 'SESSION_REQUIRED');
    await fault(await get('admin/places', { Cookie: `${SESSION_COOKIE}=${'A'.repeat(43)}`, 'X-Role': 'ADMIN' }), 401, 'SESSION_REQUIRED');
    await fault(await get('admin/places?role=ADMIN&ownerId=' + admin.session.user.id, customer.headers), 403, 'ADMIN_REQUIRED');
    const second = await login('TEST-ADMIN-CUSTOMER-B', 'native');
    await fault(await get('admin/places', { ...second.headers, 'X-Role': 'ADMIN', 'X-Owner-Id': admin.session.user.id }), 403, 'ADMIN_REQUIRED');
  }));
  await t.test('server-granted admin reads only actual sample/destination projection, including inactive rows', () => sanitized(async () => {
    const base = await db.place.findUniqueOrThrow({ where: { code: samplePlaces[0].code } });
    await db.place.update({ where: { id: base.id }, data: { active: false } });
    const hidden = await db.place.create({ data: { code: 'TEST_PRIVATE_CATALOG', destinationCode: 'VN-HANOI-SAMPLE', name: 'TEST_ONLY_PRIVATE_PLACE', latitude: '21', longitude: '105',
      sourceUrl: 'https://www.wikidata.org/w/index.php?title=Q1&oldid=1', attribution: 'TEST ONLY', isSample: false } });
    const elsewhere = await db.place.create({ data: { code: 'sample-wikidata-Q999', destinationCode: 'VN-OTHER-TEST', name: 'TEST_ONLY_PRIVATE_DESTINATION', latitude: '21', longitude: '105',
      sourceUrl: 'https://www.wikidata.org/w/index.php?title=Q999&oldid=1', attribution: 'TEST ONLY', isSample: true } });
    try {
      const response = await get('admin/places', admin.headers); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      const body: unknown = await response.json(); assert.ok(isAdminPlacesResponse(body));
      const expected = await db.place.findMany({ where: { destinationCode: 'VN-HANOI-SAMPLE', isSample: true }, orderBy: [{ code: 'asc' }, { id: 'asc' }] });
      assert.deepEqual(body.places.map(place => place.id), expected.map(row => row.id));
      assert.deepEqual(body.places.map(place => [place.name, place.latitude, place.longitude, place.sourceUrl, place.attribution, place.isActive]),
        expected.map(row => [row.name, row.latitude.toNumber(), row.longitude.toNumber(), row.sourceUrl, row.attribution, row.active]));
      assert.equal(body.places.find(place => place.id === base.id)?.isActive, false);
      assert.equal(JSON.stringify(body).includes('TEST_ONLY_PRIVATE'), false);
      await fault(await get('admin/places?ownerId=' + customer.session.user.id, admin.headers), 400, 'ADMIN_INVALID_REQUEST');
      assert.equal((await post('admin/places', { role: 'ADMIN', name: 'TEST_ONLY_MUTATION' }, admin.headers)).status, 404);
      assert.equal(await db.place.count({ where: { name: 'TEST_ONLY_MUTATION' } }), 0);
    } finally { await db.place.deleteMany({ where: { id: { in: [hidden.id, elsewhere.id] } } }); await seedCatalog(db); }
  }));
  await t.test('catalog stays usable with SELECT Trip revoked; no private trip capability is introduced', () => sanitized(async () => {
    const privateTrip = await db.trip.create({ data: { ownerId: customer.session.user.id, title: 'TEST_ONLY_PRIVATE_TRIP', destinationCode: 'VN-HANOI-SAMPLE', isSample: true,
      startDate: new Date('2026-10-11T00:00:00.000Z'), durationDays: 1, groupSize: 2, budgetVnd: null, days: { create: { dayNumber: 1 } } } });
    assert.match(database.runtime, /^goease_[a-z0-9_]+_app$/);
    await db.$executeRawUnsafe(`REVOKE SELECT ON "Trip" FROM ${database.runtime}`);
    try {
      const response = await get('admin/places', admin.headers); assert.equal(response.status, 200);
      const body: unknown = await response.json(); assert.ok(isAdminPlacesResponse(body));
      assert.equal(JSON.stringify(body).includes(privateTrip.id), false); assert.equal(JSON.stringify(body).includes(privateTrip.title), false);
      await fault(await get(`admin/trips/${privateTrip.id}`, admin.headers), 404, 'NOT_FOUND');
    } finally { await db.$executeRawUnsafe(`GRANT SELECT ON "Trip" TO ${database.runtime}`); await db.trip.delete({ where: { id: privateTrip.id } }); }
  }));
  await t.test('demotion and promotion take effect on the same cookie without trusting prior client role', () => sanitized(async () => {
    await db.user.update({ where: { id: admin.session.user.id }, data: { role: 'CUSTOMER' } });
    await fault(await get('admin/places', admin.headers), 403, 'ADMIN_REQUIRED');
    await db.user.update({ where: { id: admin.session.user.id }, data: { role: 'ADMIN' } });
    assert.equal((await get('admin/places', admin.headers)).status, 200);
    if (admin.session.transport !== 'web') throw new Error('Expected web fixture');
    const logout = await post('auth/logout', {}, { ...admin.headers, Origin: origin, 'X-CSRF-Token': admin.session.csrfToken });
    assert.equal(logout.status, 204); await fault(await get('admin/places', admin.headers), 401, 'SESSION_REQUIRED');
  }));
  await t.test('expired/revoked/disabled admin sessions fail despite client role; native admin uses same guards', () => sanitized(async () => {
    for (const reason of ['expired', 'revoked', 'disabled'] as const) {
      const session = await login(`TEST-ADMIN-${reason}`, 'native');
      await db.user.update({ where: { id: session.session.user.id }, data: { role: 'ADMIN', ...(reason === 'disabled' ? { disabledAt: new Date() } : {}) } });
      if (reason === 'expired') await db.session.updateMany({ where: { userId: session.session.user.id }, data: { createdAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 1000) } });
      if (reason === 'revoked') await db.session.updateMany({ where: { userId: session.session.user.id }, data: { revokedAt: new Date() } });
      await fault(await get('admin/places', { ...session.headers, 'X-Role': 'ADMIN' }), 401, 'SESSION_REQUIRED');
    }
    const native = await login('TEST-ADMIN-NATIVE', 'native'); await db.user.update({ where: { id: native.session.user.id }, data: { role: 'ADMIN' } });
    assert.equal((await get('admin/places', native.headers)).status, 200);
    await fault(await get('admin/places', { ...native.headers, Origin: origin }), 401, 'SESSION_REQUIRED');
  }));
  await t.test('invalid DB provenance fails closed with no private diagnostics', () => sanitized(async () => {
    const native = await login('TEST-ADMIN-INVALID-CATALOG', 'native'); await db.user.update({ where: { id: native.session.user.id }, data: { role: 'ADMIN' } });
    try {
      await db.place.update({ where: { code: samplePlaces[0].code }, data: { sourceUrl: 'https://private.invalid/TEST_ONLY_PRIVATE_DIAGNOSTIC' } });
      await fault(await get('admin/places', native.headers), 503, 'ADMIN_CATALOG_UNAVAILABLE');
    } finally { await seedCatalog(db); }
  }));
}));
