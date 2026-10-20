import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activitySchema, addCalendarDays, budgetVndSchema, calendarDateSchema,
  catalogSchema, clockTimeSchema, createTripInputSchemaFor, DESTINATION,
  findTimeOverlaps, idSchema, moveActivity, placeSchema, SCHEMA_VERSION,
  summarizeBudget, todayAtDestination, tripDaySchema, tripSchema, tripSchemaWithCatalog,
} from '@goease/contracts';

function activity(id = 'activity-1', overrides = {}) {
  return {
    id, name: 'Ăn trưa', location: { kind: 'custom' },
    startTime: null, endTime: null, costVnd: null, notes: '', ...overrides,
  };
}

function trip(durationDays = 1, overrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION, id: 'trip-1', name: 'Đà Lạt cùng bạn',
    destinationId: DESTINATION.id, timeZone: DESTINATION.timeZone, currency: DESTINATION.currency,
    startDate: '2026-12-30', durationDays, people: 4, budgetVnd: null,
    days: Array.from({ length: durationDays }, (_, i) => ({
      id: `day-${i}`, date: addCalendarDays('2026-12-30', i), activities: [activity(`activity-${i}`)],
    })), ...overrides,
  };
}

function createInput(overrides = {}) {
  return { name: 'Đà Lạt', destinationId: DESTINATION.id, startDate: '2026-12-30', durationDays: 1, people: 4, budgetVnd: null, ...overrides };
}

// Test doubles only: these are not production catalog coordinates or verified sources.
function catalog() {
  return Array.from({ length: 8 }, (_, i) => ({
    id: `place-${i}`, name: `Địa điểm kiểm thử ${i}`, destinationId: DESTINATION.id,
    coordinates: { latitude: 11, longitude: 108 },
    sources: [{ url: 'https://example.test/place', accessedOn: '2026-10-14' }],
  }));
}

