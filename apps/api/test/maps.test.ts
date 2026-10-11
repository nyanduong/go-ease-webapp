import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { decodeRoutePolyline, isSampleMapCatalog, isSampleRouteRequest, isSampleRouteResult, type SampleMapCatalog } from '@goease/contracts';
import { samplePlaces } from '../src/database/seed.js';
import { prepareSampleRoute, validateMapCatalog } from '../src/modules/maps/catalog.js';
import { MapsError, type MapsErrorCode } from '../src/modules/maps/errors.js';
import { computeSampleRoute, durationMilliseconds, MAX_ROUTES_BODY_BYTES, parseRoutesResponse, readRoutesConfig, ROUTES_FIELD_MASK, ROUTES_URL, sampleRoutesBody } from '../src/modules/maps/routes.js';
import { runMapsProbe } from '../src/modules/maps/probe.js';

// All UUIDs, credentials and Google responses below are TEST ONLY doubles.
// Public CC0 coordinates match the approved seeds; the official example polyline is NOT a Hanoi/live route.
const ids = ['aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000003'];
const examplePolyline = '_p~iF~ps|U_ulLnnqC_mqNvxq' + String.fromCharCode(96) + '@';
const config = { apiKey: 'TEST_ONLY_NOT_A_GOOGLE_KEY' };
function catalog(): SampleMapCatalog {
  return { destinationCode: 'VN-HANOI-SAMPLE', isSample: true, places: samplePlaces.map((seed, i) => ({
    id: ids[i]!, name: seed.name, latitude: Number(seed.latitude), longitude: Number(seed.longitude),
    sourceUrl: `https://www.wikidata.org/w/index.php?title=${seed.entity}&oldid=${seed.revision}`,
    attribution: `Wikidata contributors · CC0-1.0 · ${seed.entity} P625 revision ${seed.revision}; retrieved 2026-10-11; source precision ${seed.precision}°; approximate sample point, no price/availability.`,
  })) };
}
const request = { originPlaceId: ids[0]!, destinationPlaceId: ids[1]! };
function route(patch: Record<string, unknown> = {}) {
  return { distanceMeters: 1234, duration: '120.123456789s', polyline: { encodedPolyline: examplePolyline }, ...patch };
}
function response(value: unknown = { routes: [route()] }) {
  return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
}
function rejected(code: MapsErrorCode, attempts?: number) {
  return (error: unknown) => error instanceof MapsError && error.code === code && (attempts === undefined || error.attempts === attempts);
}
function run(fetch: typeof globalThis.fetch, options: Parameters<typeof computeSampleRoute>[3] = {}) {
  return computeSampleRoute(config, request, catalog(), { fetch, ...options });
}
function encodePoint(latitudeE5: number, longitudeE5: number) {
  const scalar = (value: number) => {
    let bits = value < 0 ? -value * 2 - 1 : value * 2, encoded = '';
    do { const digit = bits % 32; bits = Math.floor(bits / 32); encoded += String.fromCharCode(digit + (bits ? 32 : 0) + 63); } while (bits);
    return encoded;
  };
  return scalar(latitudeE5) + scalar(longitudeE5);
}

test('map guards reject sparse arrays, malformed Unicode, duplicate UUIDs and invented request fields', () => {
  assert.equal(isSampleMapCatalog(catalog()), true);
  assert.equal(isSampleMapCatalog({ ...catalog(), places: new Array(3) }), false);
  const duplicate = catalog(); duplicate.places[1]!.id = duplicate.places[0]!.id.toUpperCase();
  assert.equal(isSampleMapCatalog(duplicate), false);
  for (const name of ['bad\nlabel', 'bad\u0000label', '\ud800', '\udc00']) {
    const places = catalog(); places.places[0]!.name = name; assert.equal(isSampleMapCatalog(places), false);
  }
  const emoji = catalog(); emoji.places[0]!.name = 'Điểm 🗺️'; assert.equal(isSampleMapCatalog(emoji), true);
  for (const value of [{ ...request, latitude: 21 }, { ...request, ownerId: ids[2] }, { ...request, originPlaceId: 'Q1202019' },
    { ...request, destinationPlaceId: request.originPlaceId.toUpperCase() }, { ...request, originPlaceId: `${request.originPlaceId}\n` }, null]) assert.equal(isSampleRouteRequest(value), false);
  assert.equal(isSampleRouteResult({ kind: 'no-route', source: 'google-routes', coordinates: [] }), false);
  assert.equal(isSampleRouteResult({ kind: 'route', source: 'google-routes', attribution: 'Google Maps', distanceMeters: 0,
    durationMilliseconds: 0, coordinates: new Array(2), warnings: [] }), false);
});

