import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { isAuthChallengeResponse, isSampleMapCatalog, isSampleRouteResult, isSessionResponse, type SampleMapCatalog, type SampleRouteResult } from '@goease/contracts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.js';
import { createDatabaseClient } from '../src/database/client.js';
import { seedCatalog } from '../src/database/seed.js';
import { ApiFault } from '../src/common/api-fault.js';
import { GoogleIdentityVerifier, type VerifiedGoogleIdentity } from '../src/modules/auth/google-verifier.js';
import { hash } from '../src/modules/auth/crypto.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { LOGIN_COOKIE, SESSION_COOKIE } from '../src/modules/auth/http.js';
import { MapsService, RoutesProvider } from '../src/modules/maps/maps.module.js';
import { MapsError } from '../src/modules/maps/errors.js';
import type { RoutesConfig } from '../src/modules/maps/routes.js';
import { createIsolatedDatabase, fixtureDirectory, grantRuntime, LocalPostgres, runTool } from './helpers/postgres.js';

class TestIdentities extends GoogleIdentityVerifier {
  readonly identities = new Map<string, VerifiedGoogleIdentity>();
  async verify(token: string) { const identity = this.identities.get(token); if (!identity) throw new ApiFault('AUTH_INVALID_IDENTITY', 401); return identity; }
}
class TestRoutes extends RoutesProvider {
  calls = 0; failure: Error | undefined; result: SampleRouteResult = { kind: 'no-route', source: 'google-routes' };
  async compute(configuration: RoutesConfig, request: unknown, catalog: SampleMapCatalog, signal: AbortSignal) {
    this.calls++; assert.equal(configuration.apiKey, 'TEST_ONLY_SERVER_MAPS_KEY'); assert.ok(isSampleMapCatalog(catalog));
    assert.equal(signal.aborted, false); assert.equal(Object.keys(request as object).length, 2);
    if (this.failure) throw this.failure; return this.result;
  }
}
const origin = 'https://admin.test.example', apiRoot = fileURLToPath(new URL('../../', import.meta.url));
function responseCookie(response: Response, name: string) {
  const cookie = response.headers.getSetCookie().find(value => value.startsWith(`${name}=`)); assert.ok(cookie); return cookie.split(';')[0]!;
}
async function sanitized(work: () => Promise<void>) {
  let caught: unknown;
  try { await work(); return; } catch (error) { caught = error; }
  if (caught instanceof assert.AssertionError) throw caught;
  throw new Error('Owned Maps HTTP fixture failed; private driver details are not printed.');
}
function bounded<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Owned disconnect regression timed out')), 3000);
    operation.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

