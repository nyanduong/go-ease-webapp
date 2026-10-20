import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activitySchema, createTripInputSchema, destinationSchema, DESTINATIONS, discoveryPlaceSchema,
  destinationSearchResponseSchema, discoveryPlacesRequestSchema, discoveryPlacesResponseSchema, getDestination, POPULAR_DESTINATIONS,
  todayAtDestination, tripSchema, tripSchemaWithCatalog,
} from '@goease/contracts';

const input = { name: 'Hà Nội', destinationId: 'ha-noi', startDate: '2026-12-30', durationDays: 1, people: 2, budgetVnd: null };
const place = {
  id: 'google-1', provider: 'serpapi', externalId: 'map-id-1', name: 'Fixture có nguồn', destinationId: 'ha-noi',
  coordinates: { latitude: 21.0285, longitude: 105.8542 }, address: 'Địa chỉ kiểm thử', category: 'heritage',
  rating: null, priceLevel: null, durationMinutes: 60, durationBasis: 'estimate',
  sourceUrl: 'https://example.test/source', fetchedAt: '2026-10-20T12:00:00Z',
};
function trip(overrides = {}) {
  return { ...input, schemaVersion: 1, generationSource: 'discovery', id: 'test', destination: getDestination('ha-noi'),
    timeZone: 'Asia/Ho_Chi_Minh', currency: 'VND', days: [{ id: 'day-1', date: input.startDate, activities: [{
      id: 'act-1', name: place.name, location: { kind: 'discovered', placeId: place.id, placeSnapshot: place },
      startTime: '09:00', endTime: '10:00', notes: '', costVnd: null,
    }] }], ...overrides };
}

test('popular destinations remain backward-compatible suggestions with defensive lookup copies', () => {
  assert.equal(DESTINATIONS.length, 8);
  assert.equal(POPULAR_DESTINATIONS, DESTINATIONS);
  for (const destination of DESTINATIONS) assert.deepEqual(destinationSchema.parse(destination), destination);
  const hanoi = getDestination('ha-noi');
  hanoi.center.latitude = 0;
  assert.equal(getDestination('ha-noi').center.latitude, 21.0285);
  assert.equal(getDestination('unknown'), undefined);
  assert.equal(createTripInputSchema.safeParse(input).success, true);
  assert.equal(createTripInputSchema.safeParse({ ...input, destinationId: 'unknown' }).success, false);
});

const tokyo = {
  id: 'dest-provider-tokyo', name: 'Tokyo', countryCode: 'JP', timeZone: 'Asia/Tokyo', currency: 'VND',
  center: { latitude: 35.6762, longitude: 139.6503 }, radiusKm: 35, address: 'Tokyo, Japan',
  source: { provider: 'serpapi', externalId: 'provider-tokyo', sourceUrl: 'https://www.google.com/maps?q=Tokyo', fetchedAt: '2026-10-20T12:00:00Z' },
  selectionToken: 'opaque_backend_selection_proof_not_authenticated_by_contracts',
};
const canTho = {
  id: 'dest-provider-can-tho', name: 'Cần Thơ', countryCode: 'VN', timeZone: 'Asia/Ho_Chi_Minh', currency: 'VND',
  center: { latitude: 10.0452, longitude: 105.7469 }, radiusKm: 35, address: 'Cần Thơ, Việt Nam',
  source: { provider: 'serpapi', externalId: 'provider-can-tho', sourceUrl: 'https://www.google.com/maps?q=Can+Tho', fetchedAt: '2026-10-20T12:00:00Z' },
  selectionToken: 'opaque_backend_selection_proof_not_authenticated_by_contracts',
};

test('Vietnam provider selections outside the popular list retain source and accept new trip/discovery inputs', () => {
  assert.equal(getDestination(canTho.id), undefined);
  assert.deepEqual(destinationSchema.parse(canTho), canTho);
  const value = { ...input, destinationId: canTho.id, destination: canTho };
  assert.deepEqual(createTripInputSchema.parse(value), value);
  assert.deepEqual(discoveryPlacesRequestSchema.parse({ destinationId: canTho.id, destination: canTho }), { destinationId: canTho.id, destination: canTho });
  assert.equal(todayAtDestination(new Date('2026-10-20T16:00:00Z'), canTho), '2026-10-20');
  assert.equal(destinationSchema.safeParse({ ...canTho, currency: 'USD' }).success, false);
  assert.equal(createTripInputSchema.safeParse({ ...value, destinationId: 'ha-noi' }).success, false);
  assert.equal(discoveryPlacesRequestSchema.safeParse({ destinationId: 'ha-noi', destination: canTho }).success, false);
});

test('new trip and discovery inputs reject foreign or unknown country while historical snapshots remain readable', () => {
  for (const destination of [tokyo, { ...canTho, countryCode: null }]) {
    assert.equal(createTripInputSchema.safeParse({ ...input, destinationId: destination.id, destination }).success, false);
    assert.equal(discoveryPlacesRequestSchema.safeParse({ destinationId: destination.id, destination }).success, false);
  }
  assert.equal(destinationSchema.parse({ ...tokyo, countryCode: null }).countryCode, null);
});