test('sample requests bind normalized UUIDs to copied canonical coordinates and reject edited catalog data', () => {
  const places = catalog(), prepared = prepareSampleRoute({ ...request, originPlaceId: request.originPlaceId.toUpperCase() }, places);
  assert.equal(prepared.request.originPlaceId, ids[0]);
  assert.notEqual(prepared.origin, places.places[0]);
  assert.deepEqual(sampleRoutesBody(request, places).origin, { location: { latLng: { latitude: 21.028611, longitude: 105.835556 } } });
  for (const patch of [{ name: 'TEST_ONLY_PRIVATE_LABEL' }, { latitude: 21.028612 }, { longitude: 105.835557 },
    { attribution: 'TEST_ONLY_UNAPPROVED' }, { sourceUrl: 'https://www.wikidata.org/w/index.php?title=Q1202019&oldid=1' }]) {
    const changed = catalog(); Object.assign(changed.places[0]!, patch);
    assert.throws(() => validateMapCatalog(changed), rejected('MAPS_INVALID_INPUT'));
  }
  const duplicatedSeed = catalog(); duplicatedSeed.places[1] = { ...duplicatedSeed.places[0]!, id: ids[1]! };
  assert.throws(() => validateMapCatalog(duplicatedSeed), rejected('MAPS_INVALID_INPUT'));
  assert.throws(() => prepareSampleRoute({ ...request, destinationPlaceId: 'dddddddd-0000-4000-8000-000000000004' }, places), rejected('MAPS_INVALID_INPUT'));
});

test('bounded E5 decoder matches the Google example and rejects malformed/truncated/overlong/out-of-bounds geometry', () => {
  assert.deepEqual(decodeRoutePolyline(examplePolyline), [{ latitude: 38.5, longitude: -120.2 }, { latitude: 40.7, longitude: -120.95 }, { latitude: 43.252, longitude: -126.453 }]);
  for (const value of ['', '?', '??', '\u007f???', '!!!!!!', '~~~~~~????', examplePolyline.slice(0, -1),
    '?'.repeat(16_385), '??'.repeat(5001), encodePoint(9_000_001, 0) + '??', encodePoint(0, 18_000_001) + '??']) {
    assert.throws(() => decodeRoutePolyline(value));
  }
  assert.equal(decodeRoutePolyline('??'.repeat(5000)).length, 5000);
});

test('protobuf durations retain fractional precision with upward millisecond rounding and a 24-hour cap', () => {
  for (const [value, expected] of [['0s', 0], ['1s', 1000], ['3.1s', 3100], ['3.000001s', 3001],
    ['0.000000001s', 1], ['120.123456789s', 120124], ['86400s', 86400000]] as const) assert.equal(durationMilliseconds(value), expected);
  for (const value of [null, 1, '-1s', '+1s', '1', '1ms', '1e2s', '01s', '1.s', '.5s', '1.1234567890s',
    '86400.000000001s', '86401s', '315576000000s', '1s\n']) assert.throws(() => durationMilliseconds(value), rejected('MAPS_INVALID_OUTPUT'));
});

test('no-route follows omitted/empty protobuf routes while malformed envelopes never become success', () => {
  assert.deepEqual(parseRoutesResponse({}), { kind: 'no-route', source: 'google-routes' });
  assert.deepEqual(parseRoutesResponse({ routes: [] }), { kind: 'no-route', source: 'google-routes' });
  for (const value of [null, [], 'empty', { error: { message: 'TEST_ONLY_RAW_PROVIDER_ERROR' } }, { unexpected: true },
    { routes: null }, { routes: {} }, { routes: new Array(1) }, { routes: [{}, {}] }, { routes: [{}] }]) {
    assert.throws(() => parseRoutesResponse(value), rejected('MAPS_INVALID_OUTPUT'));
  }
});

