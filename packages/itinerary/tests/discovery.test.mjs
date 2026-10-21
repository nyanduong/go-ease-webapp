import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoveryPreviewResponseSchema, findTimeOverlaps, getDestination, summarizeBudget, todayAtDestination, tripSchema } from '@goease/contracts';
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

test('preview response rejects a different destination or a changed snapshot even if the trip and places parse alone', () => {
  const places = [place(0)];
  const result = generateDiscoveredTrip(input, places, options);
  assert.equal(result.ok, true);
  const response = { apiVersion: '1', destination: result.trip.destination, source: 'serpapi', places, result };
  assert.equal(discoveryPreviewResponseSchema.safeParse(response).success, true);
  assert.equal(discoveryPreviewResponseSchema.safeParse({ ...response, destination: getDestination('da-nang') }).success, false);
  assert.equal(discoveryPreviewResponseSchema.safeParse({ ...response, destination: { ...response.destination, center: { latitude: 0, longitude: 0 } } }).success, false);
  assert.equal(discoveryPreviewResponseSchema.safeParse({ ...response, places: [place(0, { destinationId: 'da-nang' })] }).success, false);
  assert.equal(discoveryPreviewResponseSchema.safeParse({ ...response, destination: { ...response.destination, address: 'Different selected region' } }).success, false);
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

test('planner schedules a Vietnam provider selection outside the popular list and preserves its sourced snapshot', () => {
  const destination = {
    id: 'dest-can-tho-from-provider', name: 'Cần Thơ', countryCode: 'VN', currency: 'VND', timeZone: 'Asia/Ho_Chi_Minh',
    center: { latitude: 10.0452, longitude: 105.7469 }, radiusKm: 25, address: 'Cần Thơ, Việt Nam',
    source: { provider: 'serpapi', externalId: 'can-tho-map-identity', sourceUrl: 'https://www.google.com/maps?q=Can+Tho', fetchedAt: '2026-10-20T12:00:00Z' },
    selectionToken: 'opaque_backend_selection_proof_not_authenticated_by_planner',
  };
  assert.equal(getDestination(destination.id), undefined);
  const request = { ...input, destinationId: destination.id, destination, startDate: '2026-10-21', durationDays: 1 };
  const localOptions = { ...options, today: todayAtDestination(new Date('2026-10-20T17:00:00Z'), destination) };
  const places = [place(0, { destinationId: destination.id, coordinates: { latitude: 10.046, longitude: 105.747 } }),
    place(1, { destinationId: destination.id, coordinates: { latitude: 10.047, longitude: 105.747 } }),
    place(2, { destinationId: 'ha-noi' }), place(3, { destinationId: destination.id, coordinates: { latitude: 21.0285, longitude: 105.8542 } })];
  const before = structuredClone({ request, places });
  const result = generateDiscoveredTrip(request, places, localOptions);
  assert.equal(result.ok, true);
  assert.equal(result.trip.timeZone, 'Asia/Ho_Chi_Minh');
  assert.equal(result.trip.destination.countryCode, 'VN');
  assert.deepEqual(result.trip.destination, destination);
  assert.equal(result.trip.currency, 'VND');
  assert.equal(result.trip.days[0].activities.length, 2);
  assert.ok(result.trip.days[0].activities.every((activity) => activity.location.placeSnapshot.destinationId === destination.id));
  assert.deepEqual({ request, places }, before);
  assert.equal(generateDiscoveredTrip({ ...request, startDate: '2026-10-20' }, places, localOptions).code, 'INVALID_INPUT');
  assert.equal(generateDiscoveredTrip({ ...request, destination: undefined }, places, localOptions).code, 'INVALID_INPUT');
  assert.deepEqual(tripSchema.parse(JSON.parse(JSON.stringify(result.trip))), result.trip);
  destination.name = 'Later provider update';
  assert.equal(result.trip.destination.name, 'Cần Thơ');
});

test('planner rejects new foreign or unknown-country selections even when coordinates and source are valid', () => {
  const destination = {
    id: 'dest-old-tokyo-fixture', name: 'Tokyo', countryCode: 'JP', currency: 'VND', timeZone: 'Asia/Tokyo',
    center: { latitude: 35.6762, longitude: 139.6503 }, radiusKm: 25,
  };
  const request = { ...input, destinationId: destination.id, destination };
  const places = [place(0, { destinationId: destination.id, coordinates: destination.center })];
  assert.equal(generateDiscoveredTrip(request, places, options).code, 'INVALID_INPUT');
  assert.equal(generateDiscoveredTrip({ ...request, destination: { ...destination, countryCode: null } }, places, options).code, 'INVALID_INPUT');
  const forgedOptions = { ...getDestination('ha-noi'), countryCode: 'JP', center: destination.center };
  assert.equal(generateDiscoveredTrip(input, places, { ...options, destination: forgedOptions }).code, 'INVALID_OPTIONS');
});

test('distance estimates are symmetric, finite at poles and clearly independent of live routes', () => {
  assert.equal(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  const a = { latitude: 90, longitude: 0 }, b = { latitude: -90, longitude: 180 };
  assert.ok(Number.isFinite(distanceKm(a, b)));
  assert.equal(distanceKm(a, b), distanceKm(b, a));
});

test('pace changes daily visit caps while respecting openings, preserving unknown costs and legacy defaults', () => {
  const places = Array.from({ length: 10 }, (_, index) => place(index, { durationMinutes: 30 }));
  const request = { ...input, durationDays: 1, budgetVnd: null };
  for (const [pace, expected] of [['relaxed', 2], ['balanced', 3], ['active', 4], [undefined, 3]]) {
    const result = generateDiscoveredTrip(request, places, { ...options, pace });
    assert.equal(result.ok, true);
    assert.equal(result.trip.days[0].activities.length, expected);
    assert.deepEqual(findTimeOverlaps(result.trip.days[0]), []);
    assert.equal(result.trip.budgetVnd, null);
    assert.equal(result.budget.unknownCostCount, expected);
    assert(result.trip.days[0].activities.every((activity) => activity.costVnd === null));
    assert(result.explanations.some((text) => text.includes(`tối đa ${expected}`)));
  }
  assert.equal(generateDiscoveredTrip(request, places, { ...options, pace: 'unknown' }).code, 'INVALID_OPTIONS');
});
