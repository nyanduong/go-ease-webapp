import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthPilot } from '@goease/trip-client/auth-pilot-controller';
import { createRefreshStorage, parseSavedSession } from '../src/platform/refresh-storage.ts';
const id = '12345678-1234-4234-8234-123456789abc',
  other = '22345678-1234-4234-8234-123456789abc';
const initial = {
  token_type: 'bearer',
  access_token: 'initial.access.signature',
  refresh_token: 'initial_refresh_123',
  expires_in: 90,
  expires_at: 1800000090,
};
function memory() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}
test('persistent storage keeps only refresh and verified owner; upgrades tab credential and clears both on logout', async () => {
  const local = memory(),
    tab = memory(),
    storage = createRefreshStorage(local, tab, 'session', 'legacy');
  tab.setItem('legacy', 'old_refresh_token');
  assert.equal(await storage.get(), 'old_refresh_token');
  assert.equal(local.values.size, 0);
  await storage.set('rotated_refresh_token', id);
  assert.equal(tab.values.size, 0);
  assert.equal(storage.owner(), id);
  assert.deepEqual(parseSavedSession(local.getItem('session')), {
    refreshToken: 'rotated_refresh_token',
    ownerId: id,
  });
  await storage.set('second_refresh_token', id);
  assert.equal(local.values.size, 1);
  assert.equal(await storage.get(), 'second_refresh_token');
  await storage.remove();
  assert.equal(storage.exists(), false);
  local.setItem('session', 'malformed');
  assert.equal(await storage.get(), 'invalid');
  assert.equal(
    parseSavedSession(
      JSON.stringify({ version: 1, refreshToken: 'valid_refresh_token', ownerId: 'fake-role' }),
    ),
    null,
  );
});
async function fixture() {
  const state = { now: 1800000000000, saved: null, mode: 'ok', calls: [], phases: [], user: id };
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const auth = createAuthPilot({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    key: 'sb_publishable_offline_fixture_00000000',
    requiredProvider: 'google',
    refreshOnUnauthorized: true,
    preserveRefreshOnTransient: true,
    now: () => state.now,
    storage: {
      get: async () => state.saved,
      set: async (value) => {
        state.saved = value;
      },
      remove: async () => {
        state.saved = null;
      },
    },
    onChange: (value) => state.phases.push(value.phase),
    fetcher: async (url, init) => {
      state.calls.push({ url, init });
      if (url.includes('grant_type=refresh_token')) {
        if (state.mode === 'offline') throw new TypeError('offline');
        if (state.mode === 'revoked') return response({}, 400);
        return response({
          ...initial,
          access_token: 'rotated.access.signature',
          refresh_token: 'rotated_refresh_123',
          expires_in: 3600,
          expires_at: Math.floor(state.now / 1000) + 3600,
        });
      }
      if (url.endsWith('/user'))
        return response({
          id: state.user,
          aud: 'authenticated',
          role: 'authenticated',
          identities: [{ provider: 'google' }],
        });
      if (url.endsWith('/v1/auth/me'))
        return response({ apiVersion: '1', identity: { id: state.user, provider: 'supabase' } });
      if (state.mode === 'unauthorized')
        return response(
          {
            apiVersion: '1',
            statusCode: 401,
            error: { code: 'AUTH_INVALID', message: 'Expired fixture', requestId: id },
          },
          401,
        );
      return response({ apiVersion: '1', nextCursor: null, items: [] });
    },
  });
  await auth.acceptOAuth(initial);
  await auth.verifyBackend('https://api.goease.test');
  state.calls.length = 0;
  state.phases.length = 0;
  return { auth, state };
}
test('refresh rotates both tokens before expiry without locking UI; later requests use new access token', async () => {
  const { auth, state } = await fixture();
  state.now += 40000;
  assert.equal(auth.needsRefresh(), true);
  await Promise.all([auth.refreshSession(), auth.refreshSession()]);
  assert.equal(
    state.calls.filter((call) => call.url.includes('grant_type=refresh_token')).length,
    1,
  );
  assert.equal(state.saved, 'rotated_refresh_123');
  assert.equal(auth.snapshot().phase, 'backend-verified');
  assert(state.phases.every((phase) => phase === 'backend-verified'));
  assert.equal(auth.needsRefresh(), false);
  await auth.serverTrips({ kind: 'list' });
  assert.equal(state.calls.at(-1).init.headers.authorization, 'Bearer rotated.access.signature');
});
test('transient refresh failure retains valid access and persistent credential; revoked or wrong-owner token locks session', async () => {
  const { auth, state } = await fixture();
  state.mode = 'offline';
  await auth.refreshSession();
  assert.equal(auth.snapshot().phase, 'backend-verified');
  assert.equal(state.saved, initial.refresh_token);
  state.mode = 'revoked';
  await auth.refreshSession();
  assert.equal(state.saved, null);
  assert.equal(auth.snapshot().userId, null);
  const mismatch = await fixture();
  mismatch.state.user = other;
  await mismatch.auth.refreshSession();
  assert.equal(mismatch.state.saved, null);
  assert.equal(mismatch.auth.snapshot().userId, null);
});

test('an expired access token can be renewed after sleeping without requiring a new Google login', async () => {
  const { auth, state } = await fixture();
  state.now += 120000;
  await auth.refreshSession();
  assert.equal(auth.snapshot().phase, 'backend-verified');
  assert.equal(state.saved, 'rotated_refresh_123');
  assert(state.phases.every((phase) => phase === 'backend-verified'));
});

test('an API 401 hides private data but preserves refresh for automatic re-verification', async () => {
  const { auth, state } = await fixture();
  state.mode = 'unauthorized';
  await assert.rejects(auth.serverTrips({ kind: 'list' }));
  assert.equal(auth.snapshot().userId, null);
  assert.equal(state.saved, initial.refresh_token);
  state.mode = 'ok';
  await auth.restore();
  await auth.verifyBackend('https://api.goease.test');
  assert.equal(auth.snapshot().phase, 'backend-verified');
  assert.equal(state.saved, 'rotated_refresh_123');
});