test('provider output requires one bounded route, preserves warnings and handles omitted protobuf defaults', () => {
  const parsed = parseRoutesResponse({ routes: [route({ warnings: ['TEST ONLY warning 🗺️'] })] });
  assert.equal(parsed.kind, 'route');
  if (parsed.kind !== 'route') assert.fail('Expected TEST ONLY route');
  assert.equal(parsed.durationMilliseconds, 120124); assert.deepEqual(parsed.warnings, ['TEST ONLY warning 🗺️']);
  const zero = route(); delete (zero as Partial<typeof zero>).distanceMeters;
  const defaults = parseRoutesResponse({ routes: [zero] });
  assert.equal(defaults.kind === 'route' ? defaults.distanceMeters : undefined, 0);
  assert.deepEqual(defaults.kind === 'route' ? defaults.warnings : undefined, []);
  for (const patch of [{ distanceMeters: '1' }, { distanceMeters: null }, { distanceMeters: -1 }, { distanceMeters: 1.5 },
    { distanceMeters: 1_000_001 }, { duration: null }, { warnings: null }, { warnings: [''] }, { warnings: ['bad\nwarning'] },
    { warnings: new Array(1) }, { warnings: Array.from({ length: 21 }, () => 'warning') }, { warnings: ['x'.repeat(1001)] },
    { polyline: null }, { polyline: { encodedPolyline: '???' } }, { polyline: { encodedPolyline: examplePolyline, geoJsonLinestring: {} } },
    { unexpected: true }]) assert.throws(() => parseRoutesResponse({ routes: [route(patch)] }), rejected('MAPS_INVALID_OUTPUT'));
});

test('one real adapter request uses the fixed URL, minimal field mask, canonical coordinates and server-key header', async () => {
  let attempts = 0;
  const result = await run(async (input, init) => {
    attempts++; assert.equal(input, ROUTES_URL); assert.equal(init?.method, 'POST'); assert.equal(init?.redirect, 'error');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('X-Goog-Api-Key'), config.apiKey); assert.equal(headers.get('X-Goog-FieldMask'), ROUTES_FIELD_MASK);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.deepEqual(body, sampleRoutesBody(request, catalog()));
    assert.equal(String(init?.body).includes(ids[0]!), false); assert.equal(String(init?.body).includes('TEST_ONLY_PRIVATE'), false);
    return response();
  });
  assert.equal(attempts, 1); assert.equal(result.result.kind, 'route');
  assert.equal(result.evidence.attempts, 1); assert.equal(result.evidence.chargedCostUsd, null);
  assert.equal(JSON.stringify(result).includes(config.apiKey), false);
});

test('invalid configuration/input/options and pre-cancellation make zero outbound calls', async () => {
  let attempts = 0;
  const forbidden: typeof fetch = async () => { attempts++; throw new Error('TEST_ONLY_FORBIDDEN_FETCH'); };
  for (const apiKey of ['', ' secret ', 'bad\nkey', 'bad-key\n', 'x'.repeat(513)]) {
    assert.throws(() => readRoutesConfig({ GOOGLE_MAPS_SERVER_API_KEY: apiKey }), rejected('MAPS_NOT_CONFIGURED'));
    await assert.rejects(computeSampleRoute({ apiKey }, request, catalog(), { fetch: forbidden }), rejected('MAPS_NOT_CONFIGURED', 0));
  }
  await assert.rejects(computeSampleRoute(config, { ...request, longitude: 1 }, catalog(), { fetch: forbidden }), rejected('MAPS_INVALID_INPUT', 0));
  for (const timeoutMs of [0, 9, 15001, NaN, 10.5]) await assert.rejects(run(forbidden, { timeoutMs }), rejected('MAPS_INVALID_INPUT', 0));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(run(forbidden, { signal: controller.signal }), rejected('MAPS_CANCELLED', 0));
  assert.equal(attempts, 0);
});

