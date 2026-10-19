import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../dist/bootstrap.js';
import { createDemoApi } from '../dist-demos/dev/demos/create-demo-api.js';
import { AuthVerifier } from '../dist/modules/auth/auth-verifier.service.js';
import { readConfig } from '../dist/config/env.js';
import { authIdentityResponseSchema, apiErrorResponseSchema } from '@goease/contracts';
const URL = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY = 'sb_publishable_offline_fixture_00000000';
const NOW = 1800000000000,
  ID = 'b5aa7f8a-1711-4c09-b432-bcf075c57b5f',
  OTHER = '12345678-1234-4234-8234-123456789abc';
const env = { AUTH_ENABLED: 'true', SUPABASE_AUTH_URL: URL, SUPABASE_PUBLISHABLE_KEY: KEY };
// Structurally shaped but unsigned test token. Only explicit provider doubles accept it.
function token(patch = {}, alg = 'ES256') {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg })}.${encode({ sub: ID, iss: `${URL}/auth/v1`, aud: 'authenticated', role: 'authenticated', exp: NOW / 1000 + 3600, iat: NOW / 1000, ...patch })}.offline_signature_not_valid`;
}
const user = (id = ID) => ({
  id,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'private@example.test',
  user_metadata: { role: 'admin' },
});
async function fixture(
  run,
  patch = {},
  fetcher = async () => new Response(JSON.stringify(user())),
) {
  const { app } = await createApi(
    { ...env, ...patch },
    undefined,
    { provider: { generate: async () => assert.fail('auth tests never call Gemini') } },
    { now: () => NOW, fetcher },
  );
  try {
    await app.listen(0, '127.0.0.1');
    await run(await app.getUrl());
  } finally {
    await app.close();
  }
}
const request = (base, supplied = token(), suffix = '', headers = {}) =>
  fetch(`${base}/v1/auth/me${suffix}`, {
    headers: { authorization: `Bearer ${supplied}`, ...headers },
  });
async function error(response, status, code) {
  assert.equal(response.status, status);
  const raw = await response.text();
  const body = apiErrorResponseSchema.parse(JSON.parse(raw));
  assert.equal(body.error.code, code);
  assert.equal(raw.includes(KEY), false);
  assert.equal(raw.includes('DO_NOT_LEAK'), false);
  assert.equal(raw.includes('offline_signature'), false);
}
test('auth disabled and missing project/key fail closed without provider call', async () => {
  const noCall = async () => assert.fail('no auth cloud without configuration');
  await fixture(
    async (base) => {
      await error(await request(base), 503, 'AUTH_DISABLED');
      assert.equal((await fetch(`${base}/v1/health`)).status, 200);
    },
    { AUTH_ENABLED: 'false' },
    noCall,
  );
  for (const patch of [{ SUPABASE_AUTH_URL: '' }, { SUPABASE_PUBLISHABLE_KEY: '' }])
    await fixture(
      async (base) => error(await request(base), 503, 'AUTH_NOT_CONFIGURED'),
      patch,
      noCall,
    );
});
test('malformed/expired/wrong-issuer/audience/role/algorithm/anonymous tokens rejected before provider; query identity refused', () =>
  fixture(
    async (base) => {
      for (const supplied of [
        '',
        'Expo-login',
        'x'.repeat(4100),
        token({ exp: NOW / 1000 }),
        token({ iss: 'https://evil.example/auth/v1' }),
        token({ aud: 'other' }),
        token({ role: 'service_role' }),
        token({ is_anonymous: true }),
        token({}, 'none'),
        token({ iat: NOW / 1000 + 100 }),
        token({ exp: NOW / 1000 + 9000 }),
      ])
        await error(await request(base, supplied), 401, 'AUTH_INVALID');
      await error(await request(base, token(), '?userId=other&role=admin'), 400, 'BAD_REQUEST');
    },
    {},
    async () => assert.fail('must not call provider'),
  ));
test('real HTTP returns only identity confirmed by fixed Supabase user endpoint (provider double); client identity/role ignored', () =>
  fixture(
    async (base) => {
      const response = await request(base, token(), '', { 'x-user-id': OTHER, 'x-role': 'admin' });
      assert.equal(response.status, 200);
      const data = authIdentityResponseSchema.parse(await response.json());
      assert.deepEqual(data.identity, { id: ID, provider: 'supabase' });
      assert.equal('email' in data.identity, false);
      assert.equal('role' in data.identity, false);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    },
    {},
    async (url, options) => {
      assert.equal(url, `${URL}/auth/v1/user`);
      assert.equal(url.includes(token()), false);
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.apikey, KEY);
      assert.equal(options.headers.authorization, `Bearer ${token()}`);
      return new Response(JSON.stringify(user()));
    },
  ));
test('two provider-fixture accounts stay distinct; decoding a forged subject never produces a login by itself', () =>
  fixture(
    async (base) => {
      for (const id of [ID, OTHER]) {
        const response = await request(base, token({ sub: id }));
        assert.equal(response.status, 200);
        assert.equal((await response.json()).identity.id, id);
      }
      await error(
        await request(base, token({ sub: ID, iat: NOW / 1000 - 1 })),
        401,
        'AUTH_INVALID',
      );
    },
    {},
    async (_url, options) => {
      if (options.headers.authorization === `Bearer ${token()}`)
        return new Response(JSON.stringify(user(ID)));
      if (options.headers.authorization === `Bearer ${token({ sub: OTHER })}`)
        return new Response(JSON.stringify(user(OTHER)));
      return new Response('DO_NOT_LEAK', { status: 401 });
    },
  ));
test('provider denial/rate/unavailable, mismatched subject, malformed/oversize body are safe and never retried', async () => {
  for (const [status, code, mapped] of [
    [401, 'AUTH_INVALID', 401],
    [403, 'AUTH_INVALID', 401],
    [429, 'AUTH_RATE_LIMITED', 429],
    [500, 'AUTH_UNAVAILABLE', 503],
    [302, 'AUTH_UNAVAILABLE', 503],
  ]) {
    let calls = 0;
    await fixture(
      async (base) => error(await request(base), mapped, code),
      {},
      async () => {
        calls++;
        return new Response('DO_NOT_LEAK', { status });
      },
    );
    assert.equal(calls, 1);
  }
  for (const raw of [
    'not json',
    '{}',
    'x'.repeat(65537),
    JSON.stringify(user(OTHER)),
    JSON.stringify({ ...user(), is_anonymous: true }),
  ]) {
    await fixture(
      async (base) => {
        const response = await request(base);
        assert.ok([401, 503].includes(response.status));
        const data = apiErrorResponseSchema.parse(await response.json());
        assert.ok(['AUTH_INVALID', 'AUTH_UNAVAILABLE'].includes(data.error.code));
      },
      {},
      async () => new Response(raw),
    );
  }
});
test('auth timeout bounds hanging fetch/body, aborts provider, and already-cancelled requests never call it', async () => {
  let signal;
  await fixture(
    async (base) => error(await request(base), 504, 'REQUEST_TIMEOUT'),
    { AUTH_TIMEOUT_MS: '100' },
    async (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  );
  assert.equal(signal.aborted, true);
  await fixture(
    async (base) => error(await request(base), 504, 'REQUEST_TIMEOUT'),
    { AUTH_TIMEOUT_MS: '100' },
    async () => new Response(new ReadableStream({ start() {} })),
  );
  const cancelled = new AbortController();
  cancelled.abort();
  const verifier = new AuthVerifier(readConfig(env), {
    now: () => NOW,
    fetcher: async () => assert.fail('cancelled'),
  });
  await assert.rejects(verifier.verify(`Bearer ${token()}`, {}, cancelled.signal), {
    code: 'AUTH_CANCELLED',
  });
});
test('auth concurrency and global rate cannot be bypassed by forwarded headers; shutdown aborts work', async () => {
  const verifier = new AuthVerifier(readConfig(env), {
    now: () => NOW,
    fetcher: async () => new Promise(() => {}),
  });
  const pending = Array.from({ length: 4 }, () =>
    verifier.verify(`Bearer ${token()}`, {}, new AbortController().signal).catch((e) => e.code),
  );
  await assert.rejects(verifier.verify(`Bearer ${token()}`, {}, new AbortController().signal), {
    code: 'AUTH_BUSY',
  });
  verifier.onModuleDestroy();
  assert.deepEqual(await Promise.all(pending), Array(4).fill('AUTH_CANCELLED'));
  await fixture(
    async (base) => {
      for (let i = 0; i < 60; i++)
        assert.equal(
          (await request(base, 'bad-token', '', { 'x-forwarded-for': String(i) })).status,
          401,
        );
      await error(await request(base), 429, 'AUTH_RATE_LIMITED');
    },
    {},
    async () => assert.fail('invalid tokens must not reach provider'),
  );
});
test('auth config rejects arbitrary provider URLs, secret/service credentials and invalid deadlines without echoing values', () => {
  for (const patch of [
    { SUPABASE_AUTH_URL: 'http://localhost:3000' },
    { SUPABASE_AUTH_URL: `${URL}/` },
    { SUPABASE_AUTH_URL: 'https://user:DO_NOT_LEAK@example.com' },
    { SUPABASE_PUBLISHABLE_KEY: 'sb_secret_DO_NOT_LEAK' },
    { SUPABASE_PUBLISHABLE_KEY: token({ role: 'service_role' }) },
    { AUTH_TIMEOUT_MS: '5000' },
  ]) {
    assert.throws(
      () => readConfig({ ...env, ...patch }),
      (e) => e.message.startsWith('Invalid API config:') && !e.message.includes('DO_NOT_LEAK'),
    );
  }
});
test('user auth does not grant Gemini backend access and demo session does not expose auth route', async () => {
  await fixture(
    async (base) => {
      const response = await fetch(`${base}/v1/ai/itineraries`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'QA',
          destinationId: 'da-lat',
          startDate: '2099-01-01',
          durationDays: 1,
          people: 2,
          budgetVnd: null,
        }),
      });
      await error(response, 401, 'AI_ACCESS_DENIED');
    },
    {
      GEMINI_ENABLED: 'true',
      GEMINI_API_KEY: 'offline-provider-key-00000000',
      AI_ACCESS_TOKEN: 'offline-backend-token-00000000000',
    },
    async () => assert.fail('no auth provider call for AI'),
  );
  const code = 'offline-demo-session-000000';
  const { app } = await createDemoApi(
    env,
    undefined,
    {},
    { token: code, expiresAt: Date.now() + 60000 },
    { fetcher: async () => assert.fail('demo route must stay closed') },
  );
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/v1/auth/me`, {
      headers: { authorization: `Bearer ${code}` },
    });
    await error(response, 404, 'NOT_FOUND');
  } finally {
    await app.close();
  }
});
