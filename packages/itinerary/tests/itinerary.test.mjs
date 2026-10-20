import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDalatCatalog, getDalatPlaces } from '@goease/catalog';
import { findTimeOverlaps, moveActivity, tripSchemaWithCatalog } from '@goease/contracts';
import { generateSampleTrip, SAMPLE_LABEL } from '@goease/itinerary';

const options = { today: '2026-12-30', tripId: 'trip-demo' };
function input(overrides = {}) { return { name: 'Đà Lạt cùng bạn', destinationId: 'da-lat', startDate: '2026-12-30', durationDays: 1, people: 4, budgetVnd: null, ...overrides }; }
function generate(overrides = {}, catalog = getDalatCatalog(), context = options) { return generateSampleTrip(input(overrides), catalog, context); }

for (const durationDays of [1, 2, 3, 4, 5]) {
  test(`${durationDays} days produce canonical, unique, editable activities across year rollover`, () => {
    const result = generate({ durationDays }); assert.equal(result.ok, true);
    assert.equal(result.trip.days.length, durationDays);
    assert.equal(result.trip.days.at(-1).date, ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'][durationDays - 1]);
    assert.equal(tripSchemaWithCatalog(getDalatPlaces()).safeParse(result.trip).success, true);
    const activities = result.trip.days.flatMap((day) => day.activities);
    assert.equal(activities.length, durationDays * 2);
    assert.equal(new Set(activities.map((a) => a.id)).size, activities.length);
    assert.equal(new Set(activities.map((a) => a.location.placeId)).size, activities.length);
    for (const day of result.trip.days) {
      assert.equal(day.activities.length, 2); assert.deepEqual(findTimeOverlaps(day), []);
      assert.equal(day.activities[0].startTime, '09:00'); assert.equal(day.activities[1].startTime, '14:00');
    }
    const moved = moveActivity(result.trip, activities[0].id, result.trip.days[0].id, 1);
    assert.equal(moved.days[0].activities[1].id, activities[0].id);
  });
}
test('real catalog unknown prices remain null, budget never treats them as free', () => {
  const result = generate({ durationDays: 5, budgetVnd: 0 }); assert.equal(result.ok, true);
  assert.equal(result.kind, 'sample'); assert.equal(result.label, SAMPLE_LABEL);
  assert.equal(result.budget.knownCostVnd, 0); assert.equal(result.budget.unknownCostCount, 10); assert.equal(result.budget.isComplete, false);
  assert.equal(result.budget.overBudgetVnd, 0);
  assert.ok(result.warnings.some((warning) => warning.includes('chưa đầy đủ')));
  result.trip.days.flatMap((day) => day.activities).forEach((activity) => {
    assert.equal(activity.costVnd, null); assert.ok(activity.notes.includes(SAMPLE_LABEL));
    assert.equal('coordinates' in activity, false);
  });
});
test('duration and canonical names match selected catalog, evening entries excluded', () => {
  const catalog = getDalatCatalog(); const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  const result = generate({ durationDays: 5 }, catalog); assert.equal(result.ok, true);
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  for (const day of result.trip.days) for (const activity of day.activities) {
    const entry = byId.get(activity.location.placeId);
    assert.equal(activity.name, entry.name); assert.notEqual(entry.visitTimeHint, 'evening');
    assert.equal(minutes(activity.endTime) - minutes(activity.startTime), entry.suggestedDurationMinutes);
  }
});
test('deterministic category rotation works regardless of catalog ordering and leaves inputs unchanged', () => {
  const catalog = getDalatCatalog(); const request = input({ durationDays: 5 }); const before = structuredClone({ catalog, request });
  const a = generateSampleTrip(request, catalog, options); const b = generateSampleTrip(request, [...catalog].reverse(), options);
  assert.deepEqual(a, b); assert.deepEqual({ catalog, request }, before);
  const firstCategories = a.trip.days.slice(0, 3).flatMap((day) => day.activities)
    .map((activity) => catalog.find((entry) => entry.id === activity.location.placeId).category);
  assert.equal(new Set(firstCategories).size, 5); // Market is evening-only in this dataset.
  a.trip.days[0].activities[0].name = 'Changed'; assert.deepEqual(generateSampleTrip(request, catalog, options), b);
});
for (const overrides of [{ durationDays: 0 }, { durationDays: 6 }, { durationDays: 1.5 }, { people: 0 }, { people: 21 }, { startDate: '2026-12-29' }, { startDate: '2026-02-30' }, { name: ' ' }, { budgetVnd: -1 }, { budgetVnd: '0' }, { destinationId: 'unknown-city' }]) {
  test(`reject invalid needs ${JSON.stringify(overrides)} with a readable result`, () => {
    const result = generate(overrides); assert.equal(result.ok, false); assert.equal(result.code, 'INVALID_INPUT'); assert.ok(result.message);
  });
}
test('boundary date and maximum-length ID accepted without invalid nested IDs', () => {
  const result = generate({ startDate: '2100-12-31', durationDays: 1 }, getDalatCatalog(), { today: '2100-12-31', tripId: 'x'.repeat(80) });
  assert.equal(result.ok, true); assert.equal(result.trip.id.length, 80);
  assert.equal(generate({ startDate: '2100-12-31', durationDays: 2 }).code, 'INVALID_INPUT');
});
test('invalid caller context never throws a date/parser exception', () => {
  for (const context of [undefined, null, {}, { ...options, today: 'bad' }, { ...options, tripId: '' }]) {
    assert.equal(generateSampleTrip(input(), getDalatCatalog(), context).ok, false);
  }
});
test('empty/small/corrupt/duplicate catalogs fail rather than inventing places', () => {
  const catalog = getDalatCatalog();
  for (const data of [null, [], catalog.slice(0, 7), [...catalog.slice(0, 7), catalog[0]], catalog.map((entry) => ({ ...entry, coordinates: { latitude: 0, longitude: 0 } }))]) {
    const result = generate({}, data); assert.equal(result.ok, false); assert.equal(result.code, 'INVALID_CATALOG');
  }
});
test('valid catalog with too few eligible places gives shortage; no recycling or unbounded loops', () => {
  const catalog = getDalatCatalog().slice(0, 8);
  const result = generate({ durationDays: 5 }, catalog); assert.equal(result.ok, false); assert.equal(result.code, 'INSUFFICIENT_PLACES');
  const allEvening = getDalatCatalog().map((entry) => ({ ...entry, visitTimeHint: 'evening' }));
  assert.equal(generate({}, allEvening).code, 'INSUFFICIENT_PLACES');
  const tooLong = getDalatCatalog().map((entry) => ({ ...entry, suggestedDurationMinutes: 480 }));
  assert.equal(generate({}, tooLong).code, 'INSUFFICIENT_PLACES');
});
test('flexible 240-minute visits fit both slots without overlap', () => {
  const catalog = getDalatCatalog().map((entry) => ({ ...entry, suggestedDurationMinutes: 240, visitTimeHint: 'flexible' }));
  const result = generate({}, catalog); assert.equal(result.ok, true);
  assert.deepEqual(result.trip.days[0].activities.map((a) => a.endTime), ['13:00', '18:00']);
  assert.deepEqual(findTimeOverlaps(result.trip.days[0]), []);
});
test('reference price is a group estimate exactly once; zero is distinct from unknown', () => {
  // Synthetic evidence only; the actual bundled catalog has no verified prices.
  const catalog = getDalatCatalog().map((entry) => ({ ...entry, referenceCost: { status: 'reference', amountVnd: 50_000, basis: 'per-person', sourceUrl: 'https://example.test/price', checkedOn: '2026-10-14' } }));
  const result = generate({ people: 4, budgetVnd: 300_000 }, catalog); assert.equal(result.ok, true);
  assert.deepEqual(result.trip.days[0].activities.map((a) => a.costVnd), [200_000, 200_000]);
  assert.equal(result.budget.knownCostVnd, 400_000); assert.equal(result.budget.overBudgetVnd, 100_000);
  assert.ok(result.warnings.some((warning) => warning.includes('đồng giá')));
  const free = catalog.map((entry) => ({ ...entry, referenceCost: { ...entry.referenceCost, amountVnd: 0 } }));
  const freeResult = generate({}, free); assert.equal(freeResult.ok, true);
  assert.equal(freeResult.budget.unknownCostCount, 0); assert.equal(freeResult.budget.isComplete, true);
  assert.deepEqual(freeResult.trip.days[0].activities.map((a) => a.costVnd), [0, 0]);
});
test('group estimate above activity money limit returns a cost error', () => {
  const catalog = getDalatCatalog().map((entry) => ({ ...entry, referenceCost: { status: 'reference', amountVnd: 100_000_000, basis: 'per-person', sourceUrl: 'https://example.test/price', checkedOn: '2026-10-14' } }));
  assert.equal(generate({ people: 20 }, catalog).code, 'COST_LIMIT');
});
