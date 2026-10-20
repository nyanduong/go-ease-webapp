const { test } = require('node:test');
const assert = require('node:assert/strict');
const { budgetView, formatVnd, groupForm, parseGroupForm } = require('../.logic-tests/budget-controller.js');
const { putActivity, removeActivity, moveActivity, createTripEditor } = require('../.logic-tests/edit-trip-controller.js');
const { createLocalTripRepository, createTripStore } = require('@goease/trip-storage');
const { generateSampleTrip } = require('@goease/itinerary');
const { getDalatCatalog } = require('@goease/catalog');
const fixture = () => {
  const trip = generateSampleTrip({ name: 'Budget QA', destinationId: 'da-lat', startDate: '2026-10-14', durationDays: 2, people: 2, budgetVnd: 100000 }, getDalatCatalog(), { tripId: 'budget-qa', today: '2026-10-14' }).trip;
  trip.days[0].activities[0].costVnd = 60000;
  trip.days[0].activities[1].costVnd = 0;
  trip.days[1].activities[0].costVnd = 50000;
  return trip;
};
test('whole/day totals count group costs once and distinguish unknown/free', () => {
  const view = budgetView(fixture());
  assert.equal(view.summary.knownCostVnd, 110000); assert.equal(view.summary.unknownCostCount, 1);
  assert.deepEqual(view.days.map(day => [day.knownCostVnd, day.unknownCostCount]), [[60000, 0], [50000, 1]]);
  assert.equal(view.warning, true); assert.match(view.difference, /10\.000 đ/); assert.match(view.completeness, /chưa đầy đủ/);
  assert.match(view.days[0].completeness, /ước tính/);
});
test('missing budget differs from explicit zero; over/equal/remaining states are precise', () => {
  const trip = fixture();
  const missing = budgetView({ ...trip, budgetVnd: null });
  assert.equal(missing.budgetText, 'Chưa đặt'); assert.equal(missing.summary.remainingVnd, null); assert.equal(missing.warning, false);
  const zero = budgetView({ ...trip, budgetVnd: 0 }); assert.equal(zero.budgetText, '0 đ'); assert.equal(zero.summary.overBudgetVnd, 110000);
  const equal = budgetView({ ...trip, budgetVnd: 110000 }); assert.equal(equal.warning, false); assert.match(equal.difference, /bằng ngân sách/);
  const remaining = budgetView({ ...trip, budgetVnd: 120000 }); assert.match(remaining.difference, /sau các khoản đã nhập: 10\.000 đ/);
  assert.match(remaining.completeness, /chưa đầy đủ/);
});
test('format VND accepts safe integer bounds and never rounds invalid money', () => {
  assert.equal(formatVnd(0), '0 đ'); assert.equal(formatVnd(1000000000), '1.000.000.000 đ'); assert.equal(formatVnd(-1000), '-1.000 đ');
  for (const value of [0.5, NaN, Infinity, 1000000001, Number.MAX_SAFE_INTEGER]) assert.throws(() => formatVnd(value));
});
test('group form handles blank/null, zero and max budget without changing activities', () => {
  const trip = fixture(), original = JSON.stringify(trip);
  assert.deepEqual(groupForm({ ...trip, budgetVnd: null }), { people: '2', budgetVnd: '' });
  for (const [text, expected] of [[' ', null], ['0', 0], ['1000000000', 1000000000]]) {
    const result = parseGroupForm(trip, { people: '20', budgetVnd: text });
    assert.equal(result.ok, true); assert.equal(result.trip.budgetVnd, expected);
    assert.equal(budgetView(result.trip).summary.knownCostVnd, 110000); assert.deepEqual(result.trip.days, trip.days);
  }
  assert.equal(JSON.stringify(trip), original);
});
test('invalid group people/budget produces field errors, never coerces decimals or separators', () => {
  for (const people of ['', '0', '21', '-1', '1.5', '1e1']) assert.ok(parseGroupForm(fixture(), { people, budgetVnd: '' }).errors.people);
  for (const budgetVnd of ['-1', '1.5', '1,000', '1.000', '1e3', '1000000001', 'Infinity']) assert.ok(parseGroupForm(fixture(), { people: '1', budgetVnd }).errors.budgetVnd);
});
test('add/edit/delete updates known and unknown counts; moving changes only day totals', () => {
  let trip = fixture(); const first = trip.days[0].activities[0];
  trip = putActivity(trip, trip.days[0].id, { ...first, costVnd: null }, first.id);
  assert.equal(budgetView(trip).summary.knownCostVnd, 50000); assert.equal(budgetView(trip).summary.unknownCostCount, 2);
  trip = putActivity(trip, trip.days[0].id, { ...first, id: 'added-cost', costVnd: 10000 });
  const before = budgetView(trip);
  trip = moveActivity(trip, 'added-cost', trip.days[1].id);
  const moved = budgetView(trip);
  assert.equal(moved.summary.knownCostVnd, before.summary.knownCostVnd);
  assert.deepEqual(moved.days.map(day => day.knownCostVnd), [0, 60000]);
  trip = removeActivity(trip, 'added-cost'); assert.equal(budgetView(trip).summary.knownCostVnd, 50000);
});
test('removing final priced and final unknown activities never leaves stale totals', () => {
  let trip = fixture();
  for (const activity of trip.days.flatMap(day => day.activities).filter(activity => activity.costVnd !== null)) trip = removeActivity(trip, activity.id);
  assert.equal(budgetView(trip).summary.knownCostVnd, 0); assert.equal(budgetView(trip).summary.unknownCostCount, 1);
  const finalId = trip.days.flatMap(day => day.activities)[0].id;
  trip = removeActivity(trip, finalId);
  const view = budgetView(trip); assert.equal(view.summary.unknownCostCount, 0); assert.match(view.completeness, /Thêm hoạt động/);
  assert.equal(view.days.every(day => day.knownCostVnd === 0 && day.unknownCostCount === 0), true);
});
test('trip total at cap is exact; adding beyond cap fails without altering draft', () => {
  let trip = fixture(); trip.days.forEach(day => { day.activities = []; });
  const activity = fixture().days[0].activities[0];
  for (let i = 0; i < 10; i++) trip = putActivity(trip, trip.days[0].id, { ...activity, id: `cap-${i}`, costVnd: 100000000 });
  assert.equal(budgetView(trip).summary.knownCostVnd, 1000000000);
  const before = JSON.stringify(trip);
  assert.throws(() => putActivity(trip, trip.days[1].id, { ...activity, id: 'over-cap', costVnd: 1 }));
  assert.equal(JSON.stringify(trip), before);
  assert.throws(() => budgetView({ ...trip, budgetVnd: 1.5 }));
});
async function setup() {
  let raw = null, fail = false;
  const transport = { async getItem() { return raw; }, async setItem(key, value) { if (fail) throw Error('write'); raw = value; } };
  const repo = createLocalTripRepository(transport); await repo.create(fixture());
  const store = createTripStore(repo); await store.load(); const editor = createTripEditor(store); editor.begin(store.getSnapshot().trips[0]);
  return { repo, store, editor, transport, fail: value => { fail = value; } };
}
test('applied group draft has correct totals while saved trip stays unchanged until save; reopen agrees', async () => {
  const f = await setup(), trip = f.store.getSnapshot().draft.trip;
  const updated = parseGroupForm(trip, { people: '20', budgetVnd: '0' }).trip; f.editor.change(updated);
  assert.equal(budgetView(f.store.getSnapshot().draft.trip).summary.overBudgetVnd, 110000);
  assert.equal((await f.repo.list()).trips[0].trip.people, 2);
  assert.equal((await f.editor.save()).ok, true);
  const reopened = createTripStore(createLocalTripRepository(f.transport)); await reopened.load();
  assert.deepEqual(budgetView(reopened.getSnapshot().trips[0].trip), budgetView(updated));
});
test('cancel restores group budget and failed save keeps budget draft for retry', async () => {
  const f = await setup(), original = f.store.getSnapshot().draft.trip;
  f.editor.change(parseGroupForm(original, { people: '5', budgetVnd: '' }).trip); f.editor.cancel();
  assert.deepEqual(budgetView((await f.repo.list()).trips[0].trip), budgetView(original));
  f.editor.begin(f.store.getSnapshot().trips[0]);
  f.editor.change(parseGroupForm(original, { people: '8', budgetVnd: '0' }).trip); f.fail(true);
  assert.equal((await f.editor.save()).ok, false); assert.equal(f.store.getSnapshot().draft.trip.people, 8);
  assert.equal(budgetView(f.store.getSnapshot().draft.trip).summary.knownCostVnd, 110000);
  f.fail(false); assert.equal((await f.editor.save()).ok, true); assert.equal((await f.repo.list()).trips[0].trip.budgetVnd, 0);
});