test('all HTTP failure classes discard body and never retry or expose provider diagnostics', async () => {
  for (const status of [301, 400, 401, 403, 404, 408, 429, 500, 503]) {
    let calls = 0, cancelled = false;
    const result = await run(async () => { calls++; return new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(`TEST_ONLY_PRIVATE_PROVIDER_ERROR ${config.apiKey}`)); },
      cancel() { cancelled = true; },
    }), { status, headers: { 'Retry-After': '999999' } }); }).catch(error => error as unknown);
    assert.ok(rejected('MAPS_PROVIDER_FAILURE', 1)(result)); assert.equal(calls, 1); assert.equal(cancelled, true);
    assert.equal(JSON.stringify(result).includes(config.apiKey), false);
    assert.equal(String(result).includes('TEST_ONLY_PRIVATE_PROVIDER_ERROR'), false);
  }
  await assert.rejects(run(async () => { throw new Error(`TEST_ONLY_RAW_NETWORK ${config.apiKey}`); }), error => {
    assert.ok(rejected('MAPS_PROVIDER_FAILURE', 1)(error));
    assert.equal(String(error).includes('TEST_ONLY_RAW_NETWORK'), false); assert.equal(String(error).includes(config.apiKey), false); return true;
  });
});

test('streaming response enforces byte limits with or without Content-Length and cancels rejected bodies', async () => {
  for (const declared of [true, false]) {
    let cancelled = false;
    await assert.rejects(run(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(MAX_ROUTES_BODY_BYTES + 1).fill(32)); }, cancel() { cancelled = true; },
    }), { headers: declared ? { 'Content-Length': String(MAX_ROUTES_BODY_BYTES + 1) } : {} })), rejected('MAPS_INVALID_OUTPUT', 1));
    assert.equal(cancelled, true);
  }
  const boundary = '{}'.padEnd(MAX_ROUTES_BODY_BYTES, ' ');
  assert.equal((await run(async () => new Response(boundary))).result.kind, 'no-route');
});

test('fatal UTF-8 and JSON validation reject invalid/truncated bytes but permit split multibyte text', async () => {
  for (const bytes of [new Uint8Array([0xc3, 0x28]), new Uint8Array([0xc3]), new TextEncoder().encode('{bad json')]) {
    await assert.rejects(run(async () => new Response(bytes)), rejected('MAPS_INVALID_OUTPUT', 1));
  }
  const bytes = new TextEncoder().encode(JSON.stringify({ routes: [route({ warnings: ['Đường TEST ONLY'] })] }));
  const result = await run(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close();
  } })));
  assert.deepEqual(result.result.kind === 'route' ? result.result.warnings : undefined, ['Đường TEST ONLY']);
  await assert.rejects(run(async () => new Response(null)), rejected('MAPS_INVALID_OUTPUT', 1));
});

test('whole-operation deadline covers uncooperative fetch and discards its late response', async () => {
  let resolveFetch!: (value: Response) => void, cancelled = false;
  await assert.rejects(run(() => new Promise(resolve => { resolveFetch = resolve; }), { timeoutMs: 10 }), rejected('MAPS_TIMEOUT', 1));
  resolveFetch(new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } })));
  await delay(0); assert.equal(cancelled, true);
});

test('whole-operation deadline and caller cancellation cover a stalled response body', async () => {
  let cancelled = false;
  const stalled: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }));
  await assert.rejects(run(stalled, { timeoutMs: 10 }), rejected('MAPS_TIMEOUT', 1)); assert.equal(cancelled, true);
  cancelled = false;
  const controller = new AbortController();
  const pending = run(stalled, { signal: controller.signal });
  await delay(0); controller.abort();
  await assert.rejects(pending, rejected('MAPS_CANCELLED', 1)); assert.equal(cancelled, true);
});

test('late headers do not reset the body deadline, and cancellation interrupts a noncooperative fetch', async () => {
  let cancelled = false;
  await assert.rejects(run(async () => {
    await delay(15);
    return new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }));
  }, { timeoutMs: 25 }), rejected('MAPS_TIMEOUT', 1));
  assert.equal(cancelled, true);
  const controller = new AbortController();
  const pending = run(() => new Promise(() => {}), { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, rejected('MAPS_CANCELLED', 1));
});

test('a valid late synchronous response cannot return success beyond the deadline', async () => {
  await assert.rejects(run(async () => {
    const end = performance.now() + 25; while (performance.now() < end) { /* Test-only event-loop stall. */ }
    return response();
  }, { timeoutMs: 10 }), rejected('MAPS_TIMEOUT', 1));
});

