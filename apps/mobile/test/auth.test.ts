import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuthChallengeResponse, AuthUser, NativeSessionResponse } from '@goease/contracts';
import { createNativeAuthClient, AuthFailure } from '../src/features/auth/client.ts';
import { createGoogleCredentialProvider, googleConfig, type GoogleSdk } from '../src/features/auth/google.ts';
import { createNativeAuthStore, type SessionVault } from '../src/features/auth/store.ts';
import { buildConfig } from '../app.config.ts';

// All credentials, identities, providers and transports below are test doubles, not Google live.
const opaque = 'A'.repeat(43), nonce = 'B'.repeat(43), proof = 'C'.repeat(43);
const jwt = 'TEST_ONLY.ID_TOKEN.SIGNATURE';
const future = () => new Date(Date.now() + 60_000).toISOString();
const user: AuthUser = { id: '00000000-0000-4000-8000-000000000001', displayName: 'TEST_ONLY', role: 'CUSTOMER' };
const challenge = (): AuthChallengeResponse => ({ challengeId: user.id, transport: 'native', nonce, proof, expiresAt: future() });
const session = (): NativeSessionResponse => ({ transport: 'native', user, expiresAt: future(), accessToken: opaque });
const signal = () => new AbortController().signal;
function vault(value: string | null = null): SessionVault & { value: string | null; saved: string[] } {
  return { value, saved: [], async get() { return this.value; }, async set(token) { this.saved.push(token); this.value = token; }, async delete() { this.value = null; } };
}
const provider = { credential: async () => jwt, signOut: async () => {} };
function fixtureClient(overrides: Partial<ReturnType<typeof createNativeAuthClient>> = {}) {
  return { challenge: async () => challenge(), exchange: async () => session(), current: async () => ({ transport: 'native' as const, user, expiresAt: future() }), logout: async () => {}, ...overrides };
}

test('Shared native session closure cancels dependent calls on restore/logout and refuses late token results', { timeout: 1000 }, async t => {
  const store = createNativeAuthStore(fixtureClient(), provider, vault(opaque)); t.after(store.dispose);
  await store.restore(); let release!: (value: string) => void, transport: AbortSignal | undefined;
  const pending = store.withSession(async (provided, signal) => { assert.equal(provided, opaque); transport = signal; return new Promise<string>(resolve => { release = resolve; }); }, signal());
  await store.restore(); assert.equal(transport?.aborted, true);
  await assert.rejects(pending, { code: 'cancelled' }); release('TEST_ONLY_LATE_RESULT');
  assert.equal(JSON.stringify(store.snapshot()).includes(opaque), false);
  const request = store.withSession(async (_token, signal) => { transport = signal; return new Promise<string>(resolve => { release = resolve; }); }, signal());
  await store.logout(); assert.equal(transport?.aborted, true);
  await assert.rejects(request, { code: 'cancelled' }); release('TEST_ONLY_LATE_RESULT');
  await assert.rejects(store.withSession(async () => 'forbidden', signal()), { code: 'expired' });
});

test('Native auth validates transport and expiry, uses bearer/proof without cookies or role fields', async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const client = createNativeAuthClient('https://api.goease.test/api', async (url, init) => {
    seen.push({ url, init });
    return url.endsWith('challenges/native') ? Response.json(challenge()) : url.endsWith('google/native') ? Response.json(session()) : url.endsWith('/me') ? Response.json({ transport: 'native', user, expiresAt: future() }) : new Response(null, { status: 204 });
  });
  const issued = await client.challenge(signal()); await client.exchange(issued, jwt, signal()); await client.current(opaque, signal()); await client.logout(opaque, signal());
  assert.equal(seen.length, 4);
  for (const item of seen) { assert.equal(item.init.credentials, 'omit'); assert.equal(item.init.redirect, 'error'); assert.equal(item.init.cache, 'no-store'); }
  assert.deepEqual(JSON.parse(seen[1]!.init.body as string), { challengeId: user.id, idToken: jwt });
  assert.equal((seen[1]!.init.headers as Record<string, string>)['X-GoEase-Auth-Proof'], proof);
  assert.equal((seen[2]!.init.headers as Record<string, string>).Authorization, `Bearer ${opaque}`);
});

