import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import type { SampleMapCatalog, SampleRouteResult } from '@goease/contracts';
import { buildConfig } from '../app.config.ts';
import { createMapsClient, MapFailure } from '../src/features/maps/client.ts';
import { createMapsStore } from '../src/features/maps/store.ts';
import { createLocationStore, type LocationAdapter, type LocationFix } from '../src/features/maps/location.ts';

// TEST ONLY DTOs/transports/location callbacks; none is Maps/location native or Google live evidence.
const ids = ['aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000003'];
const catalog: SampleMapCatalog = { destinationCode: 'VN-HANOI-SAMPLE', isSample: true, places: ids.map((id, index) => ({
  id, name: `TEST ONLY place ${index}`, latitude: 21, longitude: 105,
  sourceUrl: 'https://www.wikidata.org/w/index.php?title=Q1202019&oldid=2549929856', attribution: 'TEST ONLY CC0 fixture',
})) };
const request = { originPlaceId: ids[0]!, destinationPlaceId: ids[1]! }, token = 'A'.repeat(43);
const noRoute: SampleRouteResult = { kind: 'no-route', source: 'google-routes' };
const result: SampleRouteResult = { kind: 'route', source: 'google-routes', attribution: 'Google Maps', distanceMeters: 20,
  durationMilliseconds: 1000, coordinates: [{ latitude: 21, longitude: 105 }, { latitude: 21.001, longitude: 105.001 }], warnings: [] };
const signal = () => new AbortController().signal;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(accept => { resolve = accept; }); return { resolve, promise }; }
function client() { return { catalog: async () => catalog, route: async () => result }; }
function fix(): LocationFix { return { coords: { latitude: 21, longitude: 105, accuracy: 20 }, timestamp: Date.now() }; }
function locationFixture(patch: Partial<LocationAdapter> = {}) {
  let callback!: (position: LocationFix) => void, failure!: () => void, removed = 0, requested = 0, watches = 0;
  const adapter: LocationAdapter = { permission: async () => ({ granted: true, canAskAgain: true }),
    request: async () => { requested++; return { granted: true, canAskAgain: true }; }, services: async () => true,
    watch: async (success, error) => { watches++; callback = success; failure = error; return { remove() { removed++; } }; }, ...patch };
  return { adapter, emit: (value = fix()) => callback(value), fail: () => failure(), stats: () => ({ removed, requested, watches }) };
}

test('Maps native build config gates platforms separately, disables background and never includes server key in extra', () => {
  const empty = buildConfig({}); assert.deepEqual(empty.extra?.nativeMapsConfigured, { android: false, ios: false });
  const configured = buildConfig({ GOOGLE_MAPS_ANDROID_API_KEY: 'TEST_ONLY_ANDROID_NATIVE_KEY', GOOGLE_MAPS_SERVER_API_KEY: 'TEST_ONLY_BACKEND_KEY' });
  assert.deepEqual(configured.extra?.nativeMapsConfigured, { android: true, ios: false });
  assert.equal(JSON.stringify(configured.extra).includes('TEST_ONLY_'), false);
  assert.equal(JSON.stringify(configured).includes('TEST_ONLY_BACKEND_KEY'), false);
  const location = configured.plugins?.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-location');
  assert.ok(Array.isArray(location));
  assert.equal(location[1].isIosBackgroundLocationEnabled, false); assert.equal(location[1].isAndroidBackgroundLocationEnabled, false);
  assert.equal(location[1].isAndroidForegroundServiceEnabled, false); assert.equal(location[1].locationAlwaysPermission, false);
  assert.equal(location[1].locationAlwaysAndWhenInUsePermission, false);
});

test('Maps client validates DTOs, uses no credentials for catalog and bearer-only route body', async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const api = createMapsClient('https://api.test/api', async (url, init) => { seen.push({ url, init }); return Response.json(url.endsWith('catalog') ? catalog : result); });
  assert.deepEqual(await api.catalog(signal()), catalog); assert.deepEqual(await api.route(request, token, signal()), result);
  assert.equal(seen[0]?.url, 'https://api.test/api/maps/catalog'); assert.equal(seen[1]?.url, 'https://api.test/api/maps/sample-route');
  assert.equal(new Headers(seen[0]?.init.headers).has('Authorization'), false);
  assert.equal(new Headers(seen[1]?.init.headers).get('Authorization'), `Bearer ${token}`);
  assert.deepEqual(JSON.parse(String(seen[1]?.init.body)), request);
  for (const item of seen) { assert.equal(item.init.credentials, 'omit'); assert.equal(item.init.cache, 'no-store'); assert.equal(item.init.redirect, 'error'); }
});