test('dry-run validates the approved catalog without a provider key or outbound request', async () => {
  let calls = 0;
  const result = await runMapsProbe(['--dry-run'], { DATABASE_URL: 'TEST_ONLY_DB_URL' }, {
    loadCatalog: async () => catalog(), fetch: async () => { calls++; throw new Error('Forbidden'); },
  });
  assert.equal(result.exitCode, 0); assert.equal(result.receipt.status, 'validated-input'); assert.equal(calls, 0);
  assert.equal('outboundCalls' in result.receipt ? result.receipt.outboundCalls : undefined, 0);
  assert.equal('result' in result.receipt, false); assert.equal('coordinates' in result.receipt, false);
  assert.equal(JSON.stringify(result).includes('TEST_ONLY_DB_URL'), false);
});

test('CLI authorization refuses missing/mixed/duplicate/unknown flags before catalog or fetch calls', async () => {
  let loads = 0, calls = 0;
  for (const args of [[], ['--live'], ['--dry-run', '--live'], ['--dry-run', '--dry-run'], ['--dry-run=true'], ['--unknown'],
    ['--dry-run', '--authorize-live-spend'], ['--dry-run', '--budget-reference=budget'],
    ['--live', '--authorize-live-spend', '--project-reference=p', '--quota-reference=q', '--budget-reference=bad value'],
    ['--live', '--authorize-live-spend', '--project-reference=p', '--quota-reference=q', '--budget-reference=budget\n']]) {
    const result = await runMapsProbe(args, {}, { loadCatalog: async () => { loads++; return catalog(); }, fetch: async () => { calls++; return response(); } });
    assert.equal(result.exitCode, 1); assert.equal('code' in result.receipt ? result.receipt.code : undefined, 'MAPS_LIVE_NOT_AUTHORIZED');
  }
  assert.equal(loads, 0); assert.equal(calls, 0);
});

test('attested live-mode doubles make one request and receipts exclude geometry, keys and reference labels', async () => {
  let calls = 0;
  const args = ['--live', '--authorize-live-spend', '--project-reference=test-only-project', '--quota-reference=test-only-quota', '--budget-reference=test-only-budget'];
  const result = await runMapsProbe(args, { DATABASE_URL: 'TEST_ONLY_PRIVATE_DB_URL', GOOGLE_MAPS_SERVER_API_KEY: config.apiKey }, {
    loadCatalog: async () => catalog(), fetch: async () => { calls++; return response(); },
  });
  assert.equal(result.exitCode, 0); assert.equal(calls, 1); assert.equal('attempts' in result.receipt ? result.receipt.attempts : undefined, 1);
  const receipt = JSON.stringify(result.receipt);
  for (const privateValue of [config.apiKey, 'TEST_ONLY_PRIVATE_DB_URL', 'test-only-project', 'test-only-budget', examplePolyline, 'coordinates']) assert.equal(receipt.includes(privateValue), false);
  assert.equal('chargedCostUsd' in result.receipt ? result.receipt.chargedCostUsd : undefined, null);
});

test('CLI catalog/provider failures are sanitized and cancellation never becomes a successful dry-run', async () => {
  const failed = await runMapsProbe(['--dry-run'], { DATABASE_URL: 'TEST_ONLY_PRIVATE_DB_URL' }, {
    loadCatalog: async () => { throw new Error('TEST_ONLY_PRIVATE_DRIVER_ERROR'); },
  });
  assert.equal(failed.exitCode, 1); assert.equal('code' in failed.receipt ? failed.receipt.code : undefined, 'MAPS_INVALID_INPUT');
  assert.equal(JSON.stringify(failed).includes('TEST_ONLY_PRIVATE'), false);
  const controller = new AbortController(); controller.abort(); let loads = 0;
  const cancelled = await runMapsProbe(['--dry-run'], { DATABASE_URL: 'TEST_ONLY_DB_URL' }, {
    signal: controller.signal, loadCatalog: async () => { loads++; return catalog(); },
  });
  assert.equal(loads, 0); assert.equal('code' in cancelled.receipt ? cancelled.receipt.code : undefined, 'MAPS_CANCELLED');
});
