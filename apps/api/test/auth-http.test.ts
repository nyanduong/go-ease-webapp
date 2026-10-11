import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { isAuthChallengeResponse, isCurrentSessionResponse, isSessionResponse, type AuthChallengeResponse, type SessionResponse } from '@goease/contracts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.js';
import { GoogleIdentityVerifier, type VerifiedGoogleIdentity } from '../src/modules/auth/google-verifier.js';
import { ApiFault } from '../src/common/api-fault.js';
import { hash, opaque } from '../src/modules/auth/crypto.js';
import { LOGIN_COOKIE, SESSION_COOKIE } from '../src/modules/auth/http.js';
import { createDatabaseClient } from '../src/database/client.js';
import { createIsolatedDatabase, fixtureDirectory, grantRuntime, LocalPostgres, runTool } from './helpers/postgres.js';

const origin = 'https://admin.test.example';
const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
const clientId = 'test-client.apps.googleusercontent.com';
class TestIdentities extends GoogleIdentityVerifier {
  readonly identities = new Map<string, VerifiedGoogleIdentity>();
  calls = 0;
  async verify(token: string) {
    this.calls++;
    const identity = this.identities.get(token);
    if (!identity) throw new ApiFault('AUTH_INVALID_IDENTITY', 401);
    return identity;
  }
  token(challenge: AuthChallengeResponse, subject: string, displayName = 'TEST ONLY identity') {
    // These are HTTP integration doubles, never Google authentication evidence.
    const token = `TESTONLY.${Buffer.from(randomUUID()).toString('base64url')}.SIGNATURE`;
    this.identities.set(token, { subject, displayName, nonce: challenge.nonce });
    return token;
  }
}
function requestCookie(response: Response, name: string) {
  const value = response.headers.getSetCookie().find(value => value.startsWith(`${name}=`));
  assert.ok(value, `missing ${name}`);
  return value.split(';')[0]!;
}
async function fault(response: Response, status: number, code?: string) {
  assert.equal(response.status, status);
  const body = await response.json() as { error: { code: string }; path: string };
  if (code) assert.equal(body.error.code, code);
  assert.ok(!JSON.stringify(body).includes('TESTONLY.'));
  assert.ok(!JSON.stringify(body).includes('postgresql://'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
}

test('Auth HTTP with isolated real PostgreSQL + runtime role; identity doubles only through Nest override', { timeout: 180_000 }, async t => {
  const cluster = await LocalPostgres.initialize(await fixtureDirectory());
  let operator: ReturnType<typeof createDatabaseClient> | undefined;
  let runtime: ReturnType<typeof createDatabaseClient> | undefined;
  const apps = new Set<NestExpressApplication>();
  t.after(async () => {
    try {
      await Promise.allSettled([...apps].map(app => app.close()));
      await Promise.allSettled([operator?.$disconnect(), runtime?.$disconnect()]);
    } finally { await cluster.stopIfRunning(); }
  });
  await cluster.start();
  const database = await createIsolatedDatabase(cluster, 'goease_auth');
  await runTool(process.execPath, [path.join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', path.join(apiRoot, 'prisma7.config.ts')],
    { ...process.env, DATABASE_MIGRATION_URL: database.migrationUrl });
  await grantRuntime(database.migrationUrl, database.runtime);
  const op = operator = createDatabaseClient(database.migrationUrl);
  const db = runtime = createDatabaseClient(database.runtimeUrl);
  async function server() {
    const verifier = new TestIdentities();
    const module = await Test.createTestingModule({ imports: [await AppModule.register({ NODE_ENV: 'test', WEB_ORIGINS: origin,
      DATABASE_URL: database.runtimeUrl, GOOGLE_WEB_CLIENT_ID: clientId })] })
      .overrideProvider(GoogleIdentityVerifier).useValue(verifier).compile();
    const app = module.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app); apps.add(app); await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    const post = (route: string, body: unknown = {}, headers: Record<string, string> = {}) => fetch(`${url}/api/${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    const get = (route: string, headers: Record<string, string> = {}) => fetch(`${url}/api/${route}`, { headers });
    const challenge = async (kind: 'web' | 'native' = 'native') => {
      const response = await post(`auth/challenges/${kind}`, {}, kind === 'web' ? { Origin: origin } : {});
      assert.equal(response.status, 201);
      const body: unknown = await response.json(); assert.ok(isAuthChallengeResponse(body));
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return { body, cookie: kind === 'web' ? requestCookie(response, LOGIN_COOKIE) : '' };
    };
    const exchange = (challenge: AuthChallengeResponse, token: string, binding = '') => post(`auth/google/${challenge.transport}`,
      { challengeId: challenge.challengeId, idToken: token }, { 'X-GoEase-Auth-Proof': challenge.proof,
        ...(challenge.transport === 'web' ? { Origin: origin, Cookie: binding } : {}) });
    const login = async (subject: string, kind: 'web' | 'native' = 'native') => {
      const created = await challenge(kind);
      const response = await exchange(created.body, verifier.token(created.body, subject), created.cookie);
      assert.equal(response.status, 200);
      const body: unknown = await response.json(); assert.ok(isSessionResponse(body));
      const headers = body.transport === 'web' ? { Cookie: requestCookie(response, SESSION_COOKIE) } : { Authorization: `Bearer ${body.accessToken}` };
      return { body, headers, response, challenge: created.body };
    };
    return { app, verifier, url, post, get, challenge, exchange, login, close: async () => { await app.close(); apps.delete(app); } };
  }

  await t.test('A/B identity separation, opaque hashes only, current role and disabled flags, no default admin', async () => {
    const s = await server();
    try {
      const a = await s.login('HTTP-A'), b = await s.login('HTTP-B');
      assert.notEqual(a.body.user.id, b.body.user.id);
      assert.equal(a.body.user.role, 'CUSTOMER');
      for (const login of [a, b]) {
        const me = await s.get('auth/me', login.headers); assert.equal(me.status, 200);
        const body: unknown = await me.json(); assert.ok(isCurrentSessionResponse(body)); assert.deepEqual(body.user, login.body.user);
        assert.equal('accessToken' in body, false);
      }
      await fault(await s.get('auth/me'), 401, 'SESSION_REQUIRED');
      await fault(await s.get('admin/access'), 401, 'SESSION_REQUIRED');
      await fault(await s.get('admin/access', a.headers), 403, 'ADMIN_REQUIRED');
      await op.user.update({ where: { id: a.body.user.id }, data: { role: 'ADMIN' } });
      assert.equal((await s.get('admin/access', a.headers)).status, 200);
      await op.user.update({ where: { id: a.body.user.id }, data: { role: 'CUSTOMER' } });
      await fault(await s.get('admin/access', a.headers), 403, 'ADMIN_REQUIRED');
      await op.user.update({ where: { id: a.body.user.id }, data: { disabledAt: new Date() } });
      await fault(await s.get('auth/me', a.headers), 401, 'SESSION_REQUIRED');
      const sessions = await op.session.findMany();
      assert.ok(sessions.every(row => /^[a-f0-9]{64}$/.test(row.tokenHash) && row.transport === 'NATIVE' && row.csrfTokenHash === null));
      assert.equal(a.body.transport, 'native');
      if (a.body.transport === 'native') {
        const accessToken = a.body.accessToken;
        assert.ok(sessions.some(row => row.tokenHash === hash(accessToken)));
      }
      assert.equal(await op.user.count({ where: { role: 'ADMIN' } }), 0);
      await assert.rejects(db.$executeRaw`UPDATE "User" SET role = 'ADMIN' WHERE id = ${b.body.user.id}::uuid`);
      await assert.rejects(db.$executeRaw`UPDATE "User" SET "disabledAt" = now() WHERE id = ${b.body.user.id}::uuid`);
      await assert.rejects(db.$executeRaw`UPDATE "Session" SET "tokenHash" = ${hash(opaque())}`);
      await assert.rejects(db.$executeRaw`UPDATE "Session" SET transport = 'WEB'`);
      await assert.rejects(db.$executeRaw`UPDATE "Session" SET "csrfTokenHash" = ${hash(opaque())}`);
    } finally { await s.close(); }
  });

  await t.test('challenge proof/nonce/transport/expiry/replay and simultaneous CAS; stable Google subject', async () => {
    const s = await server();
    try {
      const { body } = await s.challenge();
      const token = s.verifier.token(body, 'HTTP-race');
      await fault(await s.post('auth/google/native', { challengeId: body.challengeId, idToken: token }), 400, 'AUTH_INVALID_CHALLENGE');
      await fault(await s.post('auth/google/native', { challengeId: body.challengeId, idToken: token }, { 'X-GoEase-Auth-Proof': opaque() }), 400, 'AUTH_INVALID_CHALLENGE');
      const wrongNonceToken = s.verifier.token({ ...body, nonce: opaque() }, 'HTTP-wrong-nonce');
      await fault(await s.exchange(body, wrongNonceToken), 401, 'AUTH_INVALID_IDENTITY');
      const responses = await Promise.all([s.exchange(body, token), s.exchange(body, token)]);
      assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
      assert.equal(await op.user.count({ where: { googleSubject: 'HTTP-race' } }), 1);
      const user = await op.user.findUniqueOrThrow({ where: { googleSubject: 'HTTP-race' } });
      assert.equal(await op.session.count({ where: { userId: user.id } }), 1);
      await fault(await s.exchange(body, token), 400, 'AUTH_INVALID_CHALLENGE');
      const again = await s.login('HTTP-race'); assert.equal(again.body.user.id, user.id);
      assert.equal(await op.session.count({ where: { userId: user.id } }), 2);
      const expired = await s.challenge();
      await op.authChallenge.update({ where: { id: expired.body.challengeId }, data: { createdAt: new Date(Date.now() - 600_000), expiresAt: new Date(Date.now() - 300_000) } });
      await fault(await s.exchange(expired.body, s.verifier.token(expired.body, 'HTTP-expired')), 400, 'AUTH_INVALID_CHALLENGE');
      const native = await s.challenge();
      await fault(await s.post('auth/google/web', { challengeId: native.body.challengeId, idToken: s.verifier.token(native.body, 'HTTP-cross') },
        { Origin: origin, Cookie: `${LOGIN_COOKIE}=${native.body.proof}`, 'X-GoEase-Auth-Proof': native.body.proof }), 400, 'AUTH_INVALID_CHALLENGE');
      assert.ok(await op.authChallenge.findFirst({ where: { consumedAt: { not: null } } }));
    } finally { await s.close(); }
  });

  await t.test('web origin + prelogin cookie + custom proof; transport, CSRF and cookie properties', async () => {
    const s = await server();
    try {
      await fault(await s.post('auth/challenges/web'), 403, 'ORIGIN_FORBIDDEN');
      await fault(await s.post('auth/challenges/web', {}, { Origin: 'https://attacker.example' }), 403, 'ORIGIN_FORBIDDEN');
      await fault(await s.post('auth/challenges/native', {}, { Origin: origin }), 400, 'INVALID_REQUEST');
      const web = await s.challenge('web');
      const token = s.verifier.token(web.body, 'HTTP-web');
      await fault(await s.post('auth/google/web', { challengeId: web.body.challengeId, idToken: token }, { Origin: origin, 'X-GoEase-Auth-Proof': web.body.proof }), 400, 'AUTH_INVALID_CHALLENGE');
      await fault(await s.exchange(web.body, token, `${LOGIN_COOKIE}=${opaque()}`), 400, 'AUTH_INVALID_CHALLENGE');
      const response = await s.exchange(web.body, token, web.cookie);
      assert.equal(response.status, 200);
      const body = await response.json() as SessionResponse; assert.ok(isSessionResponse(body)); assert.equal(body.transport, 'web');
      if (body.transport !== 'web') throw new Error('expected web fixture');
      assert.equal('accessToken' in body, false);
      const sessionCookie = requestCookie(response, SESSION_COOKIE);
      const serialized = response.headers.getSetCookie().find(value => value.startsWith(`${SESSION_COOKIE}=`))!;
      for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=86400']) assert.ok(serialized.includes(attribute));
      assert.ok(!serialized.includes('Domain='));
      const me = await s.get('auth/me', { Cookie: sessionCookie });
      assert.deepEqual(await me.json(), body);
      const row = await op.session.findFirstOrThrow({ where: { userId: body.user.id } });
      assert.equal(row.csrfTokenHash, hash(body.csrfToken));
      assert.equal(row.transport, 'WEB'); assert.notEqual(row.tokenHash, sessionCookie.slice(SESSION_COOKIE.length + 1));
      await fault(await s.get('auth/me', { Cookie: `${sessionCookie}; ${sessionCookie}` }), 400, 'INVALID_REQUEST');
      await fault(await s.get('auth/me', { Cookie: sessionCookie, Authorization: `Bearer ${opaque()}` }), 400, 'INVALID_REQUEST');
      await fault(await s.get('auth/me', { Authorization: `Bearer ${sessionCookie.slice(SESSION_COOKIE.length + 1)}` }), 401, 'SESSION_REQUIRED');
      await fault(await s.post('auth/logout', {}, { Cookie: sessionCookie, 'X-CSRF-Token': body.csrfToken }), 403, 'ORIGIN_FORBIDDEN');
      await fault(await s.post('auth/logout', {}, { Origin: origin, Cookie: sessionCookie }), 403, 'CSRF_INVALID');
      await fault(await s.post('auth/logout', {}, { Origin: origin, Cookie: sessionCookie, 'X-CSRF-Token': opaque() }), 403, 'CSRF_INVALID');
      assert.equal((await s.post('auth/logout', {}, { Origin: origin, Cookie: sessionCookie, 'X-CSRF-Token': body.csrfToken })).status, 204);
      await fault(await s.get('auth/me', { Cookie: sessionCookie }), 401, 'SESSION_REQUIRED');
      assert.equal((await s.post('auth/logout', {}, { Origin: origin, Cookie: sessionCookie })).status, 204);
      const native = await s.login('HTTP-native-transport');
      assert.equal(native.body.transport, 'native');
      if (native.body.transport === 'native') {
        await fault(await s.get('auth/me', { Cookie: `${SESSION_COOKIE}=${native.body.accessToken}` }), 401, 'SESSION_REQUIRED');
        await fault(await s.get('auth/me', { ...native.headers, Origin: origin }), 401, 'SESSION_REQUIRED');
      }
      const cors = await fetch(`${s.url}/api/auth/google/web`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-goease-auth-proof' } });
      assert.equal(cors.status, 204); assert.equal(cors.headers.get('access-control-allow-origin'), origin);
      assert.equal(cors.headers.get('access-control-allow-credentials'), 'true');
      assert.ok(cors.headers.get('access-control-allow-methods')?.includes('POST'));
      assert.equal((await s.get('auth/me', { Origin: 'https://attacker.example' })).headers.get('access-control-allow-origin'), null);
    } finally { await s.close(); }
  });

  await t.test('transaction rollback restores unconsumed challenge; disabled login cannot update or create sessions', async () => {
    const s = await server();
    try {
      const created = await s.challenge(); const token = s.verifier.token(created.body, 'HTTP-rollback');
      await op.$executeRawUnsafe(`REVOKE INSERT ON "Session" FROM ${database.runtime}`);
      // Revoke column grants too; this fixture deliberately removes required write rights.
      await op.$executeRawUnsafe(`REVOKE INSERT (id, "userId", "tokenHash", transport, "csrfTokenHash", "createdAt", "expiresAt") ON "Session" FROM ${database.runtime}`);
      try { await fault(await s.exchange(created.body, token), 500, 'INTERNAL_ERROR'); }
      finally { await grantRuntime(database.migrationUrl, database.runtime); }
      assert.equal((await op.authChallenge.findUniqueOrThrow({ where: { id: created.body.challengeId } })).consumedAt, null);
      assert.equal(await op.user.count({ where: { googleSubject: 'HTTP-rollback' } }), 0);
      assert.equal((await s.exchange(created.body, token)).status, 200);
      const disabled = await op.user.create({ data: { googleSubject: 'HTTP-disabled', displayName: 'Original', disabledAt: new Date() } });
      const retry = await s.challenge();
      await fault(await s.exchange(retry.body, s.verifier.token(retry.body, 'HTTP-disabled', 'Changed')), 401, 'AUTH_INVALID_IDENTITY');
      assert.equal((await op.user.findUniqueOrThrow({ where: { id: disabled.id } })).displayName, 'Original');
      assert.equal(await op.session.count({ where: { userId: disabled.id } }), 0);
      assert.equal((await op.authChallenge.findUniqueOrThrow({ where: { id: retry.body.challengeId } })).consumedAt, null);
    } finally { await s.close(); }
  });

  await t.test('API restart retains DB sessions, expiry and idempotent native logout revoke access', async () => {
    const first = await server(); const login = await first.login('HTTP-persist'); await first.close();
    const s = await server();
    try {
      assert.equal((await s.get('auth/me', login.headers)).status, 200);
      assert.equal((await s.post('auth/logout', {}, login.headers)).status, 204);
      assert.equal((await s.post('auth/logout', {}, login.headers)).status, 204);
      await fault(await s.get('auth/me', login.headers), 401, 'SESSION_REQUIRED');
      const expiring = await s.login('HTTP-expiring');
      await op.session.updateMany({ where: { userId: expiring.body.user.id }, data: { createdAt: new Date(Date.now() - 600_000), expiresAt: new Date(Date.now() - 1) } });
      await fault(await s.get('auth/me', expiring.headers), 401, 'SESSION_REQUIRED');
    } finally { await s.close(); }
  });

  await t.test('strict input, safe error envelope, bounded challenge limiter and expired-row cleanup', async () => {
    const s = await server();
    try {
      await fault(await s.post('auth/challenges/desktop'), 400, 'INVALID_REQUEST');
      await fault(await s.post('auth/challenges/native', { role: 'ADMIN' }), 400, 'INVALID_REQUEST');
      await fault(await s.post('auth/challenges/native', []), 400, 'INVALID_REQUEST');
      await fault(await s.post('auth/google/native', { challengeId: randomUUID(), idToken: 'a.b.c', role: 'ADMIN' }), 400, 'INVALID_REQUEST');
      await fault(await s.post('auth/google/native', { challengeId: 'invalid', idToken: 'a.b.c' }), 400, 'INVALID_REQUEST');
      await fault(await s.post('auth/google/native', { challengeId: randomUUID(), idToken: 'a'.repeat(20_000) }), 400, 'INVALID_REQUEST');
      const expiredIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const row = await op.authChallenge.create({ data: { transport: 'NATIVE', nonceHash: hash(opaque()), proofHash: hash(opaque()),
          createdAt: new Date(Date.now() - 600_000), expiresAt: new Date(Date.now() - 300_000) } }); expiredIds.push(row.id);
      }
      for (let i = 0; i < 10; i++) assert.equal((await s.post('auth/challenges/native')).status, 201);
      await fault(await s.post('auth/challenges/native'), 429, 'AUTH_RATE_LIMITED');
      assert.equal(await op.authChallenge.count({ where: { id: { in: expiredIds } } }), 0);
      assert.equal(s.verifier.calls, 0);
    } finally { await s.close(); }
  });

  await t.test('durable challenge cap is atomic across simultaneous creators; cleanup is bounded', async () => {
    const s = await server();
    try {
      await op.authChallenge.deleteMany();
      await op.$executeRaw`INSERT INTO "AuthChallenge" (transport, "nonceHash", "proofHash", "createdAt", "expiresAt")
        SELECT 'NATIVE', md5(n::text) || md5(n::text), ${hash(opaque())}, statement_timestamp(), statement_timestamp() + interval '5 minutes'
        FROM generate_series(1,1999) AS n`;
      const race = await Promise.all([s.post('auth/challenges/native'), s.post('auth/challenges/native')]);
      assert.deepEqual(race.map(response => response.status).sort(), [201, 429]);
      assert.equal(await op.authChallenge.count(), 2000);
      await op.authChallenge.deleteMany();
      await op.$executeRaw`INSERT INTO "AuthChallenge" (transport, "nonceHash", "proofHash", "createdAt", "expiresAt")
        SELECT 'NATIVE', md5(n::text) || md5(n::text), ${hash(opaque())}, statement_timestamp() - interval '10 minutes', statement_timestamp() - interval '5 minutes'
        FROM generate_series(1,201) AS n`;
      assert.equal((await s.post('auth/challenges/native')).status, 201);
      assert.equal(await op.authChallenge.count(), 102);
    } finally { await s.close(); }
  });
});
