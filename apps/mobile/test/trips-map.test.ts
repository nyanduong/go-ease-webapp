import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SampleMapCatalog } from '@goease/contracts';
import { routeablePlaces } from '../src/features/maps/pins.ts';
import { emptyActivity, formFromTrip } from '../src/features/trips/form.ts';
import { tripMapActivities } from '../src/features/trips/map.ts';
import { id, trip } from './trips-fixture.ts';

test('Trip map uses selected-day canonical coordinates, edited activity title, no invented manual pins', () => {
  const saved = trip(), draft = formFromTrip(saved); draft.days[0]!.activities[0]!.title = 'EDITED TEST ONLY'; draft.days[0]!.activities.push({ ...emptyActivity(), title: 'Manual TEST ONLY' });
  const first = tripMapActivities(saved, draft, 1), second = tripMapActivities(saved, draft, 2);
  assert.equal(first[0]!.title, 'EDITED TEST ONLY'); assert.deepEqual(first[0]!.place, saved.days[0]!.activities[0]!.place); assert.equal(first[1]!.place, null);
  assert.equal(second.length, 1); assert.equal(second[0]!.place?.id, id(22)); assert.deepEqual(tripMapActivities(saved, draft, 3), []);
  draft.days[0]!.activities[0]!.placeId = id(777); assert.equal(tripMapActivities(saved, draft, 1)[0]!.place, null);
});
test('Historical inactive places remain visible while new route choices require actually loaded matching catalog IDs', () => {
  const saved = trip(); saved.days[0]!.activities[0]!.place!.active = false;
  const activities = tripMapActivities(saved, formFromTrip(saved), 1), place = saved.days[0]!.activities[0]!.place!;
  const catalog: SampleMapCatalog = { destinationCode: 'VN-HANOI-SAMPLE', isSample: true, places: [{ id: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude, sourceUrl: 'https://www.wikidata.org/w/index.php?title=Q1&oldid=1', attribution: place.attribution }] };
  assert.equal(activities[0]!.place?.active, false); assert.deepEqual(routeablePlaces(catalog, activities), []);
  activities[0]!.place = { ...place, active: true }; assert.equal(routeablePlaces(undefined, activities).length, 0); assert.equal(routeablePlaces(catalog, activities).length, 1);
  assert.equal(routeablePlaces(catalog, tripMapActivities(saved, formFromTrip(saved), 2)).length, 0);
});
