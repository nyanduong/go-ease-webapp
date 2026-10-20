import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoveryPreviewResponseSchema, findTimeOverlaps, getDestination, summarizeBudget, tripSchema } from '@goease/contracts';
import { distanceKm, generateDiscoveredTrip, generateSampleTrip } from '@goease/itinerary';
import { getDalatCatalog } from '@goease/catalog';

const input = { name: 'Hà Nội của mình', destinationId: 'ha-noi', startDate: '2026-12-30', durationDays: 2, people: 4, budgetVnd: 500000 };
const options = { tripId: 'discovered-1', today: '2026-10-20' };
function place(index, override = {}) {
  return { id: `google-${index}`, provider: 'serpapi', externalId: `external-${index}`, name: `Địa điểm fixture ${index}`, destinationId: 'ha-noi',
    coordinates: { latitude: 21.0285 + index * 0.005, longitude: 105.8542 }, address: `Địa chỉ ${index}`, category: 'heritage',
    rating: 4.5, priceLevel: '$$', durationMinutes: 60, durationBasis: 'estimate',
    sourceUrl: 'https://example.test/source', fetchedAt: '2026-10-20T12:00:00Z', ...override };
}

test('planner uses nearby supplied places deterministically, snapshots sources and keeps unknown prices null', () => {
  const places = Array.from({ length: 6 }, (_, index) => place(index));
  const before = structuredClone({ input, places });
  const result = generateDiscoveredTrip(input, places, options);
  assert.equal(result.ok, true);
  assert.deepEqual(result, generateDiscoveredTrip(input, [...places].reverse(), options));
  assert.equal(result.trip.destinationId, 'ha-noi');
  assert.equal(result.trip.days.flatMap((day) => day.activities).length, 6);
  assert.equal(result.trip.days[0].activities[0].location.placeId, 'google-0');
  assert.equal(result.budget.knownCostVnd, 0);
  assert.equal(result.budget.unknownCostCount, 6);
  assert.equal(result.budget.isComplete, false);
  for (const day of result.trip.days) {
    assert.deepEqual(findTimeOverlaps(day), []);
    assert.ok(day.activities.length <= 3);
    for (const activity of day.activities) {
      assert.equal(activity.costVnd, null);
      assert.equal(activity.location.placeSnapshot.sourceUrl, 'https://example.test/source');
      assert.match(activity.notes, /ước tính/);
    }
  }
  assert.deepEqual({ input, places }, before);
  assert.equal(discoveryPreviewResponseSchema.safeParse({ apiVersion: '1', destination: getDestination('ha-noi'), source: 'serpapi', places, result }).success, true);
  assert.equal(discoveryPreviewResponseSchema.safeParse({ apiVersion: '1', destination: getDestination('ha-noi'), source: 'serpapi', places, result: { ...result, budget: { ...result.budget, knownCostVnd: 999 } } }).success, false);
});

test('deduplicates external IDs and rejects wrong-destination or far-away candidates', () => {
  const places = [place(0), place(1, { externalId: 'external-0' }), place(2, { destinationId: 'da-lat' }), place(3, { coordinates: { latitude: 0, longitude: 0 } })];
  const result = generateDiscoveredTrip(input, places, options);
  assert.equal(result.ok, true);
  assert.equal(result.trip.days.flatMap((day) => day.activities).length, 1);
  assert.ok(result.warnings.some((warning) => warning.includes('trùng')));
  assert.ok(result.warnings.some((warning) => warning.includes('ngày chưa')));
  assert.equal(generateDiscoveredTrip(input, places.slice(2), options).code, 'INSUFFICIENT_PLACES');
});

test('structured opening windows, closed days, lunch and long durations constrain actual scheduled hours', () => {
  // 30/12/2026 is Wednesday (3). An afternoon opening cannot be scheduled in the morning.
  const places = [place(0, { openingWindows: [{ dayOfWeek: 3, startTime: '14:00', endTime: '16:00' }] }), place(1, { openingWindows: [] }), place(2, { durationMinutes: 480 })];
  const result = generateDiscoveredTrip({ ...input, durationDays: 1 }, places, options);
  assert.equal(result.ok, true);
  const activities = result.trip.days[0].activities;
  assert.equal(activities.length, 1);
  assert.equal(activities[0].startTime, '14:00');
  assert.equal(activities[0].endTime, '15:00');
  assert.ok(result.warnings.some((warning) => warning.includes('chưa xếp')));
  const lunch = generateDiscoveredTrip({ ...input, durationDays: 1 }, [place(0, { category: 'food' })], options);
  assert.equal(lunch.ok, true);
  assert.equal(lunch.trip.days[0].activities[0].startTime, '12:00');
});

test('missing place data, schema corruption and invalid requests fail explicitly without fabricated activities', () => {
  assert.equal(generateDiscoveredTrip(input, [], options).code, 'INSUFFICIENT_PLACES');
  assert.equal(generateDiscoveredTrip(input, [place(0, { sourceUrl: 'bad' })], options).code, 'INVALID_CATALOG');
  assert.equal(generateDiscoveredTrip({ ...input, destinationId: 'unknown' }, [place(0)], options).code, 'INVALID_INPUT');
  assert.equal(generateDiscoveredTrip(input, [place(0)], { ...options, destination: getDestination('da-lat') }).code, 'INVALID_OPTIONS');
  assert.equal(generateDiscoveredTrip(input, [place(0)], { ...options, today: 'invalid' }).code, 'INVALID_OPTIONS');
  assert.equal(generateDiscoveredTrip({ ...input, startDate: '2020-01-01' }, [place(0)], options).code, 'INVALID_INPUT');
});

test('persisted plan preserves source snapshots despite later provider updates and all budget data stays derived', () => {
  const places = [place(0)];
  const result = generateDiscoveredTrip(input, places, options);
  assert.equal(result.ok, true);
  places[0].name = 'Provider changed';
  const restored = tripSchema.parse(JSON.parse(JSON.stringify(result.trip)));
  assert.equal(restored.days[0].activities[0].name, 'Địa điểm fixture 0');
  assert.deepEqual(summarizeBudget(restored), result.budget);
  assert.equal(generateSampleTrip(input, getDalatCatalog(), options).code, 'INVALID_CATALOG');
});

test('distance estimates are symmetric, finite at poles and clearly independent of live routes', () => {
  assert.equal(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  const a = { latitude: 90, longitude: 0 }, b = { latitude: -90, longitude: 180 };
  assert.ok(Number.isFinite(distanceKm(a, b)));
  assert.equal(distanceKm(a, b), distanceKm(b, a));
});
