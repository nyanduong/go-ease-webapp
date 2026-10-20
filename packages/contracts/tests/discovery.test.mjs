import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activitySchema, createTripInputSchema, destinationSchema, DESTINATIONS, discoveryPlaceSchema,
  discoveryPlacesRequestSchema, getDestination, todayAtDestination, tripSchema, tripSchemaWithCatalog,
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

test('destinations contain 8 independent Vietnam starting points and defensive lookup copies', () => {
  assert.equal(DESTINATIONS.length, 8);
  for (const destination of DESTINATIONS) assert.deepEqual(destinationSchema.parse(destination), destination);
  const hanoi = getDestination('ha-noi');
  hanoi.center.latitude = 0;
  assert.equal(getDestination('ha-noi').center.latitude, 21.0285);
  assert.equal(getDestination('unknown'), undefined);
  assert.equal(createTripInputSchema.safeParse(input).success, true);
  assert.equal(createTripInputSchema.safeParse({ ...input, destinationId: 'unknown' }).success, false);
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
