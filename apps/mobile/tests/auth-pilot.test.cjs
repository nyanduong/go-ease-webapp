const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthPilot, authProject } = require('../.logic-tests/auth-pilot-controller.js');
const url = 'https://abcdefghijklmnopqrst.supabase.co', key = 'sb_publishable_offline_fixture_00000000';
const id = '12345678-1234-4234-8234-123456789abc', other = 'b5aa7f8a-1711-4c09-b432-bcf075c57b5f';
const token = { access_token: 'offline.fixture.signature', refresh_token: 'fixture_refresh', token_type: 'bearer', expires_in: 3600, expires_at: 1800003600 };
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
const user = userId => ({ id: userId, aud: 'authenticated', role: 'authenticated', email: 'DO_NOT_LEAK', is_anonymous: false });
function fixture(patch = {}) {
  let saved = null; const calls = [];
  const storage = { get: async () => saved, set: async value => { saved = value; }, remove: async () => { saved = null; } };
  const pilot = createAuthPilot({ url, key, now: () => 1800000000000, storage, fetcher: async (target, options) => {
    calls.push({ target, options });
    if (target.includes('/token?')) return response(token);
    if (target.endsWith('/user')) return response(user(id));
    if (target.includes('/logout?')) return new Response(null, { status: 204 });
    return response({ apiVersion: '1', identity: { id, provider: 'supabase' } });
  }, ...patch });
  return { pilot, calls, storage, saved: () => saved };
}
test('pilot sends password only to fixed Supabase HTTPS, validates user, persists only refresh; restore verifies again', async () => {
  const f = fixture(); await f.pilot.login('user@example.test', 'PRIVATE_PASSWORD');
  assert.equal(f.pilot.snapshot().phase, 'provider-verified'); assert.equal(f.pilot.snapshot().userId, id);
  assert.equal(f.saved(), token.refresh_token); assert.equal(JSON.stringify(f.pilot.snapshot()).includes('PRIVATE_PASSWORD'), false);
  assert.equal(JSON.stringify(f.pilot.snapshot()).includes(token.access_token), false); assert.equal(JSON.stringify(f.pilot.snapshot()).includes('DO_NOT_LEAK'), false);
  assert.equal(f.calls[0].target, url + '/auth/v1/token?grant_type=password'); assert.equal(f.calls[0].options.redirect, 'error');
  assert.equal(f.calls[1].options.headers.authorization, 'Bearer ' + token.access_token);
  f.pilot.cancel(); assert.equal(f.pilot.snapshot().userId, null); await f.pilot.restore();
  assert.equal(f.calls[2].target, url + '/auth/v1/token?grant_type=refresh_token'); assert.equal(f.calls.length, 4); assert.equal(f.pilot.snapshot().userId, id);
});
test('pilot distinguishes backend confirmation from provider; no HTTP/token transfer to LAN or Metro', async () => {
  for (const base of [undefined, 'http://192.168.1.2:3000', 'https://user:pass@example.test', 'https://example.test/path']) {
    const f = fixture(); await f.pilot.login('u@example.test', 'p'); await f.pilot.verifyBackend(base);
    assert.equal(f.calls.length, 2); assert.equal(f.pilot.snapshot().phase, 'unverified');
  }
  const f = fixture(); await f.pilot.login('u@example.test', 'p'); await f.pilot.verifyBackend('https://api.example.test');
  assert.equal(f.pilot.snapshot().phase, 'backend-verified'); assert.equal(f.calls[2].target, 'https://api.example.test/v1/auth/me');
});
test('provider denial, fake user/anonymous, malformed session and storage failure never report authenticated; no retries', async () => {
  for (const fetcher of [async () => response({ message: 'DO_NOT_LEAK' }, 400), async () => response({ ...token, refresh_token: 'bad' }), async target => response(target.includes('/token?') ? token : { ...user(id), is_anonymous: true })]) {
    const f = fixture({ fetcher }); await f.pilot.login('u@example.test', 'p'); assert.equal(f.pilot.snapshot().phase, 'unverified'); assert.equal(f.saved(), null); assert.equal(f.pilot.snapshot().message.includes('DO_NOT_LEAK'), false);
  }
  let removed = 0; const f = fixture({ storage: { get: async () => null, set: async () => { throw Error('DO_NOT_LEAK'); }, remove: async () => { removed++; } } });
  await f.pilot.login('u@example.test', 'p'); assert.equal(f.pilot.snapshot().userId, null); assert.equal(removed, 2);
});
test('double tap, cancellation and late storage completion cannot resurrect or persist cancelled login', async () => {
  let release; let stored = null; const f = fixture({ storage: { get: async () => stored, set: value => new Promise(resolve => { stored = value; release = resolve; }), remove: async () => { stored = null; } } });
  const first = f.pilot.login('u@example.test', 'p'); await new Promise(resolve => setImmediate(resolve));
  await f.pilot.login('other@example.test', 'p'); assert.equal(f.calls.length, 2);
  f.pilot.cancel(); release(); await first; assert.equal(stored, null); assert.equal(f.pilot.snapshot().userId, null); assert.equal(f.pilot.snapshot().busy, false);
});
test('hanging transport/body is bounded; cancelled request cannot log in later', async () => {
  let signal; const f = fixture({ timeoutMs: 100, fetcher: async (_url, options) => { signal = options.signal; return new Promise(() => {}); } });
  await f.pilot.login('u@example.test', 'p'); assert.equal(signal.aborted, true); assert.match(f.pilot.snapshot().message, /quá thời gian/); assert.equal(f.pilot.snapshot().userId, null);
  const hanging = fixture({ fetcher: async () => new Promise(() => {}) }); const operation = hanging.pilot.login('u@example.test', 'p'); await new Promise(resolve => setImmediate(resolve)); hanging.pilot.cancel(); await operation; assert.equal(hanging.pilot.snapshot().userId, null);
});
test('logout removes local refresh and revokes only current session; expired local access cannot authorize backend', async () => {
  const f = fixture(); await f.pilot.login('u@example.test', 'p'); await f.pilot.logout();
  assert.equal(f.saved(), null); assert.equal(f.pilot.snapshot().phase, 'signed-out'); assert.match(f.calls[2].target, /logout\?scope=local$/); assert.match(f.pilot.snapshot().message, /tới exp/);
  let clock = 1800000000000; const expired = fixture({ now: () => clock }); await expired.pilot.login('u@example.test', 'p'); clock += 3600000; assert.equal(expired.pilot.snapshot().userId, null); await expired.pilot.verifyBackend('https://api.example.test'); assert.equal(expired.calls.length, 2);
});
test('logout during pending login waits for storage cleanup; failed erase or remote revoke never claims complete logout', async () => {
  let release; let saved = null; const f = fixture({ storage: { get: async () => saved, set: v => new Promise(resolve => { saved = v; release = resolve; }), remove: async () => { saved = null; } } });
  const login = f.pilot.login('u@example.test', 'p'); await new Promise(resolve => setImmediate(resolve)); const logout = f.pilot.logout(); release(); await login; await logout; assert.equal(saved, null); assert.equal(f.pilot.snapshot().userId, null);
  const erase = fixture({ storage: { get: async () => null, set: async () => {}, remove: async () => { throw Error(); } } }); await erase.pilot.logout(); assert.equal(erase.pilot.snapshot().phase, 'unverified'); assert.match(erase.pilot.snapshot().message, /Không xóa/);
});
test('backend UUID mismatch and account switch never reuse the previous verified identity', async () => {
  let selected = id; const f = fixture({ fetcher: async target => response(target.includes('/token?') ? token : target.endsWith('/user') ? user(selected) : { apiVersion: '1', identity: { id: other, provider: 'supabase' } }) });
  await f.pilot.login('a@example.test', 'p'); await f.pilot.verifyBackend('https://api.example.test'); assert.equal(f.pilot.snapshot().userId, null);
  selected = other; await f.pilot.login('b@example.test', 'p'); assert.equal(f.pilot.snapshot().userId, other); assert.equal(f.pilot.snapshot().phase, 'provider-verified');
});
test('project config refuses service keys, arbitrary origins, credentials and paths before a network call', () => {
  for (const invalid of ['', 'http://abcdefghijklmnopqrst.supabase.co', url + '/', 'https://evil.test', 'https://password@abcdefghijklmnopqrst.supabase.co']) assert.throws(() => authProject(invalid, key));
  assert.throws(() => authProject(url, 'sb_secret_not_allowed')); assert.deepEqual(authProject(url, key), { url, key });
});
test('refresh rotation storage failure erases old credential; backend errors and remote logout never fake success', async () => {
  let saved = token.refresh_token;
  const storage = { get: async () => saved, set: async () => { throw Error('DO_NOT_LEAK'); }, remove: async () => { saved = null; } };
  const rotated = fixture({ storage }); await rotated.pilot.restore(); assert.equal(saved, null); assert.equal(rotated.pilot.snapshot().userId, null); assert.match(rotated.pilot.snapshot().message, /Không lưu/);
  const revoked = fixture({ fetcher: async target => response(target.includes('/token?') ? token : target.endsWith('/user') ? user(id) : { message: 'DO_NOT_LEAK' }, target.includes('/logout?') ? 500 : 200) });
  await revoked.pilot.login('u@example.test', 'p'); await revoked.pilot.logout(); assert.equal(revoked.saved(), null); assert.equal(revoked.pilot.snapshot().phase, 'unverified'); assert.match(revoked.pilot.snapshot().message, /chưa xác nhận revoke/);
});
test('oversize body and hanging body fail closed within deadline without persisting refresh', async () => {
  for (const fetcher of [async () => response('x'.repeat(66000)), async () => ({ ok: true, text: () => new Promise(() => {}) })]) {
    const f = fixture({ fetcher, timeoutMs: 100 }); await f.pilot.login('u@example.test', 'p'); assert.equal(f.saved(), null); assert.equal(f.pilot.snapshot().userId, null); assert.equal(f.pilot.snapshot().busy, false);
  }
});