test('Maps client refuses bad input/config before fetch, bounds body and sanitizes every HTTP/network error', async () => {
  let calls = 0;
  const api = createMapsClient('', async () => { calls++; return Response.json(catalog); });
  await assert.rejects(api.catalog(signal()), { code: 'configuration' });
  await assert.rejects(api.route({ ...request, destinationPlaceId: request.originPlaceId }, token, signal()), { code: 'contract' });
  await assert.rejects(api.route(request, 'invalid', signal()), { code: 'session' }); assert.equal(calls, 0);
  for (const [status, code] of [[401, 'session'], [403, 'session'], [429, 'limited'], [503, 'disabled'], [500, 'provider']] as const) {
    await assert.rejects(createMapsClient('https://api.test', async () => new Response('TEST_ONLY_PRIVATE_SERVER', { status })).catalog(signal()), error => error instanceof MapFailure && error.code === code && !error.message.includes('PRIVATE'));
  }
  for (const response of [Response.json({}), new Response('not JSON'), new Response('ă'.repeat(32_769)), Response.json(catalog, { headers: { 'content-length': '65537' } })]) {
    await assert.rejects(createMapsClient('https://api.test', async () => response).catalog(signal()), { code: 'contract' });
  }
  await assert.rejects(createMapsClient('https://api.test', async () => { throw new Error('TEST_ONLY_PRIVATE_NETWORK'); }).catalog(signal()), error => error instanceof MapFailure && error.code === 'network' && !error.message.includes('PRIVATE'));
});

