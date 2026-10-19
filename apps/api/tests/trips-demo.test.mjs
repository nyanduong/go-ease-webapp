import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripsDemoGuard } from '../dist-demos/dev/demos/trips/session.js';
import { readConfig } from '../dist/config/env.js';
const config = readConfig({
  TRIPS_ENABLED: 'true',
  AUTH_ENABLED: 'true',
  API_REQUEST_TIMEOUT_MS: '8000',
  DATABASE_URL: 'postgresql://goease_runtime:offline_fixture@127.0.0.1:55475/goease_test_guard',
});
test('private-trip QA opens only scoped native identity/trip routes and expires within 30 minutes', () => {
  let now = 1000;
  const guard = tripsDemoGuard({ expiresAt: 2000, now: () => now }, config);
  for (const [method, originalUrl] of [
    ['GET', '/v1/auth/me'],
    ['GET', '/v1/trips?cursor=abc'],
    ['POST', '/v1/trips'],
    ['PUT', '/v1/trips/abc'],
    ['DELETE', '/v1/trips/abc'],
  ])
    assert.doesNotThrow(() => guard({ method, originalUrl, headers: {} }));
  for (const originalUrl of [
    '/v1/catalog',
    '/health',
    '/v1/ai/itinerary',
    '/v1/auth/me?x=1',
    '/v1/trips/../admin',
  ])
    assert.throws(() => guard({ method: 'GET', originalUrl, headers: {} }), { code: 'NOT_FOUND' });
  assert.throws(
    () =>
      guard({
        method: 'GET',
        originalUrl: '/v1/trips',
        headers: { origin: 'https://example.test' },
      }),
    { code: 'ORIGIN_NOT_ALLOWED' },
  );
  now = 2000;
  assert.throws(() => guard({ method: 'GET', originalUrl: '/v1/trips', headers: {} }), {
    code: 'AUTH_INVALID',
  });
  for (const patch of [
    { GEMINI_ENABLED: true },
    { GEMINI_API_KEY: 'fixture' },
    { AI_ACCESS_TOKEN: 'fixture' },
    { API_HOST: '0.0.0.0' },
    { AUTH_ENABLED: false },
    { TRIPS_ENABLED: false },
  ])
    assert.throws(() =>
      tripsDemoGuard({ expiresAt: 2000, now: () => 1000 }, { ...config, ...patch }),
    );
  assert.throws(() => tripsDemoGuard({ expiresAt: 1801001, now: () => 1000 }, config));
});
test('private-trip QA has a process rate bound before authentication', () => {
  const guard = tripsDemoGuard({ expiresAt: 2000, now: () => 1000 }, config),
    req = { method: 'GET', originalUrl: '/v1/trips', headers: {} };
  for (let i = 0; i < 60; i++) guard(req);
  assert.throws(() => guard(req), { code: 'TRIP_LIMIT' });
});
