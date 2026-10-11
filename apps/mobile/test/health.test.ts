import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HealthResponse } from '@goease/contracts';
import { apiBaseUrl } from '../src/lib/config.ts';
import { createHealthClient, HealthFailure, type HealthFetch } from '../src/lib/health.ts';
import { createHealthStore } from '../src/features/health/store.ts';
import { buildConfig } from '../app.config.ts';

const health: HealthResponse = { status: 'ok', service: 'goease-api', scope: 'api-only', timestamp: '2026-10-11T08:00:00.000Z' };
const signal = () => new AbortController().signal;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

test('Gửi health request đúng URL, không credential, validate runtime trước success', async () => {
  const fetcher: HealthFetch = async (url, options) => {
    assert.equal(url, 'https://api.goease.test/api/health');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(health);
  };
  assert.deepEqual(await createHealthClient('https://api.goease.test/api', fetcher)(signal()), health);
});

for (const [name, response, code] of [
  ['HTTP lỗi', () => new Response('server details should not reach UI', { status: 500 }), 'http'],
  ['payload sai', () => Response.json({ ...health, service: 'other' }), 'contract'],
  ['JSON lỗi', () => new Response('not-json'), 'contract'],
] as const) {
  test(`Từ chối ${name}`, async () => {
    await assert.rejects(createHealthClient('https://api.goease.test/api', async () => response())(signal()), { code });
  });
}

test('Network failure được che chi tiết nội bộ và không tự retry', async () => {
  let calls = 0;
  const load = createHealthClient('https://api.goease.test/api', async () => { calls++; throw new Error('sensitive internal diagnostic'); });
  await assert.rejects(load(signal()), (error: unknown) => error instanceof HealthFailure && error.code === 'network' && !error.message.includes('sensitive'));
  assert.equal(calls, 1);
});

test('Timeout hủy transport và báo timeout; cancel người dùng không thành timeout', async () => {
  const hanging: HealthFetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  await assert.rejects(createHealthClient('https://api.goease.test/api', hanging, 10)(signal()), { code: 'timeout' });
  const controller = new AbortController();
  const pending = createHealthClient('https://api.goease.test/api', hanging)(controller.signal);
  controller.abort();
  await assert.rejects(pending, { code: 'cancelled' });
});

test('Yêu cầu đã cancel không gửi fetch', async () => {
  let calls = 0;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createHealthClient('https://api.goease.test/api', async () => { calls++; return Response.json(health); })(controller.signal), { code: 'cancelled' });
  assert.equal(calls, 0);
});

test('Controller loading → success → loading → error → retry success, xóa success cũ khi lỗi', async () => {
  const states: string[] = [];
  let calls = 0;
  const store = createHealthStore(async () => { calls++; if (calls === 2) throw new HealthFailure('network'); return health; });
  const unsubscribe = store.subscribe(() => states.push(store.snapshot().kind));
  await store.retry();
  await store.retry();
  assert.equal(store.snapshot().kind, 'error');
  assert.ok(!('health' in store.snapshot()));
  await store.retry();
  assert.deepEqual(states, ['loading', 'success', 'loading', 'error', 'loading', 'success']);
  assert.equal(calls, 3);
  unsubscribe();
});

test('Retry hủy request trước, response cũ không ghi đè lần mới', async () => {
  const old = deferred<HealthResponse>(); const current = deferred<HealthResponse>();
  const signals: AbortSignal[] = [];
  const store = createHealthStore(async requestSignal => { signals.push(requestSignal); return signals.length === 1 ? old.promise : current.promise; });
  const first = store.retry(); const second = store.retry();
  assert.equal(signals[0]!.aborted, true);
  const newest = { ...health, timestamp: '2026-10-11T08:01:00.000Z' };
  current.resolve(newest); await second;
  old.resolve(health); await first;
  assert.deepEqual(store.snapshot(), { kind: 'success', health: newest });
});

test('Unmount/cancel không publish lỗi hay success; retry sau cancel vẫn hoạt động', async () => {
  const old = deferred<HealthResponse>(); let calls = 0;
  const store = createHealthStore(async () => ++calls === 1 ? old.promise : health);
  let published = 0; store.subscribe(() => published++);
  const first = store.retry(); store.cancel(); old.reject(new Error('late failure')); await first;
  assert.equal(published, 1);
  await store.retry(); assert.equal(store.snapshot().kind, 'success');
});

test('API URL phân biệt development local và preview HTTPS, không nhận credentials/query', () => {
  for (const url of ['http://10.0.2.2:3000/api/', 'http://127.0.0.1:3000/api', 'http://192.168.1.5:3000/api', 'http://172.16.0.1/api']) {
    assert.equal(apiBaseUrl(url, 'development'), url.replace(/\/$/, ''));
    assert.throws(() => apiBaseUrl(url, 'preview'));
  }
  for (const url of [undefined, 'bad-url', 'http://public.example/api', 'http://10.attacker.example/api', 'https://user:password@api.goease.test/api', 'https://api.goease.test/api?key=hidden', 'https://api.goease.test/api#fragment']) {
    assert.throws(() => apiBaseUrl(url, 'development'));
  }
  assert.equal(apiBaseUrl('https://api.goease.test/api/', 'preview'), 'https://api.goease.test/api');
});

test('Preview build từ chối API chưa cấp/HTTP; identity riêng và không nới ATS/cleartext', () => {
  assert.throws(() => buildConfig({ GOEASE_APP_VARIANT: 'preview' }));
  assert.throws(() => buildConfig({ GOEASE_APP_VARIANT: 'preview', EXPO_PUBLIC_API_BASE_URL: 'http://10.0.2.2:3000/api' }));
  assert.throws(() => buildConfig({ GOEASE_APP_VARIANT: 'other' }));
  const preview = buildConfig({ GOEASE_APP_VARIANT: 'preview', EXPO_PUBLIC_API_BASE_URL: 'https://api.goease.test/api' });
  const dev = buildConfig({});
  assert.deepEqual(preview.platforms, ['android', 'ios']);
  assert.notEqual(preview.android?.package, dev.android?.package);
  assert.notEqual(preview.ios?.bundleIdentifier, dev.ios?.bundleIdentifier);
  assert.deepEqual(preview.ios?.infoPlist?.NSAppTransportSecurity, { NSAllowsArbitraryLoads: false });
  assert.ok(!preview.ios?.infoPlist?.NSLocalNetworkUsageDescription);
  assert.deepEqual(preview.plugins?.[1], ['./plugins/with-development-network.cjs', { allowHttp: false }]);
  assert.deepEqual(dev.plugins?.[1], ['./plugins/with-development-network.cjs', { allowHttp: true }]);
  assert.deepEqual(preview.extra?.eas, { projectId: '38b47740-0837-4b2c-a34e-95be5c4cffa6' });
  assert.equal(preview.owner, 'nyan1126s-team');
});