test('Rejects wrong transport, malformed/oversized bodies and private transport diagnostics', async () => {
  for (const response of [Response.json({ ...challenge(), transport: 'web' }), new Response('not JSON'), new Response('x'.repeat(65_537)), new Response('ă'.repeat(32_769)), Response.json({}, { headers: { 'content-length': '65537' } })]) {
    await assert.rejects(createNativeAuthClient('https://api.test', async () => response).challenge(signal()), { code: 'contract' });
  }
  await assert.rejects(createNativeAuthClient('https://api.test', async () => { throw new Error('PRIVATE_ACCOUNT_TOKEN'); }).challenge(signal()), error => error instanceof AuthFailure && !error.message.includes('PRIVATE'));
});

test('Fetch and body share a finite deadline even if transport ignores AbortSignal; no automatic retry', async () => {
  let calls = 0;
  await assert.rejects(createNativeAuthClient('https://api.test', async () => { calls++; return new Promise(() => {}); }, 15).challenge(signal()), { code: 'timeout' });
  assert.equal(calls, 1);
  const response = Response.json(challenge()); response.text = () => new Promise(() => {});
  await assert.rejects(createNativeAuthClient('https://api.test', async () => response, 15).challenge(signal()), { code: 'timeout' });
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(createNativeAuthClient('https://api.test', async () => { calls++; return response; }).challenge(cancelled.signal), { code: 'cancelled' });
  assert.equal(calls, 1);
});

test('Google config blocks missing/wrong IDs; iOS requires own ID; config plugin contains only a real-format reversed ID', () => {
  const web = '123-test-web.apps.googleusercontent.com', ios = '456-test-ios.apps.googleusercontent.com';
  assert.throws(() => googleConfig(undefined, undefined, 'android'), { code: 'configuration' });
  assert.throws(() => googleConfig(web, undefined, 'ios'), { code: 'configuration' });
  assert.throws(() => googleConfig('autoDetect', ios, 'android'), { code: 'configuration' });
  assert.deepEqual(googleConfig(web, undefined, 'android'), { webClientId: web });
  const absent = buildConfig({}); assert.ok(!JSON.stringify(absent.plugins).includes('nitro-google-signin'));
  const configured = buildConfig({ EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: ios });
  assert.ok(JSON.stringify(configured.plugins).includes('com.googleusercontent.apps.456-test-ios'));
  assert.ok(JSON.stringify(configured.plugins).includes('configureAndroidBackup'));
});

test('Each Google interaction configures raw fresh nonce, explicit picker, no extra scopes/offline access or resolution popup', async () => {
  const calls: unknown[] = [];
  const sdk: GoogleSdk = { configure: options => calls.push(options), checkPlayServices: async dialog => { calls.push(dialog); }, presentExplicitSignIn: async () => ({ type: 'success', data: { idToken: jwt } }), signOut: async () => {} };
  const google = createGoogleCredentialProvider({ webClientId: '123-test.apps.googleusercontent.com' }, sdk);
  assert.equal(await google.credential(nonce, signal()), jwt);
  assert.equal(await google.credential(proof, signal()), jwt);
  assert.deepEqual(calls, [{ webClientId: '123-test.apps.googleusercontent.com', nonce, offlineAccess: false, autoSelectOnSignIn: false }, false,
    { webClientId: '123-test.apps.googleusercontent.com', nonce: proof, offlineAccess: false, autoSelectOnSignIn: false }, false]);
});

test('Native cancel is sanitized and late SDK response cannot permit a concurrent nonce configuration', async () => {
  let resolve!: (value: { type: string; data: { idToken: string } | null }) => void;
  const sdk: GoogleSdk = { configure: () => {}, checkPlayServices: async () => {}, presentExplicitSignIn: () => new Promise(done => { resolve = done; }), signOut: async () => {} };
  const google = createGoogleCredentialProvider({ webClientId: '123-test.apps.googleusercontent.com' }, sdk);
  const controller = new AbortController(), pending = google.credential(nonce, controller.signal);
  await Promise.resolve(); controller.abort(); await assert.rejects(pending, { code: 'cancelled' });
  await assert.rejects(google.credential(proof, signal()), { code: 'provider' });
  resolve({ type: 'cancelled', data: null }); await Promise.resolve();
});

