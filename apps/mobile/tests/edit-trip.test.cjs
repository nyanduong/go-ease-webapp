const { test } = require('node:test');
const assert = require('node:assert/strict');
const { activityForm, parseActivityForm, putActivity, removeActivity, moveActivity, createTripEditor } = require('../.logic-tests/edit-trip-controller.js');
const { createLocalTripRepository, createTripStore } = require('@goease/trip-storage');
const { getDalatCatalog, getDalatPlaces } = require('@goease/catalog');
const { generateSampleTrip } = require('@goease/itinerary');
const { findTimeOverlaps } = require('@goease/contracts');
const places = getDalatPlaces();
const sample = () => generateSampleTrip({ name: 'Editor QA', destinationId: 'da-lat', startDate: '2026-10-14', durationDays: 5, people: 2, budgetVnd: null }, getDalatCatalog(), { tripId: 'editor-qa', today: '2026-10-14' }).trip;
const form = (patch = {}) => ({ ...activityForm(), name: 'Ăn trưa', ...patch });
async function setup() {
  let raw = null, mode = '', writes = 0;
  const transport = { async getItem() { if (mode === 'read') throw Error('read'); return raw; }, async setItem(key, value) {
    writes++; if (mode === 'write') throw Error('write'); raw = value; if (mode === 'ambiguous') throw Error('persisted');
  } };
  const repo = createLocalTripRepository(transport); await repo.create(sample());
  const store = createTripStore(repo); await store.load();
  const editor = createTripEditor(store); editor.begin(store.getSnapshot().trips[0]);
  return { repo, store, editor, transport, mode: (value) => { mode = value; }, writes: () => writes, corrupt: () => { raw = '{broken'; } };
}
test('custom activity has no coordinates and distinguishes unknown/free cost', () => {
  const unknown = parseActivityForm(form(), 'custom', places), free = parseActivityForm(form({ costVnd: '0' }), 'free', places);
  assert.equal(unknown.ok, true); assert.deepEqual(unknown.activity.location, { kind: 'custom' });
  assert.equal(unknown.activity.costVnd, null); assert.equal(free.activity.costVnd, 0);
});
test('catalog activity keeps selected place reference and stable edit ID', () => {
  const parsed = parseActivityForm(form({ kind: 'catalog', placeId: places[0].id, name: places[0].name }), 'old-id', places);
  assert.equal(parsed.ok, true); assert.equal(parsed.activity.id, 'old-id');
  assert.deepEqual(parsed.activity.location, { kind: 'catalog', placeId: places[0].id });
  assert.equal(parseActivityForm(form({ kind: 'catalog', placeId: 'missing' }), 'id', places).errors.placeId.length > 0, true);
});
for (const [key, values] of Object.entries({ name: ['', 'x'.repeat(121)], startTime: ['9:00', '24:00', 'abc'], costVnd: ['-1', '1,000', '1.5', '100000001'], notes: ['x'.repeat(501)] })) {
  test(`activity ${key} validates per field`, () => {
    for (const value of values) { const result = parseActivityForm(form({ [key]: value }), 'id', places); assert.equal(result.ok, false); assert.ok(result.errors[key]); }
  });
}
test('partial, reversed and overnight hours fail; valid same-day pair succeeds', () => {
  for (const patch of [{ startTime: '09:00' }, { endTime: '10:00' }, { startTime: '11:00', endTime: '10:00' }, { startTime: '23:00', endTime: '01:00' }]) assert.equal(parseActivityForm(form(patch), 'id', places).ok, false);
  assert.equal(parseActivityForm(form({ startTime: '09:00', endTime: '10:00' }), 'id', places).ok, true);
});
test('add, edit, reorder and move keep all IDs, preserve source and append to target day', () => {
  const original = sample(), before = JSON.stringify(original), first = original.days[0].activities[0];
  const added = parseActivityForm(form(), 'added', places).activity;
  let trip = putActivity(original, original.days[0].id, added);
  trip = putActivity(trip, trip.days[0].id, { ...first, name: 'Changed', notes: 'note' }, first.id);
  trip = moveActivity(trip, first.id, trip.days[0].id, 2);
  assert.equal(trip.days[0].activities[2].id, first.id);
  trip = moveActivity(trip, first.id, trip.days[4].id);
  assert.equal(trip.days[4].activities.at(-1).id, first.id); assert.equal(trip.days[4].activities.at(-1).notes, 'note');
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(trip.days.flatMap(x => x.activities.map(a => a.id)).sort(), [...original.days.flatMap(x => x.activities.map(a => a.id)), 'added'].sort());
  trip = removeActivity(trip, 'added'); assert.equal(trip.days.flatMap(x => x.activities).some(x => x.id === 'added'), false);
});
test('empty days are allowed; full day, duplicate/missing IDs fail atomically', () => {
  const original = sample(), dayId = original.days[0].id;
  let trip = original;
  for (const activity of original.days[0].activities) trip = removeActivity(trip, activity.id);
  assert.equal(trip.days[0].activities.length, 0);
  for (let i = 0; i < 12; i++) trip = putActivity(trip, dayId, parseActivityForm(form(), `extra-${i}`, places).activity);
  const before = JSON.stringify(trip);
  assert.throws(() => putActivity(trip, dayId, parseActivityForm(form(), 'overflow', places).activity));
  assert.throws(() => moveActivity(trip, trip.days[1].activities[0].id, dayId));
  assert.throws(() => putActivity(trip, dayId, { ...trip.days[0].activities[0], id: 'changed' }, 'extra-0'));
  assert.throws(() => removeActivity(trip, 'missing'));
  assert.equal(JSON.stringify(trip), before);
});
test('overlap is a warning and does not remove or reorder activities', () => {
  let trip = sample(); const day = trip.days[0], second = day.activities[1];
  trip = putActivity(trip, day.id, { ...second, startTime: '09:00', endTime: '10:00' }, second.id);
  assert.equal(findTimeOverlaps(trip.days[0]).length, 1);
  assert.deepEqual(trip.days[0].activities.map(x => x.id), day.activities.map(x => x.id));
});
test('Hủy discards draft changes and preserves durable trip', async () => {
  const f = await setup(), original = (await f.repo.list()).trips[0].trip;
  f.editor.change(removeActivity(f.store.getSnapshot().draft.trip, original.days[0].activities[0].id));
  assert.equal(f.editor.dirty(), true); assert.equal(f.editor.cancel(), true);
  assert.equal(f.store.getSnapshot().draft, null); assert.deepEqual((await f.repo.list()).trips[0].trip, original);
});
test('save and reopen preserve edited content, order and target day', async () => {
  const f = await setup(), old = f.store.getSnapshot().draft.trip, first = old.days[0].activities[0];
  let changed = putActivity(old, old.days[0].id, { ...first, name: 'Updated', notes: 'Long note', costVnd: 0 }, first.id);
  changed = moveActivity(changed, first.id, old.days[3].id); f.editor.change(changed);
  assert.equal((await f.editor.save()).ok, true);
  const reopened = createTripStore(createLocalTripRepository(f.transport)); await reopened.load();
  assert.deepEqual(reopened.getSnapshot().trips[0].trip, changed); assert.equal(reopened.getSnapshot().trips[0].revision, 2);
});
for (const mode of ['write', 'read']) test(`${mode} failure retains draft and retry saves once`, async () => {
  const f = await setup(), trip = f.store.getSnapshot().draft.trip;
  const changed = removeActivity(trip, trip.days[0].activities[0].id); f.editor.change(changed); f.mode(mode);
  assert.equal((await f.editor.save()).ok, false); assert.deepEqual(f.store.getSnapshot().draft.trip, changed);
  f.mode(''); assert.equal((await f.editor.save()).ok, true); assert.equal((await f.repo.list()).trips[0].revision, 2);
});
test('ambiguous write retry recognizes persisted revision without writing twice', async () => {
  const f = await setup(), trip = f.store.getSnapshot().draft.trip;
  f.editor.change(removeActivity(trip, trip.days[0].activities[0].id)); f.mode('ambiguous');
  assert.equal((await f.editor.save()).ok, false); f.mode(''); assert.equal((await f.editor.save()).ok, true);
  assert.equal(f.writes(), 2); assert.equal(f.store.getSnapshot().draft, null);
});
test('concurrent save rejects second call; cancel cannot interrupt a save', async () => {
  const f = await setup(); const first = f.editor.save();
  assert.equal(f.editor.cancel(), false); assert.equal((await f.editor.save()).ok, false);
  assert.equal((await first).ok, true); assert.equal((await f.repo.list()).trips[0].revision, 2);
});
test('stale revision cannot overwrite an external edit', async () => {
  const f = await setup(), old = f.store.getSnapshot().draft.trip;
  await f.repo.update({ ...old, name: 'Another editor' }, 1);
  f.editor.change(removeActivity(old, old.days[0].activities[0].id));
  assert.equal((await f.editor.save()).ok, false); assert.ok(f.store.getSnapshot().draft);
  assert.equal((await f.repo.list()).trips[0].trip.name, 'Another editor');
});
test('deleted or corrupt storage retains draft without writing', async () => {
  const f = await setup(); await f.repo.delete('editor-qa', 1); const count = f.writes();
  assert.equal((await f.editor.save()).ok, false); assert.ok(f.store.getSnapshot().draft); assert.equal(f.writes(), count);
  f.corrupt(); assert.equal((await f.editor.save()).ok, false); assert.ok(f.store.getSnapshot().draft); assert.equal(f.writes(), count);
});
test('another session cannot cancel or replace the active draft', async () => {
  const f = await setup(), other = createTripEditor(f.store);
  assert.throws(() => other.begin(f.store.getSnapshot().trips[0])); other.cancel();
  assert.ok(f.store.getSnapshot().draft); assert.equal(f.editor.owns(), true);
});
