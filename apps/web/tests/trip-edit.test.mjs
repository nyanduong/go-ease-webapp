import test from 'node:test';
import assert from 'node:assert/strict';
import { getDalatCatalog, getDalatPlaces } from '@goease/catalog';
import { generateSampleTrip } from '@goease/itinerary';
import { moveActivity, removeActivity } from '@goease/trip-client/edit-trip-controller';
import { appendActivity, editBuffer, projectEditBuffer } from '../.logic-tests/edit-buffer.js';
import { budgetPresentation } from '../.logic-tests/budget-presentation.js';
const places = getDalatPlaces();
function fixture() {
  const result = generateSampleTrip(
    {
      name: 'Đà Lạt cùng bạn',
      destinationId: 'da-lat',
      startDate: '2099-10-19',
      durationDays: 2,
      people: 5,
      budgetVnd: 10000000,
    },
    getDalatCatalog(),
    { tripId: 'edit-fixture', today: '2099-10-19' },
  );
  assert.equal(result.ok, true);
  return result.trip;
}

test('raw invalid fields survive projections and never become a saveable trip', () => {
  const trip = fixture(),
    buffer = editBuffer(trip),
    id = trip.days[1].activities[0].id;
  buffer.name = 'Tên mới';
  buffer.group.people = 'abc';
  buffer.activities[id].costVnd = '12.000';
  const result = projectEditBuffer(buffer, places);
  assert.equal(result.ok, false);
  assert(result.errors.group.people);
  assert(result.errors.activities[id].costVnd);
  assert.equal(buffer.activities[id].costVnd, '12.000');
  assert.equal(buffer.group.people, 'abc');
  assert.equal(trip.name, 'Đà Lạt cùng bạn');
  buffer.group.people = '3';
  buffer.activities[id].costVnd = '12000';
  const valid = projectEditBuffer(buffer, places);
  assert.equal(valid.ok, true);
  assert.equal(valid.trip.people, 3);
  assert.equal(valid.trip.days[1].activities[0].costVnd, 12000);
  assert.equal(valid.trip.days[1].activities[0].id, id);
});

test('moving and deleting activities preserves other raw fields and stable IDs', () => {
  const trip = fixture(),
    buffer = editBuffer(trip),
    activity = trip.days[0].activities[0];
  buffer.activities[activity.id].notes = 'Ghi chú đang sửa';
  buffer.layout = moveActivity(buffer.layout, activity.id, trip.days[1].id);
  buffer.layout = removeActivity(buffer.layout, trip.days[0].activities[1].id);
  const result = projectEditBuffer(buffer, places);
  assert.equal(result.ok, true);
  assert.equal(result.trip.days[0].activities.length, 0);
  assert.equal(result.trip.days[1].activities.at(-1).id, activity.id);
  assert.equal(result.trip.days[1].activities.at(-1).notes, 'Ghi chú đang sửa');
  assert.equal(trip.days[0].activities.length, 2);
});

test('new activity needs a name, and existing disabled catalog locations remain editable', () => {
  const trip = fixture();
  const buffer = appendActivity(editBuffer(trip), trip.days[0].id, 'new-activity');
  assert.equal(projectEditBuffer(buffer, places).ok, false);
  buffer.activities['new-activity'].name = 'Ăn tối';
  buffer.activities['new-activity'].costVnd = '0';
  assert.equal(projectEditBuffer(buffer, places, new Set()).ok, true);
  buffer.activities['new-activity'].kind = 'catalog';
  buffer.activities['new-activity'].placeId = places[0].id;
  assert.equal(projectEditBuffer(buffer, places, new Set()).ok, false);
});

test('budget distinguishes unknown, partial, free and empty without multiplying group costs', () => {
  const trip = fixture();
  assert.equal(budgetPresentation(trip).phase, 'unknown');
  trip.days[0].activities[0].costVnd = 12000;
  let model = budgetPresentation(trip);
  assert.equal(model.phase, 'partial');
  assert.equal(model.summary.knownCostVnd, 12000);
  for (const day of trip.days) for (const activity of day.activities) activity.costVnd = 0;
  model = budgetPresentation(trip);
  assert.equal(model.phase, 'complete');
  assert.equal(model.headline, '0 đ');
  assert.equal(model.knownCount, 4);
  trip.days.forEach((day) => {
    day.activities = [];
  });
  assert.equal(budgetPresentation(trip).phase, 'empty');
});
