import test from 'node:test';
import assert from 'node:assert/strict';
import { isAccountApiOrigin } from '@goease/trip-client/api-origin';
import { createAuthPilot } from '@goease/trip-client/auth-pilot-controller';
import { callServerTripApi } from '@goease/trip-client/server-trip-controller';
import { callDestinationSearchApi } from '@goease/trip-client/discovery-api-controller';
import { fetchManagedCatalog } from '@goease/trip-client/catalog-api-controller';

const token = 'fixture.access.signature';
const localOrigins = ['http://127.0.0.1:3000', 'http://localhost:3000', 'http://[::1]:3000'];
const rejectedOrigins = [
  'http://192.168.1.5:3000',
  'http://0.0.0.0:3000',
  'http://example.com',
  'http://localhost.evil.test:3000',
  'http://127.0.0.1.evil.test',
  'http://user:password@127.0.0.1:3000',
  'http://127.0.0.1:3000/',
  'http://127.0.0.1:3000/path',
  'http://127.0.0.1:3000?q=x',
  'http://127.0.0.1:3000#x',
  'file:///local',
  'invalid',
];

test('account origin accepts exact HTTPS and loopback HTTP, rejects LAN/public HTTP and URL payloads', () => {
  for (const base of [...localOrigins, 'https://api.goease.test'])
    assert.equal(isAccountApiOrigin(base), true, base);
  for (const base of rejectedOrigins) assert.equal(isAccountApiOrigin(base), false, base);
});

test('catalog, trips and destination search reach loopback, but never dispatch to HTTP LAN/public', async () => {
  for (const base of localOrigins) {
    let calls = 0;
    const fetcher = async (url, init) => {
      calls++;
      assert.equal(url.startsWith(base + '/v1/'), true);
      assert.equal(init.redirect, 'error');
      return new Response('{}', { status: 503 });
    };
    await assert.rejects(fetchManagedCatalog(base, fetcher));
    await assert.rejects(callServerTripApi(base, token, { kind: 'list' }, { fetcher }));
    await assert.rejects(callDestinationSearchApi(base, token, 'Hà Nội', { fetcher }));
    assert.equal(calls, 3);
  }
  for (const base of rejectedOrigins) {
    const fetcher = async () => assert.fail('Must not send a request to ' + base);
    await assert.rejects(fetchManagedCatalog(base, fetcher), { code: 'CONFIG' });
    await assert.rejects(callServerTripApi(base, token, { kind: 'list' }, { fetcher }), {
      code: 'CONFIG',
    });
    await assert.rejects(callDestinationSearchApi(base, token, 'Hà Nội', { fetcher }), {
      code: 'CONFIG',
    });
  }
});

test('auth verifies a loopback backend and blocks HTTP LAN before sending the bearer token', async () => {
  for (const base of [...localOrigins, 'http://192.168.1.5:3000']) {
    const id = '12345678-1234-4234-8234-123456789abc';
    const backendCalls = [];
    const auth = createAuthPilot({
      url: 'https://abcdefghijklmnopqrst.supabase.co',
      key: 'sb_publishable_offline_fixture_00000000',
      requiredProvider: 'google',
      now: () => 1800000000000,
      storage: { get: async () => null, set: async () => {}, remove: async () => {} },
      fetcher: async (url, init) => {
        if (url.endsWith('/user'))
          return new Response(
            JSON.stringify({
              id,
              aud: 'authenticated',
              role: 'authenticated',
              identities: [{ provider: 'google' }],
            }),
          );
        backendCalls.push({ url, authorization: init.headers.authorization });
        return new Response(
          JSON.stringify({ apiVersion: '1', identity: { id, provider: 'supabase' } }),
        );
      },
    });
    await auth.acceptOAuth({
      access_token: token,
      refresh_token: 'fixture_refresh_123',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 1800003600,
    });
    await auth.verifyBackend(base);
    if (localOrigins.includes(base)) {
      assert.equal(auth.snapshot().phase, 'backend-verified');
      assert.deepEqual(backendCalls, [
        { url: base + '/v1/auth/me', authorization: 'Bearer ' + token },
      ]);
    } else {
      assert.notEqual(auth.snapshot().phase, 'backend-verified');
      assert.deepEqual(backendCalls, []);
    }
  }
});
