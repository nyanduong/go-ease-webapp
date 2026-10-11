import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { calculateTripTotals, calculateTripWarnings, isTripDetail, tripDateAt, type TripDetail } from '@goease/contracts';
import { createTripsClient, decodeTripUtf8, TRIP_RESPONSE_LIMIT, TripFailure, utf8Size } from '../src/features/trips/client.ts';
import { createBody, formFromTrip, updateBody } from '../src/features/trips/form.ts';
import { deferred, id, token, trip } from './trips-fixture.ts';

const signal = () => new AbortController().signal;
const body = JSON.stringify(createBody({ title: 'TEST ONLY', startDate: '2028-02-28', durationDays: '2', groupSize: '2', budgetVnd: '' }));
test('Trip transport sends opaque bearer only, strict methods/key/body; GET list cursor/detail and no mutation retry', async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const api = createTripsClient('https://api.test/api/', async (url, init) => {
    seen.push({ url, init }); return Response.json(init.method === 'GET' && url.includes('?') ? { trips: [], nextCursor: null } : init.method === 'POST' ? { ...trip(), title: 'TEST ONLY' } : init.method === 'PUT' ? trip(2) : trip(), { status: init.method === 'POST' ? 201 : 200 });
  });
  await api.list(token, signal(), { updatedAt: '2026-10-11T08:00:00.000Z', id: id(1) }); await api.detail(id(50).toUpperCase(), token, signal());
  await api.mutate({ operation: 'create', tripId: null, key: id(500), body }, token, signal());
  const update = JSON.stringify(updateBody(formFromTrip(trip()), 1)); await api.mutate({ operation: 'update', tripId: id(50), key: id(501), body: update }, token, signal());
  assert.equal(seen.length, 4); assert.match(seen[0]!.url, /cursorUpdatedAt=2026-10-11T08%3A00%3A00.000Z&cursorId=/);
  for (const { init } of seen) { assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert.equal(new Headers(init.headers).get('Authorization'), `Bearer ${token}`); }
  assert.equal(seen[2]!.init.body, body); assert.equal(new Headers(seen[2]!.init.headers).get('Idempotency-Key'), id(500)); assert.equal(seen[3]!.init.method, 'PUT');
  let calls = 0;
  await assert.rejects(createTripsClient('https://api.test', async () => { calls++; throw new Error('PRIVATE_TEST_ONLY'); }).mutate({ operation: 'create', tripId: null, key: id(500), body }, token, signal()), error => error instanceof TripFailure && error.code === 'network' && !error.message.includes('PRIVATE'));
  assert.equal(calls, 1);
});
test('Trip client refuses bad config/token/id/key/request before fetch and validates correlated strict DTO responses', async () => {
  let calls = 0; const fetcher = async () => { calls++; return Response.json(trip()); };
  await assert.rejects(createTripsClient('https://user:secret@api.test', fetcher).detail(id(50), token, signal()), { code: 'configuration' });
  const api = createTripsClient('https://api.test', fetcher);
  await assert.rejects(api.detail('not-id', token, signal()), { code: 'contract' });
  await assert.rejects(api.detail(id(50), 'invalid', signal()), { code: 'session' });
  await assert.rejects(api.mutate({ operation: 'create', tripId: null, key: 'bad', body }, token, signal()), { code: 'contract' });
  await assert.rejects(api.mutate({ operation: 'create', tripId: null, key: id(500), body: JSON.stringify({ ownerId: id(1) }) }, token, signal()), { code: 'contract' }); assert.equal(calls, 0);
  for (const result of [{ ...trip(), ownerId: id(1) }, { ...trip(), id: id(51) }, { ...trip(), totals: { ...trip().totals, estimatedTotalVnd: 0 } }]) {
    await assert.rejects(createTripsClient('https://api.test', async () => Response.json(result)).detail(id(50), token, signal()), { code: 'contract' });
  }
});
test('Trip reader rejects invalid UTF8, wrong media/status, declared/streamed overflow and cancels rejected bodies', async () => {
  for (const bytes of [[0xc0, 0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2, 0x82], [0xc3, 0x28]]) assert.throws(() => decodeTripUtf8(new Uint8Array(bytes)), { code: 'contract' });
  assert.equal(decodeTripUtf8(new TextEncoder().encode('Tiếng Việt 🌿')), 'Tiếng Việt 🌿');
  for (const response of [new Response(new Uint8Array([0xc3, 0x28]), { headers: { 'Content-Type': 'application/json' } }), Response.json(trip(), { status: 201 }), new Response('{', { headers: { 'Content-Type': 'application/json' } }), new Response(new Uint8Array(TRIP_RESPONSE_LIMIT + 1), { headers: { 'Content-Type': 'application/json' } })]) {
    await assert.rejects(createTripsClient('https://api.test', async () => response).detail(id(50), token, signal()), { code: 'contract' });
  }
  for (const headers of [{ 'Content-Type': 'text/html' }, { 'Content-Type': 'application/json', 'Content-Length': String(TRIP_RESPONSE_LIMIT + 1) }]) {
    let cancelled = false; const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    await assert.rejects(createTripsClient('https://api.test', async () => new Response(stream, { headers })).detail(id(50), token, signal()), { code: 'contract' }); assert.equal(cancelled, true);
  }
});
test('Trip reader accepts a valid >4MiB Unicode detail under 6MiB, including native buffered fallback', async () => {
  const value: TripDetail = trip(); value.durationDays = 5; value.startDate = '2028-02-26';
  value.days = Array.from({ length: 5 }, (_, day) => ({ id: id(100 + day), dayNumber: day + 1, date: tripDateAt(value.startDate, day + 1),
    activities: Array.from({ length: 50 }, (_, index) => ({ ...trip().days[0]!.activities[0]!, id: id(1000 + day * 50 + index), position: index, title: '🌿'.repeat(160), notes: '🌿'.repeat(1000),
      place: { ...trip().days[0]!.activities[0]!.place!, name: '🌿'.repeat(160), attribution: '🌿'.repeat(1000), sourceUrl: `https://example.test/?q=${'🌿'.repeat(2000)}` } })) }));
  value.totals = calculateTripTotals(value.days); value.warnings = calculateTripWarnings(value.days, null);
  assert.equal(isTripDetail(value), true); assert.ok(utf8Size(JSON.stringify(value)) > 4 * 1024 * 1024);
  assert.deepEqual(await createTripsClient('https://api.test', async () => Response.json(value)).detail(id(50), token, signal()), value);
  const response = Response.json(trip()), buffer = await response.arrayBuffer();
  const nativeResponse = new Response(null, { headers: { 'Content-Type': 'application/json' } }); nativeResponse.arrayBuffer = async () => buffer;
  assert.deepEqual(await createTripsClient('https://api.test', async () => nativeResponse).detail(id(50), token, signal()), trip());
});
test('Trip whole deadline covers fetch/body/parse, detects event-loop stall, aborts and cancels late responses', async () => {
  await assert.rejects(createTripsClient('https://api.test', () => new Promise<Response>(() => {}), 10).detail(id(50), token, signal()), { code: 'timeout' });
  let cancelled = false; const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  await assert.rejects(createTripsClient('https://api.test', async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }), 10).detail(id(50), token, signal()), { code: 'timeout' }); assert.equal(cancelled, true);
  await assert.rejects(createTripsClient('https://api.test', async () => { const start = performance.now(); while (performance.now() - start < 25) { /* TEST ONLY starvation. */ } return Response.json(trip()); }, 10).detail(id(50), token, signal()), { code: 'timeout' });
  const pending = deferred<Response>(), controller = new AbortController();
  const request = createTripsClient('https://api.test', () => pending.promise).detail(id(50), token, controller.signal); controller.abort(); await assert.rejects(request, { code: 'cancelled' });
  let lateCancelled = false; pending.resolve(new Response(new ReadableStream({ cancel() { lateCancelled = true; } }))); await delay(0); assert.equal(lateCancelled, true);
});
test('Trip HTTP failures use safe fixed messages, never render server/connection/body diagnostics', async () => {
  for (const [status, code] of [[401, 'session'], [403, 'session'], [404, 'missing'], [409, 'conflict'], [429, 'unavailable'], [503, 'unavailable']] as const) {
    await assert.rejects(createTripsClient('https://api.test', async () => new Response('PRIVATE_TEST_ONLY', { status })).detail(id(50), token, signal()), error => error instanceof TripFailure && error.code === code && !error.message.includes('PRIVATE'));
  }
});
test('A schema-valid receipt must correlate with the submitted canonical fields/version/activities before acknowledgement', async () => {
  const create = { operation: 'create' as const, tripId: null, key: id(500), body };
  for (const result of [trip(), { ...trip(), title: 'TEST ONLY', version: 2 }, { ...trip(), title: 'TEST ONLY', groupSize: 3 }]) {
    await assert.rejects(createTripsClient('https://api.test', async () => Response.json(result, { status: 201 })).mutate(create, token, signal()), { code: 'contract' });
  }
  const update = { operation: 'update' as const, tripId: id(50), key: id(501), body: JSON.stringify(updateBody(formFromTrip(trip()), 1)) };
  const altered = trip(2); altered.days[0]!.activities[0]!.title = 'UNRELATED TEST ONLY';
  for (const result of [trip(), { ...trip(2), id: id(51) }, altered]) await assert.rejects(createTripsClient('https://api.test', async () => Response.json(result)).mutate(update, token, signal()), { code: 'contract' });
});
