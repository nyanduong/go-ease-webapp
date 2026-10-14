const { test } = require('node:test');
const assert = require('node:assert/strict');
const { projectDayMap } = require('../.logic-tests/map-controller.js');
const { getDalatCatalog, getDalatPlaces } = require('@goease/catalog');
const { generateSampleTrip } = require('@goease/itinerary');
const places = getDalatPlaces();
const fixture = () => generateSampleTrip({ name: 'Map QA', destinationId: 'da-lat', startDate: '2026-10-14', durationDays: 2, people: 2, budgetVnd: null }, getDalatCatalog(), { tripId: 'map-qa', today: '2026-10-14' }).trip;
test('selected day pins use canonical place coordinates and names, not activity labels', () => {
  const trip = fixture(), day = trip.days[0]; day.activities[0].name = 'Renamed activity';
  const model = projectDayMap(trip, day.id, places), place = places.find(p => p.id === day.activities[0].location.placeId);
  assert.equal(model.pins.length, 2); assert.equal(model.pins[0].name, place.name);
  assert.deepEqual(model.pins[0].coordinates, place.coordinates); assert.equal(model.pins[0].activities[0].name, 'Renamed activity');
  assert.equal(model.pins[0].activities[0].order, 1);
});
test('changing day excludes previous-day pins and changes date/viewport', () => {
  const trip = fixture(), a = projectDayMap(trip, trip.days[0].id, places), b = projectDayMap(trip, trip.days[1].id, places);
  assert.notEqual(a.date, b.date); assert.notDeepEqual(a.region, b.region);
  assert.equal(a.pins.some(pin => b.pins.some(other => other.placeId === pin.placeId)), false);
});
test('repeated Place deduplicates marker and retains both activity IDs and order', () => {
  const trip = fixture(), day = trip.days[0]; day.activities[1].location = { ...day.activities[0].location };
  const model = projectDayMap(trip, day.id, places);
  assert.equal(model.pins.length, 1); assert.deepEqual(model.pins[0].activities.map(a => a.id), day.activities.map(a => a.id));
  assert.deepEqual(model.pins[0].activities.map(a => a.order), [1, 2]);
});
test('custom and missing-place activities never get guessed coordinates', () => {
  const trip = fixture(), day = trip.days[0]; day.activities[0].location = { kind: 'custom' }; day.activities[1].location = { kind: 'catalog', placeId: 'deleted-place' };
  const model = projectDayMap(trip, day.id, places);
  assert.equal(model.pins.length, 0); assert.equal(model.region, null);
  assert.deepEqual(model.unlocated.map(a => a.reason), ['custom', 'missing-place']);
  assert.equal(model.unlocated.every(a => !('coordinates' in a)), true);
});
test('empty day has no region or fake map center', () => {
  const trip = fixture(); trip.days[0].activities = [];
  const model = projectDayMap(trip, trip.days[0].id, places);
  assert.equal(model.activityCount, 0); assert.equal(model.region, null); assert.deepEqual(model.pins, []); assert.deepEqual(model.unlocated, []);
});
test('single pin viewport is centered on pin with nonzero zoom span', () => {
  const trip = fixture(); trip.days[0].activities.splice(1);
  const model = projectDayMap(trip, trip.days[0].id, places);
  assert.equal(model.region.latitude, model.pins[0].coordinates.latitude); assert.equal(model.region.longitude, model.pins[0].coordinates.longitude);
  assert.ok(model.region.latitudeDelta > 0); assert.ok(model.region.longitudeDelta > 0);
});
test('multiple-pin viewport contains all canonical coordinates with margin', () => {
  const trip = fixture(), model = projectDayMap(trip, trip.days[0].id, places), r = model.region;
  for (const pin of model.pins) {
    assert.ok(Math.abs(pin.coordinates.latitude - r.latitude) < r.latitudeDelta / 2);
    assert.ok(Math.abs(pin.coordinates.longitude - r.longitude) < r.longitudeDelta / 2);
  }
});
test('projection never mutates source trip or catalog and output is independent', () => {
  const trip = fixture(), before = JSON.stringify(trip), catalogBefore = JSON.stringify(places), model = projectDayMap(trip, trip.days[0].id, places);
  model.pins[0].coordinates.latitude = 0; model.pins[0].activities[0].name = 'changed';
  assert.equal(JSON.stringify(trip), before); assert.equal(JSON.stringify(places), catalogBefore);
});
test('invalid day/trip/catalog coordinates and duplicate Place IDs fail explicitly', () => {
  const trip = fixture(); assert.throws(() => projectDayMap(trip, 'not-a-day', places)); assert.throws(() => projectDayMap({}, 'id', places));
  assert.throws(() => projectDayMap(trip, trip.days[0].id, [{ ...places[0], coordinates: { latitude: NaN, longitude: 108 } }]));
  assert.throws(() => projectDayMap(trip, trip.days[0].id, [places[0], places[0]]));
});
test('missing catalog entries produce honest missing-place items with no pin', () => {
  const trip = fixture(), model = projectDayMap(trip, trip.days[0].id, []);
  assert.equal(model.pins.length, 0); assert.equal(model.unlocated.length, 2); assert.equal(model.region, null);
});