test('Maps client uses one finite fetch/body deadline, supports cancellation and never retries', async () => {
  let calls = 0;
  const hanging = createMapsClient('https://api.test', async () => { calls++; return new Promise(() => {}); }, 10);
  await assert.rejects(hanging.catalog(signal()), { code: 'timeout' }); assert.equal(calls, 1);
  const response = Response.json(catalog); response.text = () => new Promise(() => {});
  await assert.rejects(createMapsClient('https://api.test', async () => response, 10).catalog(signal()), { code: 'timeout' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(hanging.catalog(controller.signal), { code: 'cancelled' }); assert.equal(calls, 1);
});

test('catalog/pins remain available without native map key and no route is requested before map-loaded + session', async t => {
  let calls = 0;
  const store = createMapsStore(client(), false, async () => { calls++; return result; }); t.after(store.dispose);
  await store.loadCatalog(); assert.equal(store.snapshot().catalog?.places.length, 3); assert.equal(store.snapshot().map, 'blocked');
  store.setIdentity('user-a'); await store.route(request); assert.equal(calls, 0);
  const configured = createMapsStore(client(), true, async () => { calls++; return result; }); t.after(configured.dispose);
  await configured.loadCatalog(); configured.retryMap(); configured.sdkReady(configured.snapshot().revision);
  assert.equal(configured.snapshot().map, 'loading'); await configured.route(request); assert.equal(calls, 0);
  configured.mapLoaded(configured.snapshot().revision); await configured.route(request); assert.equal(calls, 0);
  configured.setIdentity('user-a'); await configured.route(request); assert.equal(calls, 1); assert.equal(configured.snapshot().result?.kind, 'route');
});

test('map load timeout requires explicit retry; stale map callbacks cannot enable paid routes', async t => {
  const store = createMapsStore(client(), true, async () => result, 10); t.after(store.dispose);
  store.retryMap(); const old = store.snapshot().revision; await delay(20);
  assert.equal(store.snapshot().map, 'error'); store.mapLoaded(old); assert.equal(store.snapshot().map, 'error');
  store.retryMap(); store.mapLoaded(old); assert.equal(store.snapshot().map, 'loading');
  store.mapLoaded(store.snapshot().revision); assert.equal(store.snapshot().map, 'loaded');
});

test('logout/expiry/identity change cancels route and ignores late responses without retaining geometry', async t => {
  const pending = deferred<SampleRouteResult>(); let transport: AbortSignal | undefined;
  const store = createMapsStore(client(), true, async (_request, signal) => { transport = signal; return pending.promise; }); t.after(store.dispose);
  await store.loadCatalog(); store.retryMap(); store.mapLoaded(store.snapshot().revision); store.setIdentity('user-a');
  const load = store.route(request); store.setIdentity(null); assert.equal(transport?.aborted, true);
  pending.resolve(result); await load; assert.equal(store.snapshot().result, undefined); assert.equal(store.snapshot().route, 'idle');
  store.setIdentity('user-b'); await store.route(request); assert.equal(store.snapshot().result?.kind, 'route');
  store.setIdentity('user-c'); assert.equal(store.snapshot().result, undefined);
});

test('no-route is explicit; failures, pair edits, inactive and manual cancel clear prior Google content', async t => {
  let next: SampleRouteResult = result, fail = false;
  const store = createMapsStore(client(), true, async () => { if (fail) throw new MapFailure('disabled'); return next; }); t.after(store.dispose);
  await store.loadCatalog(); store.retryMap(); store.mapLoaded(store.snapshot().revision); store.setIdentity('user-a');
  await store.route(request); assert.ok(store.snapshot().result); store.cancelRoute(); assert.equal(store.snapshot().result, undefined);
  next = noRoute; await store.route(request); assert.equal(store.snapshot().result?.kind, 'no-route');
  fail = true; await store.route(request); assert.equal(store.snapshot().route, 'error'); assert.equal(store.snapshot().result, undefined);
  fail = false; await store.route(request); store.setActive(false); assert.equal(store.snapshot().result, undefined);
});

test('foreground granted permission returns one fresh fix and removes watcher without re-prompting', async t => {
  const fixture = locationFixture(), store = createLocationStore(fixture.adapter); t.after(store.dispose);
  assert.equal(fixture.stats().watches, 0); await store.locate(); fixture.emit();
  assert.equal(store.snapshot().kind, 'ready'); assert.equal(fixture.stats().removed, 1); assert.equal(fixture.stats().requested, 0);
  fixture.emit({ ...fix(), coords: { latitude: 22, longitude: 106, accuracy: 10 } }); assert.equal(store.snapshot().fix?.coords.latitude, 21);
});

test('foreground denial/permanent denial and disabled GPS never create a location watch', async t => {
  for (const canAskAgain of [true, false]) {
    const fixture = locationFixture({ permission: async () => ({ granted: false, canAskAgain }), request: async () => ({ granted: false, canAskAgain: false }) });
    const store = createLocationStore(fixture.adapter); t.after(store.dispose); await store.locate();
    assert.equal(store.snapshot().kind, 'denied'); assert.equal(store.snapshot().fix, undefined); assert.equal(fixture.stats().watches, 0);
  }
  const fixture = locationFixture({ services: async () => false }), store = createLocationStore(fixture.adapter); t.after(store.dispose);
  await store.locate(); assert.equal(store.snapshot().kind, 'unavailable'); assert.equal(fixture.stats().watches, 0);
});

test('revoked permission, GPS disabled on resume and inactive cleanup discard the previous fix', async t => {
  let granted = true, enabled = true;
  const fixture = locationFixture({ permission: async () => ({ granted, canAskAgain: false }), services: async () => enabled });
  const store = createLocationStore(fixture.adapter); t.after(store.dispose);
  await store.locate(); fixture.emit(); granted = false; await store.recheck(); assert.equal(store.snapshot().kind, 'denied'); assert.equal(store.snapshot().fix, undefined);
  granted = true; await store.locate(); fixture.emit(); enabled = false; await store.recheck(); assert.equal(store.snapshot().kind, 'unavailable'); assert.equal(store.snapshot().fix, undefined);
  enabled = true; await store.locate(); fixture.emit(); store.cancel(); assert.equal(store.snapshot().fix, undefined); assert.equal(store.snapshot().kind, 'idle');
});

test('no-GPS timeout and provider errors stop own watchers; invalid/old fixes never become ready', async t => {
  const fixture = locationFixture(), store = createLocationStore(fixture.adapter, 10); t.after(store.dispose);
  await store.locate(); await delay(20); assert.equal(store.snapshot().kind, 'unavailable'); assert.equal(fixture.stats().removed, 1);
  await store.locate(); fixture.fail(); assert.equal(store.snapshot().kind, 'error');
  await store.locate(); fixture.emit({ ...fix(), timestamp: Date.now() - 120_000 }); assert.equal(store.snapshot().kind, 'error');
  await store.locate(); fixture.emit({ ...fix(), coords: { latitude: 91, longitude: 105, accuracy: 10 } }); assert.equal(store.snapshot().kind, 'error');
});

test('cancel during late watcher registration and callback-before-registration both remove subscriptions exactly once', async t => {
  const registration = deferred<{ remove(): void }>(); let removed = 0;
  const fixture = locationFixture({ watch: () => registration.promise }), store = createLocationStore(fixture.adapter); t.after(store.dispose);
  const pending = store.locate(); await delay(0); store.cancel(); await pending;
  registration.resolve({ remove() { removed++; } }); await delay(0); assert.equal(removed, 1); assert.equal(store.snapshot().fix, undefined);
  const early = createLocationStore(locationFixture({ watch: async success => { success(fix()); return { remove() { removed++; } }; } }).adapter); t.after(early.dispose);
  await early.locate(); assert.equal(early.snapshot().kind, 'ready'); assert.equal(removed, 2);
});

test('stalled permission/recheck remain bounded and never leak private OS errors', async t => {
  const fixture = locationFixture({ permission: () => new Promise(() => {}) }), store = createLocationStore(fixture.adapter, 10); t.after(store.dispose);
  await store.locate(); assert.equal(store.snapshot().kind, 'unavailable'); assert.equal(fixture.stats().watches, 0);
  await store.recheck(); assert.equal(store.snapshot().kind, 'error'); assert.equal(store.snapshot().fix, undefined);
});

test('iOS permission-sheet inactive waits for active before GPS; background still cancels the pending prompt result', async t => {
  const permission = deferred<{ granted: boolean; canAskAgain: boolean }>();
  const fixture = locationFixture({ permission: async () => ({ granted: false, canAskAgain: true }), request: () => permission.promise });
  const store = createLocationStore(fixture.adapter); t.after(store.dispose);
  const pending = store.locate(); await delay(0); store.setAppState('inactive');
  permission.resolve({ granted: true, canAskAgain: true }); await delay(0);
  assert.equal(store.snapshot().kind, 'locating'); assert.equal(fixture.stats().watches, 0);
  store.setAppState('active'); await pending; assert.equal(fixture.stats().watches, 1); fixture.emit(); assert.equal(store.snapshot().kind, 'ready');
  store.setAppState('inactive'); assert.equal(store.snapshot().fix, undefined); assert.equal(fixture.stats().removed, 1);
  const denial = deferred<{ granted: boolean; canAskAgain: boolean }>();
  const deniedFixture = locationFixture({ permission: async () => ({ granted: false, canAskAgain: true }), request: () => denial.promise });
  const denied = createLocationStore(deniedFixture.adapter); t.after(denied.dispose);
  const deniedRequest = denied.locate(); await delay(0); denied.setAppState('inactive'); denial.resolve({ granted: false, canAskAgain: false });
  await delay(0); assert.equal(deniedFixture.stats().watches, 0); denied.setAppState('active'); await deniedRequest;
  assert.equal(denied.snapshot().kind, 'denied'); assert.equal(deniedFixture.stats().watches, 0);
  const latePermission = deferred<{ granted: boolean; canAskAgain: boolean }>();
  const background = locationFixture({ permission: async () => ({ granted: false, canAskAgain: true }), request: () => latePermission.promise });
  const cancelled = createLocationStore(background.adapter); t.after(cancelled.dispose);
  const request = cancelled.locate(); await delay(0); cancelled.setAppState('background');
  latePermission.resolve({ granted: true, canAskAgain: true }); await request;
  assert.equal(background.stats().watches, 0); assert.equal(cancelled.snapshot().fix, undefined);
});
