import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserGoogleAuth, safeReturnPath } from '@goease/trip-client/browser-google-auth';
function fixture() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
  let now = 1800000000000;
  const flow = createBrowserGoogleAuth({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    key: 'sb_publishable_offline_fixture_00000000',
    origin: 'http://127.0.0.1:4186',
    namespace: 'test',
    storage,
    now: () => now,
  });
  return {
    values,
    storage,
    flow,
    advance: (ms) => {
      now += ms;
    },
  };
}
test('OAuth return destination only accepts explicit internal routes', () => {
  for (const path of [
    'https://evil.test',
    '//evil.test',
    '/\\evil',
    '/trips?next=https://evil.test',
    '/auth/callback',
    '/trips/../../account',
  ])
    assert.equal(safeReturnPath(path), '/');
  assert.equal(safeReturnPath('/trips/new'), '/trips/new');
  assert.equal(safeReturnPath('/trips/abc-123'), '/trips/abc-123');
});
test('PKCE verifier is tab-local, pending callback expires and cleanup preserves old data', async () => {
  const f = fixture();
  f.values.set('goease.guest-trips.v1', 'preserve');
  const url = new URL(await f.flow.begin('/trips/new'));
  assert.equal(url.searchParams.get('provider'), 'google');
  assert.equal(url.searchParams.get('code_challenge_method'), 's256');
  const marker = JSON.parse(f.values.get('test.google-flow'));
  assert([...f.values.keys()].some((key) => key.includes('code-verifier')));
  f.advance(600001);
  await assert.rejects(() =>
    f.flow.complete('http://127.0.0.1:4186/auth/callback?flow=' + marker.flow + '&code=unused'),
  );
  assert.equal(f.values.get('goease.guest-trips.v1'), 'preserve');
  assert(![...f.values.keys()].some((key) => key.startsWith('test')));
});
test('unrequested, tampered, duplicate and replayed callbacks are consumed without exchanging tokens', async () => {
  for (const suffix of [
    '?flow=wrong&code=x',
    '?code=x&code=y',
    '?error=access_denied',
    '#access_token=untrusted',
  ]) {
    const f = fixture();
    await f.flow.begin('/');
    await assert.rejects(() => f.flow.complete('http://127.0.0.1:4186/auth/callback' + suffix));
    await assert.rejects(() => f.flow.complete('http://127.0.0.1:4186/auth/callback?code=x'));
    assert.equal(f.values.size, 0);
  }
});

test('OAuth keeps only supported destination handoff queries and rejects query redirects or malformed paths', () => {
  for (const path of [
    '/trips/new?destination=ha-noi',
    '/trips/new?destination=da-lat',
    '/trips/new?choose=1',
  ])
    assert.equal(safeReturnPath(path), path);
  for (const path of [
    '/trips/new?next=https://evil.test',
    '/trips/new?destination=ha-noi&next=/account',
    '/trips/new?destination=ha-noi\n',
    '//evil.test/trips/new?choose=1',
    '/trips/new?destination=../account',
  ])
    assert.equal(safeReturnPath(path), '/');
});
