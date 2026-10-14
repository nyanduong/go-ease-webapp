const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTripSubmission, initialTripForm, validateTripForm } = require('../.logic-tests/create-trip-controller.js');
const { createLocalTripRepository, createTripStore } = require('@goease/trip-storage');
const { getDalatCatalog } = require('@goease/catalog');
const now = () => new Date('2026-10-14T10:00:00Z');
const form = (patch = {}) => ({ ...initialTripForm(now()), name: 'Chuyến demo', ...patch });
async function setup(mode = '') {
  let raw = null, writes = 0, fail = mode;
  const transport = {
    async getItem() { if (fail === 'read') throw Error('disk'); return raw; },
    async setItem(key, value) {
      writes++;
      if (fail === 'write') throw Error('disk');
      raw = value;
      if (fail === 'ambiguous') throw Error('disk');
    },
  };
  const repo = createLocalTripRepository(transport), store = createTripStore(repo);
  await store.load();
  let ids = 0;
  const submission = createTripSubmission({ store, getCatalog: getDalatCatalog, now, newId: () => `trip-${++ids}` });
  return { repo, store, submission, transport, writes: () => writes, recover: () => { fail = ''; } };
}
test('destination date default and blank budget versus explicit zero', () => {
  assert.equal(initialTripForm(new Date('2026-10-14T18:00:00Z')).startDate, '2026-10-15');
  assert.equal(validateTripForm(form(), '2026-10-14').input.budgetVnd, null);
  assert.equal(validateTripForm(form({ budgetVnd: '0' }), '2026-10-14').input.budgetVnd, 0);
});
for (const [field, values] of Object.entries({ name: ['', 'x'.repeat(81)], startDate: ['2026-10-13', '2026-02-30', '14/10/2026'], durationDays: ['0', '6', '1.5'], people: ['0', '21'], budgetVnd: ['-1', '1000000001', '1,000', '1.5'] })) {
  test(`invalid ${field} produces a field error`, () => {
    for (const value of values) {
      const result = validateTripForm(form({ [field]: value }), '2026-10-14');
      assert.equal(result.ok, false); assert.ok(result.errors[field]);
    }
  });
}
for (const durationDays of ['1', '5']) test(`create ${durationDays} days and reopen a new store`, async () => {
  const f = await setup();
  assert.equal((await f.submission.submit(form({ durationDays, people: '20', budgetVnd: '0' }))).ok, true);
  const reopened = createTripStore(createLocalTripRepository(f.transport));
  await reopened.load();
  const saved = reopened.getSnapshot().trips;
  assert.equal(saved.length, 1); assert.equal(saved[0].trip.days.length, Number(durationDays));
  assert.equal(saved[0].trip.people, 20); assert.equal(saved[0].trip.budgetVnd, 0);
});
test('concurrent double tap persists one trip', async () => {
  const f = await setup();
  const results = await Promise.all([f.submission.submit(form()), f.submission.submit(form())]);
  assert.deepEqual(results.map(x => x.ok), [true, false]);
  assert.equal(f.writes(), 1); assert.equal((await f.repo.list()).trips.length, 1);
});
test('failed write retains input/draft and retry uses the same ID', async () => {
  const f = await setup('write'), input = form();
  assert.equal((await f.submission.submit(input)).ok, false);
  assert.equal(input.name, 'Chuyến demo'); assert.equal(f.store.getSnapshot().draft.trip.id, 'trip-1');
  f.recover();
  assert.equal((await f.submission.submit({ ...input, name: 'Đã sửa' })).ok, true);
  const saved = (await f.repo.list()).trips;
  assert.equal(saved.length, 1); assert.equal(saved[0].trip.id, 'trip-1'); assert.equal(saved[0].trip.name, 'Đã sửa');
});
test('persisted write reporting failure is reconciled without a duplicate', async () => {
  const f = await setup('ambiguous');
  assert.equal((await f.submission.submit(form())).ok, false); f.recover();
  assert.equal((await f.submission.submit(form())).ok, true);
  assert.equal(f.writes(), 1); assert.equal((await f.repo.list()).trips.length, 1);
  assert.equal(f.store.getSnapshot().draft, null);
});
test('read failure blocks creation and succeeds after reload', async () => {
  const f = await setup('read');
  assert.equal((await f.submission.submit(form())).ok, false); assert.equal(f.writes(), 0);
  f.recover(); await f.store.load(); assert.equal((await f.submission.submit(form())).ok, true);
});
test('invalid form and insufficient catalog do not write', async () => {
  const f = await setup();
  assert.equal((await f.submission.submit(form({ name: '' }))).ok, false);
  const invalidCatalog = createTripSubmission({ store: f.store, getCatalog: () => ({}), now, newId: () => 'invalid' });
  assert.equal((await invalidCatalog.submit(form())).ok, false);
  assert.equal(f.writes(), 0); assert.equal(f.store.getSnapshot().draft, null);
});
test('discard clears own unsaved draft and preserves saved trips', async () => {
  const f = await setup('write'); await f.submission.submit(form());
  assert.equal(f.submission.discard(), true); assert.equal(f.store.getSnapshot().draft, null);
  f.recover(); await f.submission.submit(form()); f.submission.discard();
  assert.equal((await f.repo.list()).trips.length, 1);
});
test('corrupt records block writes without modifying original bytes', async () => {
  const raw = JSON.stringify({ storageVersion: 1, trips: [{ invalid: true }] });
  let writes = 0;
  const store = createTripStore(createLocalTripRepository({ async getItem() { return raw; }, async setItem() { writes++; } }));
  await store.load();
  const submission = createTripSubmission({ store, getCatalog: getDalatCatalog, now, newId: () => 'new-trip' });
  assert.equal((await submission.submit(form())).ok, false); assert.equal(writes, 0);
});
test('another form cannot replace or discard an existing draft', async () => {
  const f = await setup('write'); await f.submission.submit(form());
  const other = createTripSubmission({ store: f.store, getCatalog: getDalatCatalog, now, newId: () => 'another-trip' });
  assert.equal((await other.submit(form())).ok, false); other.discard();
  assert.equal(f.store.getSnapshot().draft.trip.id, 'trip-1'); assert.equal(f.writes(), 1);
});