for (const date of ['2000-02-29', '2024-02-29', '2026-12-31', '2100-12-31']) {
  test(`accept real calendar date ${date}`, () => assert.equal(calendarDateSchema.parse(date), date));
}
for (const date of ['2100-02-29', '2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '1999-12-31', '2101-01-01', '2026-1-01', '2026-01-01T00:00:00Z', null, 20260101]) {
  test(`reject invalid calendar date ${date}`, () => assert.equal(calendarDateSchema.safeParse(date).success, false));
}

test('calendar addition crosses leap day, month and year without device timezone', () => {
  assert.equal(addCalendarDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addCalendarDays('2024-02-28', 2), '2024-03-01');
  assert.equal(addCalendarDays('2100-02-28', 1), '2100-03-01');
  assert.equal(addCalendarDays('2026-12-30', 4), '2027-01-03');
  assert.throws(() => addCalendarDays('2100-12-31', 1));
  for (const offset of [-1, 5, 0.5, NaN, Infinity, '1']) assert.throws(() => addCalendarDays('2026-01-01', offset));
});

test('today is the destination date at the UTC boundary', () => {
  assert.equal(todayAtDestination(new Date('2026-10-14T16:59:59Z')), '2026-10-14');
  assert.equal(todayAtDestination(new Date('2026-10-14T17:00:00Z')), '2026-10-15');
  assert.throws(() => todayAtDestination(new Date('invalid')));
});

test('canonical dates, times and IDs reject trailing line terminators', () => {
  for (const suffix of ['\n', '\r', '\r\n']) {
    assert.equal(calendarDateSchema.safeParse(`2026-10-14${suffix}`).success, false);
    assert.equal(clockTimeSchema.safeParse(`09:00${suffix}`).success, false);
    assert.equal(idSchema.safeParse(`activity-1${suffix}`).success, false);
  }
});

test('creation checks today, storage accepts past trips', () => {
  const schema = createTripInputSchemaFor('2026-12-30');
  assert.equal(schema.safeParse(createInput()).success, true);
  assert.equal(schema.safeParse(createInput({ startDate: '2026-12-29' })).success, false);
  assert.equal(tripSchema.safeParse(trip()).success, true);
  assert.throws(() => createTripInputSchemaFor('2026-02-30'));
});

for (const count of [1, 5]) {
  test(`trip has ${count} consecutive days including year rollover`, () => {
    const parsed = tripSchema.parse(trip(count));
    assert.equal(parsed.days.length, count);
    assert.equal(parsed.days.at(-1).date, count === 5 ? '2027-01-03' : '2026-12-30');
  });
}
for (const durationDays of [0, 6, 1.5, '1', NaN, Infinity]) {
  test(`reject invalid duration ${durationDays}`, () => {
    assert.equal(tripSchema.safeParse(trip(1, { durationDays })).success, false);
  });
}

test('reject last day beyond calendar range, missing or reordered days', () => {
  assert.equal(createTripInputSchemaFor('2100-12-31').safeParse(createInput({ startDate: '2100-12-31', durationDays: 2 })).success, false);
  const input = trip(2);
  input.days.reverse();
  assert.equal(tripSchema.safeParse(input).success, false);
  assert.equal(tripSchema.safeParse(trip(2, { days: trip().days })).success, false);
});

for (const people of [0, 21, 1.5, '4']) {
  test(`reject invalid people ${people}`, () => assert.equal(tripSchema.safeParse(trip(1, { people })).success, false));
}
test('accept people bounds and normalize titles without empty names', () => {
  for (const people of [1, 20]) assert.equal(tripSchema.parse(trip(1, { people })).people, people);
  assert.equal(tripSchema.parse(trip(1, { name: '  Đà Lạt  ' })).name, 'Đà Lạt');
  for (const name of ['', '   ', 'x'.repeat(81)]) assert.equal(tripSchema.safeParse(trip(1, { name })).success, false);
  assert.equal(tripSchema.safeParse(trip(1, { name: 'x'.repeat(80) })).success, true);
});

for (const cost of [-1, 0.5, '1000', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined]) {
  test(`reject invalid money ${String(cost)}`, () => {
    assert.equal(budgetVndSchema.safeParse(cost).success, false);
    const input = trip();
    input.days[0].activities[0].costVnd = cost;
    assert.throws(() => summarizeBudget(input));
  });
}
test('budget and cost boundary limits, null and free are distinct', () => {
  assert.equal(budgetVndSchema.parse(null), null);
  assert.equal(budgetVndSchema.parse(0), 0);
  assert.equal(budgetVndSchema.safeParse(1_000_000_000).success, true);
  assert.equal(budgetVndSchema.safeParse(1_000_000_001).success, false);
  assert.equal(activitySchema.safeParse(activity('a', { costVnd: 100_000_000 })).success, true);
  assert.equal(activitySchema.safeParse(activity('a', { costVnd: 100_000_001 })).success, false);
});

test('budget totals group costs once; distinguishes unknown, free, equal and over budget', () => {
  const input = trip(2, { budgetVnd: 600_000 });
  input.days[0].activities = [activity('a', { costVnd: 400_000 }), activity('b', { costVnd: 200_000 })];
  input.days[1].activities = [activity('c', { costVnd: 0 }), activity('d')];
  const summary = summarizeBudget(input);
  assert.equal(summary.knownCostVnd, 600_000);
  assert.equal(summary.remainingVnd, 0);
  assert.equal(summary.overBudgetVnd, 0);
  assert.equal(summary.unknownCostCount, 1);
  assert.equal(summary.isComplete, false);
  assert.deepEqual(summary.days, [
    { dayId: 'day-0', knownCostVnd: 600_000, unknownCostCount: 0 },
    { dayId: 'day-1', knownCostVnd: 0, unknownCostCount: 1 },
  ]);
  input.budgetVnd = 0;
  assert.equal(summarizeBudget(input).overBudgetVnd, 600_000);
  input.budgetVnd = null;
  assert.equal(summarizeBudget(input).remainingVnd, null);
  assert.equal(summarizeBudget(input).overBudgetVnd, null);
  input.days[1].activities.pop();
  assert.equal(summarizeBudget(input).isComplete, true);
});

test('total cap is enforced before returning a summary', () => {
  const input = trip();
  input.days[0].activities = Array.from({ length: 10 }, (_, i) => activity(`a-${i}`, { costVnd: 100_000_000 }));
  assert.equal(summarizeBudget(input).knownCostVnd, 1_000_000_000);
  input.days[0].activities.push(activity('extra', { costVnd: 1 }));
  assert.equal(tripSchema.safeParse(input).success, false);
  assert.throws(() => summarizeBudget(input));
});

test('hours require a pair, valid minute precision and increasing same-day interval', () => {
  for (const [startTime, endTime] of [[null, '10:00'], ['09:00', null], ['10:00', '10:00'], ['23:00', '01:00'], ['9:00', '10:00'], ['09:00', '24:00'], ['09:00:00', '10:00']]) {
    assert.equal(activitySchema.safeParse(activity('a', { startTime, endTime })).success, false);
  }
  assert.equal(clockTimeSchema.safeParse('23:59').success, true);
  assert.equal(clockTimeSchema.safeParse('12:60').success, false);
  assert.equal(activitySchema.safeParse(activity()).success, true);
});

test('overlap warns without rejecting; touching intervals and no hours ignored', () => {
  const input = trip();
  input.days[0].activities = [
    activity('late', { startTime: '10:00', endTime: '12:00' }),
    activity('early', { startTime: '09:00', endTime: '10:00' }),
    activity('inside', { startTime: '10:30', endTime: '11:00' }), activity('unknown'),
  ];
  assert.equal(tripSchema.safeParse(input).success, true);
  assert.deepEqual(findTimeOverlaps(input.days[0]), [{ activityIds: ['late', 'inside'] }]);
  assert.deepEqual(tripSchema.parse(input).days[0].activities.map((a) => a.id), ['late', 'early', 'inside', 'unknown']);
});

test('strict schema/version/IDs reject corrupted and future data', () => {
  for (const override of [{ schemaVersion: 2 }, { schemaVersion: '1' }, { currency: 'USD' }, { timeZone: 'UTC' }, { destinationId: 'unknown-city' }, { id: '' }, { id: ' bad' }, { serverOwner: 'someone' }]) {
    assert.equal(tripSchema.safeParse(trip(1, override)).success, false);
  }
  assert.equal(tripSchema.safeParse(JSON.parse(JSON.stringify(trip()))).success, true);
  const input = trip(2);
  input.days[1].id = input.days[0].id;
  assert.equal(tripSchema.safeParse(input).success, false);
  input.days[1].id = 'day-1';
  input.days[1].activities[0].id = input.days[0].activities[0].id;
  assert.equal(tripSchema.safeParse(input).success, false);
  assert.equal(tripDaySchema.safeParse({ ...trip().days[0], activities: [activity('same'), activity('same')] }).success, false);
});

test('empty day, activity capacity and content limits', () => {
  const day = { id: 'day', date: '2026-10-14', activities: [] };
  assert.equal(tripDaySchema.safeParse(day).success, true);
  day.activities = Array.from({ length: 12 }, (_, i) => activity(`a-${i}`));
  assert.equal(tripDaySchema.safeParse(day).success, true);
  day.activities.push(activity('overflow'));
  assert.equal(tripDaySchema.safeParse(day).success, false);
  assert.equal(activitySchema.safeParse(activity('a', { name: 'x'.repeat(120), notes: 'n'.repeat(500) })).success, true);
  for (const override of [{ name: '  ' }, { name: 'x'.repeat(121) }, { notes: 'n'.repeat(501) }]) {
    assert.equal(activitySchema.safeParse(activity('a', override)).success, false);
  }
});

test('moving/reordering preserves IDs, data and input immutability', () => {
  const input = trip(2);
  input.days[0].activities = [activity('a', { notes: 'giữ lại', costVnd: 400_000 }), activity('b')];
  const before = structuredClone(input);
  const reordered = moveActivity(input, 'a', 'day-0', 1);
  assert.deepEqual(reordered.days[0].activities.map((a) => a.id), ['b', 'a']);
  const moved = moveActivity(reordered, 'a', 'day-1');
  assert.deepEqual(moved.days[0].activities.map((a) => a.id), ['b']);
  assert.deepEqual(moved.days[1].activities.at(-1), before.days[0].activities[0]);
  assert.equal(summarizeBudget(moved).knownCostVnd, summarizeBudget(input).knownCostVnd);
  assert.deepEqual(input, before);
});

test('moving into a full day fails atomically; invalid targets and positions fail', () => {
  const input = trip(2);
  input.days[1].activities = Array.from({ length: 12 }, (_, i) => activity(`target-${i}`));
  const before = structuredClone(input);
  assert.throws(() => moveActivity(input, 'activity-0', 'day-1'));
  assert.deepEqual(input, before);
  for (const position of [-1, 1, 0.5, NaN, null, '0']) assert.throws(() => moveActivity(input, 'activity-0', 'day-0', position));
  assert.throws(() => moveActivity(input, 'missing', 'day-0'));
  assert.throws(() => moveActivity(input, 'activity-0', 'missing'));
  assert.throws(() => moveActivity(input, 'activity-0', 'day-1', 0));
});

test('catalog validates coordinates, evidence and uniqueness; no coordinates on custom activities', () => {
  const places = catalog();
  assert.equal(catalogSchema.safeParse(places).success, true);
  for (const coordinates of [{ latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }, { latitude: NaN, longitude: 0 }, { latitude: '11', longitude: 108 }]) {
    assert.equal(placeSchema.safeParse({ ...places[0], coordinates }).success, false);
  }
  assert.equal(placeSchema.safeParse({ ...places[0], sources: [] }).success, false);
  assert.equal(placeSchema.safeParse({ ...places[0], sources: [{ url: 'javascript:alert(1)', accessedOn: '2026-10-14' }] }).success, false);
  assert.equal(catalogSchema.safeParse(places.slice(0, 7)).success, false);
  assert.equal(catalogSchema.safeParse([...places.slice(0, 7), places[0]]).success, false);
  assert.equal(activitySchema.safeParse(activity('a', { location: { kind: 'custom', coordinates: places[0].coordinates } })).success, false);
});

test('catalog-aware ingestion rejects dangling references and mismatched place names', () => {
  const places = catalog();
  const schema = tripSchemaWithCatalog(places);
  const input = trip();
  input.days[0].activities = [activity('a', { name: places[0].name, location: { kind: 'catalog', placeId: places[0].id } })];
  assert.equal(schema.safeParse(input).success, true);
  input.days[0].activities[0].location.placeId = 'unknown';
  assert.equal(schema.safeParse(input).success, false);
  input.days[0].activities[0].location.placeId = places[0].id;
  input.days[0].activities[0].name = 'Sai tên catalog';
  assert.equal(schema.safeParse(input).success, false);
});
