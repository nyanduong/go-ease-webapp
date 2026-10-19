import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemoApi as createApi } from '../dist-demos/dev/demos/create-demo-api.js';
import { demoGuard } from '../dist-demos/dev/demos/ai/session.js';
import { getDalatCatalog } from '@goease/catalog';
import { aiItineraryResponseSchema, apiErrorResponseSchema } from '@goease/contracts';

const token = 'temporary-demo-code-00000000',
  backend = 'private-backend-bearer-00000000000';
test('demo session rejects unsafe startup and bounds TTL/rate without trusting forwarded IP', () => {
  let time = Date.now();
  const session = { token, expiresAt: time + 1000, now: () => time };
  for (const invalid of [
    { ...session, token: 'short' },
    { ...session, expiresAt: time },
    { ...session, expiresAt: time + 3600001 },
  ])
    assert.throws(() => demoGuard(invalid, backend, '127.0.0.1'));
  assert.throws(() => demoGuard(session, backend, '0.0.0.0'));
  const guard = demoGuard(session, backend, '127.0.0.1');
  for (let i = 0; i < 60; i++)
    assert.throws(
      () =>
        guard({
          headers: { 'x-forwarded-for': String(i) },
          originalUrl: '/v1/health',
          method: 'GET',
        }),
      { code: 'AI_ACCESS_DENIED' },
    );
  assert.throws(() => guard({ headers: {} }), { code: 'AI_RATE_LIMITED' });
  time += 60000;
  assert.throws(() => guard({ headers: { authorization: `Bearer ${token}` } }), {
    code: 'AI_ACCESS_DENIED',
  });
});

test('real demo HTTP protects every route, delegates only scoped requests, retains AI validation/quota and expires', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goease-demo-'));
  let calls = 0,
    time = Date.now();
  const { app } = await createApi(
    {
      GEMINI_ENABLED: 'true',
      GEMINI_API_KEY: 'offline-provider-key-00000000',
      AI_ACCESS_TOKEN: backend,
      GEMINI_STATE_DIR: directory,
      GEMINI_MAX_TOTAL_ATTEMPTS: '1',
    },
    undefined,
    {
      provider: {
        generate: async (body) => {
          calls++;
          const prompt = JSON.parse(JSON.parse(body).contents[0].parts[0].text);
          return {
            days: [
              {
                date: prompt.dates[0],
                activities: [
                  { placeId: getDalatCatalog()[0].id, startTime: '09:00', endTime: '10:00' },
                ],
              },
            ],
          };
        },
      },
    },
    { token, expiresAt: time + 10000, now: () => time },
  );
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const request = (path, auth = token, options = {}) =>
      fetch(base + path, {
        ...options,
        headers: { authorization: `Bearer ${auth}`, ...options.headers },
      });
    for (const path of ['/v1/health', '/v1/catalog', '/v1/ai/itineraries']) {
      for (const auth of ['', backend, 'bad-demo-token-00000000'])
        assert.equal((await request(path, auth)).status, 401);
    }
    assert.equal((await request('/v1/health')).status, 200);
    assert.equal((await (await request('/v1/catalog')).json()).catalog.entries.length, 15);
    assert.equal((await request('/private')).status, 404);
    assert.equal((await request('/v1/health', token, { method: 'POST' })).status, 404);
    assert.equal(
      (await request('/v1/health', token, { headers: { origin: 'https://evil.example' } })).status,
      403,
    );
    const options = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'QA',
        destinationId: 'da-lat',
        startDate: '2099-01-01',
        durationDays: 1,
        people: 2,
        budgetVnd: null,
      }),
    };
    assert.equal(
      (await request('/v1/ai/itineraries', token, { ...options, body: '{}' })).status,
      400,
    );
    assert.equal(calls, 0);
    const success = await request('/v1/ai/itineraries', token, options);
    assert.equal(success.status, 200);
    aiItineraryResponseSchema.parse(await success.json());
    assert.equal(calls, 1);
    const limited = await request('/v1/ai/itineraries', token, options);
    assert.equal(limited.status, 429);
    const raw = await limited.text();
    assert.equal(apiErrorResponseSchema.parse(JSON.parse(raw)).error.code, 'AI_BUDGET_EXCEEDED');
    assert.equal(raw.includes(token), false);
    assert.equal(raw.includes(backend), false);
    assert.equal(calls, 1);
    time += 10001;
    assert.equal((await request('/v1/health')).status, 401);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