test('Google native dialog wait is finite; late Play Services completion after timeout cannot open a picker', async () => {
  let resolve!: () => void, pickers = 0;
  const sdk: GoogleSdk = { configure: () => {}, checkPlayServices: () => new Promise(done => { resolve = done; }), presentExplicitSignIn: async () => { pickers++; return { type: 'success', data: { idToken: jwt } }; }, signOut: async () => {} };
  const google = createGoogleCredentialProvider({ webClientId: '123-test.apps.googleusercontent.com' }, sdk, 15);
  await assert.rejects(google.credential(nonce, signal()), { code: 'timeout' });
  resolve(); await Promise.resolve(); await Promise.resolve(); assert.equal(pickers, 0);
});

test('Store persists only GoEase token, restore fetches current server role instead of SDK identity', async () => {
  const storage = vault(); let currentCalls = 0;
  const store = createNativeAuthStore(fixtureClient({ current: async () => { currentCalls++; return { transport: 'native', user: { ...user, role: 'ADMIN' }, expiresAt: future() }; } }), provider, storage);
  try {
    await store.restore(); await store.login(); assert.equal(store.snapshot().kind, 'signedIn'); assert.deepEqual(storage.saved, [opaque]);
    assert.ok(!JSON.stringify(store.snapshot()).includes(opaque)); assert.ok(!JSON.stringify(store.snapshot()).includes(jwt));
    await store.restore(); assert.equal(store.snapshot().user?.role, 'ADMIN'); assert.equal(currentCalls, 1);
  } finally { store.dispose(); }
});

test('Expired session is deleted; network failure preserves vault and allows explicit restore retry', async () => {
  const storage = vault(opaque); let expired = false;
  const store = createNativeAuthStore(fixtureClient({ current: async () => { throw new AuthFailure(expired ? 'expired' : 'network'); } }), provider, storage);
  try {
    await store.restore(); assert.equal(store.snapshot().kind, 'error'); assert.equal(storage.value, opaque); assert.equal(store.snapshot().user, undefined);
    expired = true; await store.restore(); assert.equal(store.snapshot().kind, 'signedOut'); assert.equal(storage.value, null);
  } finally { store.dispose(); }
});

test('A stale vault read cannot overwrite a newer login token or make logout revoke the wrong session', async () => {
  const tokenB = 'D'.repeat(43), storage = vault(opaque);
  let resolveOld!: (token: string | null) => void, reads = 0;
  storage.get = async () => ++reads === 1 ? new Promise(done => { resolveOld = done; }) : storage.value;
  const revokedTokens: string[] = [];
  const store = createNativeAuthStore(fixtureClient({ current: async () => { throw new AuthFailure('expired'); },
    exchange: async () => ({ ...session(), accessToken: tokenB }), logout: async token => { revokedTokens.push(token); } }), provider, storage);
  try {
    const stale = store.restore(); await store.restore(); assert.equal(storage.value, null);
    await store.login(); assert.equal(storage.value, tokenB); assert.equal(store.snapshot().kind, 'signedIn');
    resolveOld(opaque); await stale; await store.logout();
    assert.deepEqual(revokedTokens, [tokenB]); assert.equal(storage.value, null); assert.equal(store.snapshot().kind, 'signedOut');
  } finally { store.dispose(); }
});

test('Expired vault deletion holds the session lane until it settles, so a new login cannot be deleted underneath', async () => {
  const storage = vault(opaque); let release!: () => void, reads = 0, exchanges = 0;
  storage.get = async () => { reads++; return storage.value; };
  storage.delete = async () => { await new Promise<void>(done => { release = done; }); storage.value = null; };
  const store = createNativeAuthStore(fixtureClient({ current: async () => { throw new AuthFailure('expired'); }, exchange: async () => { exchanges++; return session(); } }), provider, storage);
  try {
    const restoring = store.restore(); await Promise.resolve(); await Promise.resolve();
    await store.restore(); await store.login(); assert.equal(reads, 1); assert.equal(exchanges, 0);
    release(); await restoring; assert.equal(store.snapshot().kind, 'signedOut');
    await store.login(); assert.equal(exchanges, 1); assert.equal(storage.value, opaque);
  } finally { store.dispose(); }
});

