const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createQaStorageTransport } = require('../.logic-tests/qa-storage-controller.js');
const { createLocalTripRepository, createTripStore } = require('@goease/trip-storage');
const { generateSampleTrip } = require('@goease/itinerary');
const { getDalatCatalog } = require('@goease/catalog');
function setup(enabled = true) {
  let raw = null, reads = 0, writes = 0;
  const qa = createQaStorageTransport({ async getItem() { reads++; return raw; }, async setItem(key, value) { writes++; raw = value; } }, enabled);
  return { ...qa, stats: () => ({ raw, reads, writes }) };
}
test('production cannot arm faults and passes real storage calls unchanged', async () => {
  const f = setup(false);
  assert.equal(f.controls.arm('read'), false); assert.equal(f.controls.arm('write'), false);
  await f.transport.setItem('key', 'saved'); assert.equal(await f.transport.getItem('key'), 'saved');
  assert.deepEqual(f.stats(), { raw: 'saved', reads: 1, writes: 1 }); assert.equal(f.controls.getSnapshot().failures, 0);
});
test('one-shot write fails before storage and retry writes normally', async () => {
  const f = setup(); await f.transport.setItem('key', 'old'); f.controls.arm('write');
  await assert.rejects(f.transport.setItem('key', 'new')); assert.equal(f.stats().raw, 'old'); assert.equal(f.stats().writes, 1);
  assert.equal(f.controls.getSnapshot().writeArmed, false); assert.equal(f.controls.getSnapshot().lastFailure, 'write');
  await f.transport.setItem('key', 'new'); assert.equal(f.stats().raw, 'new'); assert.equal(f.stats().writes, 2);
});
test('read fault does not call native transport or modify bytes; next read recovers', async () => {
  const f = setup(); await f.transport.setItem('key', 'saved'); f.controls.arm('read');
  await assert.rejects(f.transport.getItem('key')); assert.equal(f.stats().reads, 0); assert.equal(f.stats().raw, 'saved');
  assert.equal(await f.transport.getItem('key'), 'saved'); assert.equal(f.stats().reads, 1);
});
test('reset disarms without touching storage and snapshots notify subscribers', () => {
  const f = setup(), original = f.controls.getSnapshot(); let events = 0;
  const unsubscribe = f.controls.subscribe(() => events++);
  assert.equal(f.controls.getSnapshot(), original); f.controls.arm('write'); assert.notEqual(f.controls.getSnapshot(), original);
  assert.equal(Object.isFrozen(f.controls.getSnapshot()), true); f.controls.reset(); assert.equal(events, 2);
  unsubscribe(); f.controls.arm('read'); assert.equal(events, 2); assert.deepEqual(f.stats(), { raw: null, reads: 0, writes: 0 });
});
test('real repository/store path retains draft, reports error and retries after controlled failure', async () => {
  const f = setup(), store = createTripStore(createLocalTripRepository(f.transport)); await store.load();
  const trip = generateSampleTrip({ name: 'QA one shot', destinationId: 'da-lat', startDate: '2026-10-14', durationDays: 1, people: 2, budgetVnd: null }, getDalatCatalog(), { tripId: 'one-shot', today: '2026-10-14' }).trip;
  store.beginNew(trip); f.controls.arm('write'); assert.equal(await store.saveDraft(), false);
  assert.equal(f.stats().raw, null); assert.ok(store.getSnapshot().draft); assert.equal(store.getSnapshot().writeError.code, 'WRITE');
  assert.equal(await store.saveDraft(), true); const savedBytes = f.stats().raw;
  f.controls.arm('read'); assert.equal(await store.load(), false); assert.equal(store.getSnapshot().trips.length, 1);
  assert.equal(f.stats().raw, savedBytes); assert.equal(await store.load(), true);
  f.controls.arm('write'); assert.equal(await store.deleteSaved(trip.id, 1), false); assert.equal(store.getSnapshot().trips.length, 1); assert.equal(f.stats().raw, savedBytes);
  assert.equal(await store.deleteSaved(trip.id, 1), true); assert.equal(store.getSnapshot().trips.length, 0);
});
