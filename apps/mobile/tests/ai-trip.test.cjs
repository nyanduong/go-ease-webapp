const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAiTripFlow, validateAiProposal, aiTripInput, tripSourceLabel } = require('../.logic-tests/ai-trip-controller.js');
const { createTripEditor, putActivity } = require('../.logic-tests/edit-trip-controller.js');
const { createLocalTripRepository, createTripStore } = require('@goease/trip-storage');
const { getDalatCatalog } = require('@goease/catalog');
const { generateSampleTrip } = require('@goease/itinerary');
const { AI_LABEL, GEMINI_MODEL, summarizeBudget, tripSchema } = require('@goease/contracts');
const now = () => new Date('2026-10-14T10:00:00Z');
const input = { name: 'QA mobile AI', destinationId: 'da-lat', startDate: '2099-01-01', durationDays: 1, people: 2, budgetVnd: null };
// Explicit offline provider fixture, not evidence of a Gemini network call.
function dto(request = input) {
  const generated = generateSampleTrip(request, getDalatCatalog(), { tripId: 'provider-trip', today: '2026-10-14' }); assert.equal(generated.ok, true);
  return { apiVersion: '1', kind: 'ai', provider: 'gemini', model: GEMINI_MODEL, policyVersion: 1, label: AI_LABEL, trip: { ...generated.trip, generationSource: 'ai' }, budget: generated.budget, warnings: ['Offline provider fixture; never claim live.'] };
}
async function setup() {
  let raw = null, fail = '', calls = 0, writes = 0, request = async (value) => dto(value);
  const transport = { async getItem() { if (fail === 'read') throw Error('disk'); return raw; }, async setItem(_key, value) { writes++; if (fail === 'write') throw Error('disk'); raw = value; if (fail === 'ambiguous') throw Error('disk'); } };
  const store = createTripStore(createLocalTripRepository(transport)); await store.load(); let ids = 0;
  const flow = createAiTripFlow({ store, getCatalog: getDalatCatalog, newId: () => `ai-trip-${++ids}`, now, request: async (...args) => { calls++; return request(...args); } });
  return { store, flow, transport, calls: () => calls, writes: () => writes, fail: (value) => { fail = value; }, request: (value) => { request = value; } };
}
for (const days of [1, 5]) test(`AI ${days} days stays preview-only until explicit save, edits and reopens with provenance`, async () => {
  const f = await setup(), request = { ...input, durationDays: days };
  assert.equal((await f.flow.generate(request, 'runtime-code')).ok, true); assert.equal(f.writes(), 0); assert.equal(f.store.getSnapshot().draft, null);
  assert.equal(f.flow.preview().trip.days.length, days);
  const result = await f.flow.saveNew(); assert.equal(result.ok, true); assert.equal(f.calls(), 1);
  const reopened = createTripStore(createLocalTripRepository(f.transport)); await reopened.load(); const saved = reopened.getSnapshot().trips[0];
  assert.equal(saved.trip.generationSource, 'ai'); assert.equal(saved.trip.id, 'ai-trip-1'); assert.match(tripSourceLabel(saved.trip), /AI/);
  reopened.beginEdit(saved); reopened.changeDraft({ ...saved.trip, name: 'Đã chỉnh' }); assert.equal(await reopened.saveDraft(), true);
  await reopened.load(); assert.equal(reopened.getSnapshot().trips[0].trip.generationSource, 'ai');
});
test('AI validator rejects wrong request, budget, catalog, canonical name, times, sample and invented costs', () => {
  for (const mutate of [
    (d) => { d.kind = 'sample'; }, (d) => { d.trip.people = 3; }, (d) => { d.trip.name = 'other'; },
    (d) => { d.budget.knownCostVnd = 1; }, (d) => { d.trip.days[0].activities[0].name = 'invented'; },
    (d) => { d.trip.days[0].activities[0].location.placeId = 'unknown'; },
    (d) => { d.trip.days[0].activities[0].costVnd = 123; d.budget = summarizeBudget(d.trip); },
    (d) => { d.trip.days[0].activities[0].startTime = null; d.trip.days[0].activities[0].endTime = null; },
    (d) => { d.trip.days[0].activities[1].startTime = '09:30'; d.trip.days[0].activities[1].endTime = '10:30'; },
  ]) { const value = dto(); mutate(value); assert.throws(() => validateAiProposal(value, input, getDalatCatalog())); }
});
test('bad input and another draft prevent outbound; failed/malformed API preserves draft and previous proposal without fallback', async () => {
  const f = await setup(); assert.equal((await f.flow.generate({ ...input, people: 0 }, 'code')).ok, false); assert.equal(f.calls(), 0);
  const trip = dto().trip; f.store.beginNew(trip); assert.equal((await f.flow.generate(input, 'code')).ok, false); assert.equal(f.calls(), 0); assert.deepEqual(f.store.getSnapshot().draft.trip, trip); f.store.cancelDraft();
  await f.flow.generate(input, 'code'); const original = f.flow.preview();
  assert.equal((await f.flow.generate(input, 'code')).ok, false); assert.equal(f.calls(), 1);
  f.request(async () => { throw Error('PRIVATE_SECRET_MUST_NOT_LEAK'); });
  const failed = await f.flow.generate(input, 'code', null, true); assert.equal(failed.ok, false); assert.equal(failed.message.includes('PRIVATE_SECRET'), false); assert.deepEqual(f.flow.preview(), original);
  f.request(async () => ({})); assert.equal((await f.flow.generate(input, 'code', null, true)).ok, false); assert.deepEqual(f.flow.preview(), original); assert.equal(f.writes(), 0);
});
test('double tap invokes provider once; cancelled late response cannot replace newer preview', async () => {
  const f = await setup(); let finish;
  f.request(() => new Promise((resolve) => { finish = resolve; })); const first = f.flow.generate(input, 'code');
  assert.equal((await f.flow.generate(input, 'code')).ok, false); assert.equal(f.calls(), 1);
  f.flow.cancelRequest(); f.request(async (request) => dto(request)); const next = { ...input, name: 'New request' };
  assert.equal((await f.flow.generate(next, 'code')).ok, true); finish(dto()); assert.equal((await first).ok, false);
  assert.equal(f.flow.preview().trip.name, next.name); assert.equal(f.writes(), 0);
});
test('existing dirty draft is untouched by request/error; apply requires confirmation and rejects stale draft while retaining ID/revision', async () => {
  const f = await setup(); const old = { ...dto().trip, id: 'saved-trip', generationSource: 'sample' };
  f.store.beginNew(old); await f.store.saveDraft(); const saved = f.store.getSnapshot().trips[0]; f.store.beginEdit(saved);
  const dirty = { ...old, name: 'Dirty input', people: 3, budgetVnd: 0 }; f.store.changeDraft(dirty);
  assert.equal((await f.flow.generate(aiTripInput(dirty), 'code', dirty)).ok, true); assert.deepEqual(f.store.getSnapshot().draft.trip, dirty);
  assert.throws(() => f.flow.applyExisting(dirty, false)); assert.throws(() => f.flow.applyExisting({ ...dirty, name: 'Changed after request' }, true));
  f.store.changeDraft({ ...dirty, name: 'Actual store changed' }); assert.throws(() => f.flow.applyExisting(dirty, true)); f.store.changeDraft(dirty);
  const updated = f.flow.applyExisting(dirty, true); assert.equal(updated.id, old.id); assert.equal(updated.generationSource, 'ai');
  f.store.changeDraft(updated); assert.equal(f.store.getSnapshot().draft.baseRevision, saved.revision);
  f.flow.discard(); assert.equal(await f.store.saveDraft(), true); await f.store.load(); assert.equal(f.store.getSnapshot().trips[0].trip.people, 3); assert.equal(f.store.getSnapshot().trips[0].revision, 2);
});
for (const failure of ['read', 'write', 'ambiguous']) test(`${failure} failure retains candidate; retry save uses same ID with no extra AI call`, async () => {
  const f = await setup(); await f.flow.generate(input, 'code'); f.fail(failure);
  assert.equal((await f.flow.saveNew()).ok, false); assert.ok(f.flow.preview()); assert.equal(f.calls(), 1);
  f.fail(''); const result = await f.flow.saveNew(); assert.equal(result.ok, true); assert.equal(result.tripId, 'ai-trip-1'); assert.equal(f.calls(), 1);
  await f.store.load(); assert.equal(f.store.getSnapshot().trips.length, 1);
});
test('discard never removes another draft; saving refuses an externally changed owned draft', async () => {
  const f = await setup(); await f.flow.generate(input, 'code'); f.fail('write'); await f.flow.saveNew();
  f.store.changeDraft({ ...f.store.getSnapshot().draft.trip, name: 'Another change' }); f.fail('');
  assert.equal((await f.flow.saveNew()).ok, false); assert.equal(f.store.getSnapshot().draft.trip.name, 'Another change');
  f.store.cancelDraft(); const other = { ...dto().trip, id: 'other-draft' }; f.store.beginNew(other); assert.equal(f.flow.discard(), true); assert.deepEqual(f.store.getSnapshot().draft.trip, other);
});
test('legacy source remains absent and sample/AI metadata are distinct without migration or invented live evidence', () => {
  const legacy = dto().trip; delete legacy.generationSource; const parsed = tripSchema.parse(legacy);
  assert.equal(parsed.generationSource, undefined); assert.match(tripSourceLabel(parsed), /chưa ghi nguồn/);
  const sample = generateSampleTrip(input, getDalatCatalog(), { tripId: 'sample', today: '2026-10-14' }).trip;
  assert.equal(sample.generationSource, 'sample'); assert.match(tripSourceLabel(sample), /mẫu local/);
});
for (const failure of ['', 'write', 'ambiguous']) test(`same editor adopts new AI draft and saves after ${failure || 'no'} failure; no early persistence`, async () => {
  const f = await setup(); await f.flow.generate(input, 'code'); const id = f.flow.stageNew(); assert.equal(f.writes(), 0); assert.equal(f.flow.preview(), null);
  const editor = createTripEditor(f.store); assert.equal(editor.adoptNew('other'), false); assert.equal(editor.adoptNew(id), true); assert.equal(editor.adoptNew(id), true); assert.equal(editor.dirty(), true);
  const trip = f.store.getSnapshot().draft.trip, day = trip.days[0], activity = { ...day.activities[0], name: 'Đã chỉnh tên', location: { kind: 'custom' }, costVnd: 0 };
  editor.change(putActivity(trip, day.id, activity, activity.id)); f.fail(failure);
  if (failure) { assert.equal((await editor.save()).ok, false); assert.ok(f.store.getSnapshot().draft); f.fail(''); }
  assert.equal((await editor.save()).ok, true); assert.equal(f.calls(), 1);
  await f.store.load(); assert.equal(f.store.getSnapshot().trips[0].trip.days[0].activities[0].name, activity.name); assert.equal(f.store.getSnapshot().trips[0].trip.generationSource, 'ai'); assert.equal(f.store.getSnapshot().trips.length, 1);
});
test('cancel new AI editor discards only draft without writing; durable trips stay intact', async () => {
  const f = await setup(); await f.flow.generate(input, 'code'); const id = f.flow.stageNew(); const editor = createTripEditor(f.store); editor.adoptNew(id);
  assert.equal(editor.cancel(), true); assert.equal(f.store.getSnapshot().draft, null); assert.equal(f.writes(), 0); assert.equal(f.store.getSnapshot().trips.length, 0);
});