test('historical foreign destination snapshots reopen independently of provider search and keep their original timezone', () => {
  const value = trip({ destinationId: tokyo.id, destination: tokyo, timeZone: tokyo.timeZone, days: [{ id: 'day-1', date: input.startDate, activities: [] }] });
  assert.deepEqual(tripSchemaWithCatalog([]).parse(JSON.parse(JSON.stringify(value))), value);
  assert.equal(tripSchema.safeParse({ ...value, destination: undefined }).success, false);
  assert.equal(tripSchema.safeParse({ ...value, timeZone: 'Asia/Ho_Chi_Minh' }).success, false);
  const noProof = structuredClone(value);
  delete noProof.destination.selectionToken;
  assert.deepEqual(tripSchema.parse(noProof), noProof);
  assert.equal(todayAtDestination(new Date('2026-10-20T16:00:00Z'), tokyo), '2026-10-21');
});

test('provider destination data rejects invalid source URLs, coordinates, country and malformed opaque selections', () => {
  for (const override of [
    { center: { latitude: 91, longitude: 0 } }, { countryCode: 'Japan' }, { countryCode: 'JP\n' }, { address: ' ' },
    { source: { ...tokyo.source, sourceUrl: 'javascript:alert(1)' } },
    { source: { ...tokyo.source, fetchedAt: 'yesterday' } }, { source: { ...tokyo.source, externalId: '' } },
    { selectionToken: 'too-short' }, { selectionToken: `${'a'.repeat(32)}.x` }, { selectionToken: 'a'.repeat(129) }, { selectionToken: `${'a'.repeat(32)}\n` },
  ]) assert.equal(destinationSchema.safeParse({ ...tokyo, ...override }).success, false);
});

test('destination search responses describe provider and cache work while still parsing earlier suggestion responses', () => {
  const response = { apiVersion: '1', destinations: [canTho], source: 'serpapi', metadata: { cacheHit: false, providerRequests: 1, durationMs: 120, fetchedAt: canTho.source.fetchedAt } };
  assert.deepEqual(destinationSearchResponseSchema.parse(response), response);
  assert.equal(destinationSearchResponseSchema.safeParse({ apiVersion: '1', destinations: DESTINATIONS }).success, true);
  assert.equal(destinationSearchResponseSchema.safeParse({ ...response, source: 'fixed-list-only' }).success, false);
  assert.equal(destinationSearchResponseSchema.safeParse({ ...response, metadata: { ...response.metadata, providerRequests: -1 } }).success, false);
});

test('place responses cannot mix the selected destination with another destination source', () => {
  const response = { apiVersion: '1', destination: getDestination('ha-noi'), source: 'serpapi', places: [place], warnings: [] };
  assert.deepEqual(discoveryPlacesResponseSchema.parse(response), response);
  assert.equal(discoveryPlacesResponseSchema.safeParse({ ...response, destination: tokyo }).success, false);
});

test('destination snapshots permit further VND places and enforce identity/time zone/currency', () => {
  const destination = { ...getDestination('ha-noi'), id: 'test-town', name: 'Fixture town', timeZone: 'UTC' };
  assert.equal(createTripInputSchema.safeParse({ ...input, destinationId: destination.id, destination }).success, true);
  assert.equal(tripSchema.safeParse(trip({ destinationId: 'da-lat' })).success, false);
  assert.equal(tripSchema.safeParse(trip({ destination: undefined })).success, false);
  assert.equal(tripSchema.safeParse(trip({ timeZone: 'UTC' })).success, false);
  assert.equal(destinationSchema.safeParse({ ...destination, timeZone: 'Somewhere/Nowhere' }).success, false);
  assert.equal(destinationSchema.safeParse({ ...destination, currency: 'USD' }).success, false);
  assert.equal(todayAtDestination(new Date('2026-10-20T23:00:00Z'), destination), '2026-10-20');
});

test('discovered snapshots survive trip parse without any external catalogue', () => {
  const value = trip();
  assert.deepEqual(tripSchemaWithCatalog([]).parse(value), value);
  assert.deepEqual(tripSchema.parse(JSON.parse(JSON.stringify(value))), value);
  const changed = structuredClone(value);
  changed.days[0].activities[0].location.placeSnapshot.name = 'Mới từ provider';
  assert.equal(tripSchema.safeParse(changed).success, false);
  changed.days[0].activities[0].location.placeSnapshot.name = place.name;
  changed.days[0].activities[0].location.placeSnapshot.destinationId = 'da-lat';
  assert.equal(tripSchema.safeParse(changed).success, false);
  const activity = value.days[0].activities[0];
  assert.equal(activitySchema.safeParse({ ...activity, location: { ...activity.location, placeId: 'another' } }).success, false);
});

test('source coordinates, opening windows and interests reject malformed provider data', () => {
  for (const override of [{ coordinates: { latitude: 999, longitude: 0 } }, { sourceUrl: 'javascript:alert(1)' }, { rating: 6 }, { fetchedAt: 'yesterday' }, { durationMinutes: 0 }, { openingWindows: [{ dayOfWeek: 7, startTime: '09:00', endTime: '10:00' }] }, { openingWindows: [{ dayOfWeek: 1, startTime: '22:00', endTime: '03:00' }] }]) {
    assert.equal(discoveryPlaceSchema.safeParse({ ...place, ...override }).success, false);
  }
  assert.equal(discoveryPlacesRequestSchema.safeParse({ destinationId: 'ha-noi', interests: ['food', 'cafe'] }).success, true);
  assert.equal(discoveryPlacesRequestSchema.safeParse({ destinationId: 'ha-noi', interests: ['invented'] }).success, false);
});