test('Maps HTTP protects paid native Routes using actual PostgreSQL sessions and Nest-only provider doubles', { timeout: 180_000 }, async t => sanitized(async () => {
  const cluster = await LocalPostgres.initialize(await fixtureDirectory());
  let operator: ReturnType<typeof createDatabaseClient> | undefined;
  const apps = new Set<NestExpressApplication>();
  t.after(async () => {
    try {
      const results = await Promise.allSettled([...apps].map(app => app.close()));
      assert.ok(results.every(result => result.status === 'fulfilled')); await operator?.$disconnect();
    } finally { await cluster.stopIfRunning(); }
  });
  await cluster.start(); const database = await createIsolatedDatabase(cluster, 'goease_maps_http');
  await runTool(process.execPath, [path.join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', path.join(apiRoot, 'prisma7.config.ts')],
    { ...process.env, DATABASE_MIGRATION_URL: database.migrationUrl });
  await grantRuntime(database.migrationUrl, database.runtime);
  const op = operator = createDatabaseClient(database.migrationUrl); await seedCatalog(op);
  async function server(enabled: boolean, key = true) {
    const identities = new TestIdentities(), provider = new TestRoutes();
    const module = await Test.createTestingModule({ imports: [await AppModule.register({ NODE_ENV: 'test', WEB_ORIGINS: origin,
      DATABASE_URL: database.runtimeUrl, GOOGLE_WEB_CLIENT_ID: 'test-client.apps.googleusercontent.com',
      MAPS_ROUTES_ENABLED: enabled ? 'true' : 'false', ...(key ? { GOOGLE_MAPS_SERVER_API_KEY: 'TEST_ONLY_SERVER_MAPS_KEY' } : {}) })] })
      .overrideProvider(GoogleIdentityVerifier).useValue(identities).overrideProvider(RoutesProvider).useValue(provider).compile();
    const app = module.createNestApplication<NestExpressApplication>({ logger: false }); configureApp(app); apps.add(app); await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    const post = (route: string, body: unknown = {}, headers: Record<string, string> = {}) => fetch(`${url}/api/${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    const get = (route: string) => fetch(`${url}/api/${route}`);
    async function login(transport: 'native' | 'web' = 'native') {
      const challengeResponse = await post(`auth/challenges/${transport}`, {}, transport === 'web' ? { Origin: origin } : {});
      assert.equal(challengeResponse.status, 201); const challenge: unknown = await challengeResponse.json(); assert.ok(isAuthChallengeResponse(challenge));
      const token = `TESTONLY.${Buffer.from(randomUUID()).toString('base64url')}.SIGNATURE`;
      identities.identities.set(token, { subject: randomUUID(), displayName: 'TEST ONLY Maps user', nonce: challenge.nonce });
      const response = await post(`auth/google/${transport}`, { challengeId: challenge.challengeId, idToken: token }, {
        'X-GoEase-Auth-Proof': challenge.proof, ...(transport === 'web' ? { Origin: origin, Cookie: responseCookie(challengeResponse, LOGIN_COOKIE) } : {}),
      });
      assert.equal(response.status, 200); const body: unknown = await response.json(); assert.ok(isSessionResponse(body));
      const headers: Record<string, string> = body.transport === 'native' ? { Authorization: `Bearer ${body.accessToken}` } : { Cookie: responseCookie(response, SESSION_COOKIE) };
      return { body, headers };
    }
    return { app, post, get, login, provider, close: async () => { await app.close(); apps.delete(app); } };
  }
  async function fault(response: Response, status: number, code: string) {
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json() as { error: { code: string } }; assert.equal(body.error.code, code);
    const output = JSON.stringify(body);
    for (const secret of ['TEST_ONLY_PRIVATE', 'TEST_ONLY_SERVER_MAPS_KEY', database.runtimeUrl, database.migrationUrl]) assert.equal(output.includes(secret), false);
  }
  const loaded = await op.place.findMany({ orderBy: { code: 'asc' } });
  const pair = { originPlaceId: loaded[0]!.id, destinationPlaceId: loaded[1]!.id };

  await t.test('catalog is public/noncharging; anonymous/spoofed/cookie browser requests cannot reach Routes', () => sanitized(async () => {
    const s = await server(true);
    try {
      const response = await s.get('maps/catalog'); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      const catalog: unknown = await response.json(); assert.ok(isSampleMapCatalog(catalog));
      assert.deepEqual(new Set(catalog.places.map(place => place.id)), new Set(loaded.map(place => place.id)));
      await fault(await s.post('maps/sample-route', pair), 401, 'SESSION_REQUIRED');
      await fault(await s.post('maps/sample-route', { ...pair, role: 'ADMIN', ownerId: randomUUID() }, { Authorization: 'Bearer invalid', 'X-Role': 'ADMIN' }), 401, 'SESSION_REQUIRED');
      const web = await s.login('web');
      await fault(await s.post('maps/sample-route', pair, web.headers), 403, 'ORIGIN_FORBIDDEN');
      assert.equal(web.body.transport, 'web');
      if (web.body.transport !== 'web') throw new Error('Expected TEST ONLY web session.');
      await fault(await s.post('maps/sample-route', pair, { ...web.headers, Origin: origin,
        'X-CSRF-Token': web.body.csrfToken }), 403, 'MAPS_NATIVE_REQUIRED');
      assert.equal(s.provider.calls, 0);
    } finally { await s.close(); }
  }));
  await t.test('disabled flag or missing key returns503 before provider, even with a valid actual native session', () => sanitized(async () => {
    for (const [enabled, key] of [[false, true], [true, false]]) {
      const s = await server(enabled!, key!);
      try { const native = await s.login(); await fault(await s.post('maps/sample-route', pair, native.headers), 503, 'MAPS_NOT_CONFIGURED'); assert.equal(s.provider.calls, 0); }
      finally { await s.close(); }
    }
  }));
  await t.test('native sample DTO/catalog validation and server current role prevent arbitrary coordinate/identity forwarding', () => sanitized(async () => {
    const s = await server(true);
    try {
      const native = await s.login();
      for (const body of [{ ...pair, latitude: 21 }, { ...pair, ownerId: native.body.user.id }, { ...pair, role: 'ADMIN' },
        { ...pair, destinationPlaceId: pair.originPlaceId.toUpperCase() }, { ...pair, destinationPlaceId: randomUUID() }]) {
        await fault(await s.post('maps/sample-route', body, native.headers), 400, 'MAPS_INVALID_INPUT');
      }
      assert.equal(s.provider.calls, 0);
      await op.user.update({ where: { id: native.body.user.id }, data: { role: 'ADMIN' } });
      await op.user.update({ where: { id: native.body.user.id }, data: { role: 'CUSTOMER' } });
      const allowed = await s.post('maps/sample-route', pair, native.headers); assert.equal(allowed.status, 200); assert.ok(isSampleRouteResult(await allowed.json()));
      assert.equal(s.provider.calls, 1); assert.equal(await op.trip.count(), 0);
      await op.place.update({ where: { id: pair.originPlaceId }, data: { active: false } });
      try { await fault(await s.post('maps/sample-route', pair, native.headers), 503, 'MAPS_CATALOG_UNAVAILABLE'); assert.equal(s.provider.calls, 1); }
      finally { await seedCatalog(op); }
    } finally { await s.close(); }
  }));
  await t.test('expired/revoked/disabled sessions and bearer+Origin are rejected before paid provider', () => sanitized(async () => {
    const s = await server(true);
    try {
      const native = await s.login(); assert.equal(native.body.transport, 'native'); if (native.body.transport !== 'native') assert.fail();
      await fault(await s.post('maps/sample-route', pair, { ...native.headers, Origin: origin }), 401, 'SESSION_REQUIRED');
      // Preserve the real expiresAt > createdAt invariant while making this fixture expired.
      const expiredAt = new Date(Date.now() - 1000);
      await op.session.updateMany({ where: { tokenHash: hash(native.body.accessToken) },
        data: { createdAt: new Date(expiredAt.getTime() - 60_000), expiresAt: expiredAt } });
      await fault(await s.post('maps/sample-route', pair, native.headers), 401, 'SESSION_REQUIRED');
      const revoked = await s.login(); assert.equal(revoked.body.transport, 'native'); if (revoked.body.transport !== 'native') assert.fail();
      assert.equal((await s.post('auth/logout', {}, revoked.headers)).status, 204);
      await fault(await s.post('maps/sample-route', pair, revoked.headers), 401, 'SESSION_REQUIRED');
      const disabled = await s.login(); await op.user.update({ where: { id: disabled.body.user.id }, data: { disabledAt: new Date() } });
      await fault(await s.post('maps/sample-route', pair, disabled.headers), 401, 'SESSION_REQUIRED'); assert.equal(s.provider.calls, 0);
    } finally { await s.close(); }
  }));
  await t.test('provider failures/no-route are distinct, sanitized, noncached and per-user quota is enforced', () => sanitized(async () => {
    const s = await server(true);
    try {
      const native = await s.login();
      for (const [error, status, code] of [[new MapsError('MAPS_TIMEOUT'), 504, 'MAPS_TIMEOUT'],
        [new MapsError('MAPS_INVALID_OUTPUT'), 502, 'MAPS_INVALID_OUTPUT'], [new Error('TEST_ONLY_PRIVATE_PROVIDER_ERROR'), 502, 'MAPS_PROVIDER_FAILURE']] as const) {
        s.provider.failure = error; await fault(await s.post('maps/sample-route', pair, native.headers), status, code);
      }
      s.provider.failure = undefined;
      const noRoute = await s.post('maps/sample-route', pair, native.headers); assert.equal(noRoute.status, 200); assert.equal(noRoute.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await noRoute.json(), { kind: 'no-route', source: 'google-routes' });
      for (let i = 4; i < 10; i++) assert.equal((await s.post('maps/sample-route', pair, native.headers)).status, 200);
      await fault(await s.post('maps/sample-route', pair, native.headers), 429, 'MAPS_RATE_LIMITED'); assert.equal(s.provider.calls, 10);
    } finally { await s.close(); }
  }));
  await t.test('disconnect while SessionGuard is pending never admits a paid provider after the guard resolves', () => sanitized(async () => {
    const s = await server(true);
    try {
      const native = await s.login(), auth = s.app.get(AuthService), routes = s.app.get(MapsService);
      const authenticate = auth.authenticate.bind(auth), route = routes.route.bind(routes);
      let entered!: () => void, release!: () => void, finished!: () => void, responseClosed!: () => void;
      const enteredGuard = new Promise<void>(resolve => { entered = resolve; }), guardGate = new Promise<void>(resolve => { release = resolve; });
      const routeFinished = new Promise<void>(resolve => { finished = resolve; });
      const serverClosed = new Promise<void>(resolve => { responseClosed = resolve; });
      auth.authenticate = async request => {
        if (!request.res) throw new Error('Owned HTTP response required');
        request.res.once('close', responseClosed); entered(); await guardGate; return authenticate(request);
      };
      routes.route = async (...args) => { try { return await route(...args); } finally { finished(); } };
      const request = httpRequest(`${await s.app.getUrl()}/api/maps/sample-route`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...native.headers } });
      request.on('error', () => { /* Expected own socket cancellation, never suppress server assertions. */ });
      const closed = new Promise<void>(resolve => request.once('close', resolve));
      try {
        request.end(JSON.stringify(pair)); await bounded(enteredGuard); request.destroy(); await bounded(closed); await bounded(serverClosed); release();
        await bounded(routeFinished); assert.equal(s.provider.calls, 0);
      } finally { release(); request.destroy(); }
    } finally { await s.close(); }
  }));
}));