test('Logout requires server acknowledgement; offline failure retains token and explicit cleanup retry', async () => {
  const storage = vault(opaque); let offline = true, calls = 0;
  const store = createNativeAuthStore(fixtureClient({ logout: async token => { assert.equal(token, opaque); calls++; if (offline) throw new AuthFailure('network'); } }), provider, storage);
  try {
    await store.restore(); await store.logout(); assert.equal(store.snapshot().kind, 'cleanupRequired'); assert.equal(storage.value, opaque);
    await store.login(); assert.equal(calls, 1); offline = false; await store.logout(); assert.equal(storage.value, null); assert.equal(store.snapshot().kind, 'signedOut'); assert.equal(calls, 2);
  } finally { store.dispose(); }
});

test('Storage write failure attempts real server revocation, failed revocation stays blocked until explicit retry', async () => {
  const storage = vault(); storage.set = async () => { throw new Error('PRIVATE_KEYCHAIN_DETAIL'); };
  let offline = true, revokes = 0;
  const store = createNativeAuthStore(fixtureClient({ logout: async () => { revokes++; if (offline) throw new AuthFailure('network'); } }), provider, storage);
  try {
    await store.restore(); await store.login(); assert.equal(store.snapshot().kind, 'cleanupRequired'); assert.equal(store.snapshot().user, undefined); assert.equal(revokes, 1);
    assert.ok(!store.snapshot().message.includes('PRIVATE')); offline = false; await store.logout(); assert.equal(revokes, 2); assert.equal(store.snapshot().kind, 'signedOut');
  } finally { store.dispose(); }
});

test('Cancellation and blocked configuration never exchange a late Google identity or call external dependencies', async () => {
  let resolve!: (token: string) => void, exchanges = 0;
  const store = createNativeAuthStore(fixtureClient({ exchange: async () => { exchanges++; return session(); } }), { credential: () => new Promise(done => { resolve = done; }), signOut: async () => {} }, vault());
  try { await store.restore(); const pending = store.login(); await Promise.resolve(); store.cancel(); resolve(jwt); await pending; assert.equal(exchanges, 0); assert.equal(store.snapshot().kind, 'signedOut'); }
  finally { store.dispose(); }
  let calls = 0;
  const blocked = createNativeAuthStore(fixtureClient({ challenge: async () => { calls++; return challenge(); } }), provider, { get: async () => { calls++; return null; }, set: async () => {}, delete: async () => {} }, true);
  await blocked.restore(); await blocked.login(); assert.equal(calls, 0); assert.equal(blocked.snapshot().kind, 'blocked'); blocked.dispose();
});

test('SecureStore deletion failure after confirmed revocation retries local cleanup without a second revoke', async () => {
  const storage = vault(opaque); let deletes = 0, revokes = 0;
  storage.delete = async () => { if (++deletes === 1) throw new Error('private'); storage.value = null; };
  const store = createNativeAuthStore(fixtureClient({ logout: async () => { revokes++; } }), provider, storage);
  try { await store.restore(); await store.logout(); assert.equal(store.snapshot().kind, 'cleanupRequired'); await store.logout(); assert.equal(revokes, 1); assert.equal(storage.value, null); }
  finally { store.dispose(); }
});

test('Google cache cleanup failure cannot undo acknowledged GoEase logout or retain a local token', async () => {
  const storage = vault(opaque);
  const store = createNativeAuthStore(fixtureClient(), { ...provider, signOut: async () => { throw new Error('private Google diagnostic'); } }, storage);
  try { await store.restore(); await store.logout(); assert.equal(store.snapshot().kind, 'signedOut'); assert.equal(storage.value, null); }
  finally { store.dispose(); }
});
