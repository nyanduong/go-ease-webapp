import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoApi as createApi } from '../dist-demos/dev/demos/create-demo-api.js';
import { readConfig } from '../dist/config/env.js';
import { authDemoGuard } from '../dist-demos/dev/demos/auth/session.js';
const project = 'https://abcdefghijklmnopqrst.supabase.co';
const env = {
  AUTH_ENABLED: 'true',
  SUPABASE_AUTH_URL: project,
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_offline_fixture_00000000',
};
const id = '12345678-1234-4234-8234-123456789abc';
test('auth-only HTTP permits only verified identity, keeps user JWT and never reaches AI/catalog', async () => {
  let calls = 0;
  const now = Math.floor(Date.now() / 1000),
    encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const token =
    encode({ alg: 'HS256' }) +
    '.' +
    encode({
      sub: id,
      iss: project + '/auth/v1',
      aud: 'authenticated',
      role: 'authenticated',
      iat: now,
      exp: now + 3600,
    }) +
    '.offline_signature';
  const { app } = await createApi(
    env,
    async () => assert.fail('catalog not exposed'),
    { provider: { generate: async () => assert.fail('AI not exposed') } },
    undefined,
    {
      fetcher: async (url, options) => {
        calls++;
        assert.equal(url, project + '/auth/v1/user');
        assert.equal(options.headers.authorization, 'Bearer ' + token);
        return new Response(JSON.stringify({ id, aud: 'authenticated', role: 'authenticated' }));
      },
    },
    { expiresAt: Date.now() + 60000 },
  );
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    for (const path of [
      '/v1/health',
      '/v1/catalog',
      '/v1/auth/me?userId=other',
      '/v1/auth/me/',
      '/v1/ai/itineraries',
      '/',
    ])
      assert.equal(
        (await fetch(base + path, { headers: { authorization: 'Bearer ' + token } })).status,
        404,
      );
    assert.equal((await fetch(base + '/v1/auth/me', { method: 'POST' })).status, 404);
    assert.equal(
      (
        await fetch(base + '/v1/auth/me', {
          headers: { origin: 'https://browser.example.test', authorization: 'Bearer ' + token },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(base + '/v1/auth/me')).status, 401);
    assert.equal(calls, 0);
    const response = await fetch(base + '/v1/auth/me', {
      headers: { authorization: 'Bearer ' + token },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      apiVersion: '1',
      identity: { id, provider: 'supabase' },
    });
    assert.equal(calls, 1);
  } finally {
    await app.close();
  }
});
test('auth-only session bounds TTL/rate, ignores forwarded IP and rejects unsafe exposure/config', async () => {
  let clock = 1800000000000;
  const config = readConfig(env);
  for (const patch of [
    { API_HOST: '0.0.0.0' },
    { AUTH_ENABLED: 'false' },
    { SUPABASE_AUTH_URL: '' },
    { SUPABASE_PUBLISHABLE_KEY: '' },
    { GEMINI_ENABLED: 'true' },
    { GEMINI_API_KEY: 'private_fixture_key_0000000000' },
    { AI_ACCESS_TOKEN: 'private_fixture_token_0000000000000000' },
  ])
    assert.throws(() =>
      authDemoGuard(
        { expiresAt: clock + 60000, now: () => clock },
        readConfig({ ...env, ...patch }),
      ),
    );
  for (const expiresAt of [clock, clock - 1, clock + 1800001, NaN])
    assert.throws(() => authDemoGuard({ expiresAt, now: () => clock }, config));
  const guard = authDemoGuard({ expiresAt: clock + 120000, now: () => clock }, config);
  const req = { method: 'GET', originalUrl: '/v1/auth/me', headers: {} };
  for (let i = 0; i < 60; i++) guard({ ...req, headers: { 'x-forwarded-for': `192.0.2.${i}` } });
  assert.throws(
    () => guard(req),
    (error) => error.code === 'AUTH_RATE_LIMITED',
  );
  clock += 60000;
  guard(req);
  clock += 60000;
  assert.throws(
    () => guard(req),
    (error) => error.code === 'AUTH_INVALID',
  );
  await assert.rejects(
    createApi(
      env,
      undefined,
      {},
      { token: 'a'.repeat(22), expiresAt: Date.now() + 10000 },
      {},
      { expiresAt: Date.now() + 10000 },
    ),
  );
});
