import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalTripRepository, createTripStore, STORAGE_KEY } from '@goease/trip-storage';

function trip(id = 'trip-1') { return { schemaVersion: 1, id, name: 'Demo', destinationId: 'da-lat', timeZone: 'Asia/Ho_Chi_Minh', currency: 'VND', startDate: '2026-11-20', durationDays: 1, people: 4, budgetVnd: null, days: [{ id: 'day-1', date: '2026-11-20', activities: [] }] }; }
function transport() {
  return { raw: null, readFailure: false, writeFailure: false, writes: 0,
    async getItem(key) { assert.equal(key, STORAGE_KEY); if (this.readFailure) throw Error('read'); return this.raw; },
    async setItem(key, value) { assert.equal(key, STORAGE_KEY); if (this.writeFailure) throw Error('write'); await new Promise((resolve) => setTimeout(resolve, 2)); this.raw = value; this.writes++; },
  };
}
const code = (expected) => (error) => error.code === expected;

test('create/list/get/update/delete persist across repository/store restart', async () => {
  const storage = transport(); let repo = createLocalTripRepository(storage);
  assert.deepEqual(await repo.list(), { trips: [], issues: [] });
  const saved = await repo.create(trip()); assert.equal(saved.revision, 1);
  repo = createLocalTripRepository(storage);
  assert.deepEqual(await repo.get('trip-1'), saved);
  const updated = await repo.update({ ...saved.trip, name: 'Changed' }, 1);
  assert.equal(updated.revision, 2);
  assert.equal((await createLocalTripRepository(storage).list()).trips[0].trip.name, 'Changed');
  await repo.delete('trip-1', 2);
  assert.deepEqual(await createLocalTripRepository(storage).list(), { trips: [], issues: [] });
});
test('duplicate creates and stale update/delete never overwrite another revision', async () => {
  const storage = transport(); const repo = createLocalTripRepository(storage);
  await repo.create(trip()); await assert.rejects(repo.create(trip()), code('CONFLICT'));
  await repo.update({ ...trip(), name: 'New' }, 1); const before = storage.raw;
  await assert.rejects(repo.update(trip(), 1), code('CONFLICT'));
  await assert.rejects(repo.delete('trip-1', 1), code('CONFLICT'));
  await assert.rejects(repo.update(trip('missing'), 1), code('NOT_FOUND'));
  assert.equal(storage.raw, before);
});
test('concurrent repository instances serialize create/update/delete without lost trips', async () => {
  const storage = transport(); const a = createLocalTripRepository(storage); const b = createLocalTripRepository(storage);
  await Promise.all([a.create(trip('a')), b.create(trip('b'))]);
  assert.equal((await a.list()).trips.length, 2);
  const changes = await Promise.allSettled([a.update({ ...trip('a'), name: 'Winner1' }, 1), b.update({ ...trip('a'), name: 'Winner2' }, 1)]);
  assert.equal(changes.filter((result) => result.status === 'fulfilled').length, 1);
  await Promise.all([a.delete('b', 1), b.create(trip('c'))]);
  assert.deepEqual((await a.list()).trips.map((saved) => saved.trip.id), ['a', 'c']);
});
test('inputs are snapshotted before queued work and reads return independent data', async () => {
  const storage = transport(); const repo = createLocalTripRepository(storage); const input = trip();
  const pending = repo.create(input); input.name = 'Mutated'; await pending;
  const saved = await repo.get('trip-1'); assert.equal(saved.trip.name, 'Demo'); saved.trip.name = 'Mutated2';
  assert.equal((await repo.get('trip-1')).trip.name, 'Demo');
});
test('read/write failure leaves raw bytes unchanged and queue recovers for retry', async () => {
  const storage = transport(); const repo = createLocalTripRepository(storage); await repo.create(trip()); const before = storage.raw;
  storage.readFailure = true; await assert.rejects(repo.list(), code('READ')); await assert.rejects(repo.create(trip('b')), code('READ'));
  storage.readFailure = false; storage.writeFailure = true;
  await assert.rejects(repo.update({ ...trip(), name: 'Changed' }, 1), code('WRITE'));
  await assert.rejects(repo.delete('trip-1', 1), code('WRITE')); assert.equal(storage.raw, before);
  storage.writeFailure = false; await repo.update({ ...trip(), name: 'Changed' }, 1);
  assert.equal((await repo.get('trip-1')).revision, 2);
});
for (const raw of ['broken-json', 'null', '[]', '{}', '{"storageVersion":0,"trips":[]}', '{"storageVersion":2,"trips":[]}', '{"storageVersion":1,"trips":null}']) {
  test(`preserve unsupported/corrupt envelope ${raw}`, async () => {
    const storage = transport(); storage.raw = raw; const repo = createLocalTripRepository(storage);
    await assert.rejects(repo.list()); await assert.rejects(repo.create(trip())); assert.equal(storage.raw, raw); assert.equal(storage.writes, 0);
  });
}
test('quarantine bad records and both duplicate IDs; read other trips but never erase raw data', async () => {
  const storage = transport(); storage.raw = JSON.stringify({ storageVersion: 1, trips: [
    { trip: trip('good'), revision: 1 }, { trip: trip('dup'), revision: 1 }, { trip: trip('dup'), revision: 2 },
    { trip: { ...trip('future'), schemaVersion: 2 }, revision: 1 }, { trip: trip('bad-revision'), revision: 0 },
  ] });
  const before = storage.raw; const repo = createLocalTripRepository(storage); const result = await repo.list();
  assert.deepEqual(result.trips.map((saved) => saved.trip.id), ['good']); assert.equal(result.issues.length, 4);
  await assert.rejects(repo.get('dup'), code('CORRUPT'));
  await assert.rejects(repo.delete('good', 1), code('CORRUPT')); assert.equal(storage.raw, before);
});
test('invalid trip/version/money never reaches storage', async () => {
  const storage = transport(); const repo = createLocalTripRepository(storage);
  for (const input of [{ ...trip(), schemaVersion: 2 }, { ...trip(), budgetVnd: -1 }, { ...trip(), durationDays: 6 }]) await assert.rejects(repo.create(input), code('INVALID'));
  assert.equal(storage.writes, 0);
});
test('JSON roundtrip preserves null versus zero group costs and nested edits', async () => {
  const storage = transport(); const repo = createLocalTripRepository(storage); const input = trip();
  input.days[0].activities = [{ id: 'a', name: 'QA', location: { kind: 'custom' }, startTime: null, endTime: null, costVnd: null, notes: '' }];
  await repo.create(input); assert.equal((await repo.get(input.id)).trip.days[0].activities[0].costVnd, null);
  input.days[0].activities[0].costVnd = 0; input.days[0].activities[0].notes = 'Changed';
  await repo.update(input, 1);
  const reopened = await createLocalTripRepository(storage).get(input.id);
  assert.equal(reopened.trip.days[0].activities[0].costVnd, 0); assert.equal(reopened.trip.days[0].activities[0].notes, 'Changed');
});
test('store refuses silently replacing drafts, changing IDs or deleting an edited trip', async () => {
  const storage = transport(); const store = createTripStore(createLocalTripRepository(storage));
  store.beginNew(trip()); assert.throws(() => store.beginNew(trip('other')), code('CONFLICT'));
  assert.throws(() => store.changeDraft(trip('other')), code('CONFLICT'));
  await store.saveDraft(); const saved = store.getSnapshot().trips[0]; store.beginEdit(saved);
  assert.equal(await store.deleteSaved(saved.trip.id, saved.revision), false);
  assert.equal(store.getSnapshot().draft.trip.id, saved.trip.id); assert.equal(store.getSnapshot().trips.length, 1);
});
test('store draft is RAM only, cancel is isolated and failed save preserves draft for retry', async () => {
  const storage = transport(); const store = createTripStore(createLocalTripRepository(storage)); await store.load();
  store.beginNew(trip()); assert.equal(storage.raw, null);
  storage.writeFailure = true; assert.equal(await store.saveDraft(), false);
  assert.equal(store.getSnapshot().writeStatus, 'error'); assert.equal(store.getSnapshot().draft.trip.name, 'Demo'); assert.equal(store.getSnapshot().trips.length, 0);
  storage.writeFailure = false; assert.equal(await store.saveDraft(), true); assert.equal(store.getSnapshot().draft, null);
  store.beginEdit(store.getSnapshot().trips[0]); store.changeDraft({ ...trip(), name: 'Unsaved' });
  assert.equal(store.getSnapshot().trips[0].trip.name, 'Demo');
  const restarted = createTripStore(createLocalTripRepository(storage)); await restarted.load();
  assert.equal(restarted.getSnapshot().draft, null); assert.equal(restarted.getSnapshot().trips[0].trip.name, 'Demo');
  store.cancelDraft(); assert.equal(store.getSnapshot().draft, null);
});
test('store loading/read failure/deletion states do not report false success', async () => {
  const storage = transport(); const store = createTripStore(createLocalTripRepository(storage));
  const pending = store.load(); assert.equal(store.getSnapshot().loadStatus, 'loading'); await pending;
  store.beginNew(trip()); const save = store.saveDraft(); assert.equal(store.getSnapshot().writeStatus, 'saving');
  assert.equal(await store.saveDraft(), false); await save;
  storage.readFailure = true; assert.equal(await store.load(), false); assert.equal(store.getSnapshot().loadStatus, 'error'); assert.equal(store.getSnapshot().trips.length, 1);
  storage.readFailure = false; storage.writeFailure = true;
  assert.equal(await store.deleteSaved('trip-1', 1), false); assert.equal(store.getSnapshot().trips.length, 1);
  storage.writeFailure = false; assert.equal(await store.deleteSaved('trip-1', 1), true); assert.equal(store.getSnapshot().trips.length, 0);
});
