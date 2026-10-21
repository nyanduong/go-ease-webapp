import test from 'node:test';
import assert from 'node:assert/strict';
import { initialTripForm } from '@goease/trip-client/create-trip-controller';
import { getDestination } from '@goease/contracts';
import { generateDiscoveredTrip } from '@goease/itinerary';
import { mostRecentlyUpdated } from '../.logic-tests/recent-trip.js';
import { activityPhotos, destinationPhoto, neutralPhoto } from '../.logic-tests/travel-photos.js';
import {
  saveCreation,
  restoreCreation,
  clearCreation,
  FORM_TTL,
  PREVIEW_TTL,
} from '../.logic-tests/creation-cache.js';

test('recent trip uses timestamp, preserves ID cursor list order and deterministic ties', () => {
  const items = Object.freeze([
    { id: 'z', updatedAt: '2026-10-20T02:00:00Z' },
    { id: 'a', updatedAt: '2026-10-21T02:00:00Z' },
    { id: 'b', updatedAt: '2026-10-21T02:00:00Z' },
  ]);
  assert.equal(mostRecentlyUpdated(items).id, 'a');
  assert.deepEqual(
    items.map((item) => item.id),
    ['z', 'a', 'b'],
  );
  assert.equal(mostRecentlyUpdated([]), undefined);
});

test('unknown cities use neutral art; place, matching city, neutral is the failure chain', () => {
  assert.deepEqual(destinationPhoto('dest-ninh-binh'), neutralPhoto);
  assert.deepEqual(destinationPhoto(undefined), neutralPhoto);
  const activity = { name: 'Cầu Rồng', location: { kind: 'manual' } };
  assert.deepEqual(
    activityPhotos(activity, 'ha-noi').map((item) => item.src),
    ['/travel/ha-noi.webp', neutralPhoto.src],
  );
  const discovered = {
    ...activity,
    location: {
      kind: 'discovered',
      placeSnapshot: {
        thumbnailUrl: 'https://example.test/place.jpg',
        sourceUrl: 'https://example.test',
      },
    },
  };
  assert.deepEqual(
    activityPhotos(discovered, 'da-nang').map((item) => item.src),
    ['https://example.test/place.jpg', '/travel/da-nang.webp', neutralPhoto.src],
  );
  assert.deepEqual(
    activityPhotos(discovered, 'unknown').map((item) => item.src),
    ['https://example.test/place.jpg', neutralPhoto.src],
  );
});

const memory = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};
const destination = getDestination('da-nang');
const input = {
  name: 'Cuối tuần',
  startDate: '2099-10-20',
  durationDays: 1,
  people: 2,
  budgetVnd: null,
  destinationId: destination.id,
};
const places = [
  {
    id: 'fixture-dn',
    provider: 'serpapi',
    externalId: 'fixture:1',
    name: 'Điểm thử',
    destinationId: destination.id,
    coordinates: destination.center,
    address: 'Địa chỉ thử',
    category: 'nature',
    rating: null,
    priceLevel: null,
    durationMinutes: 60,
    durationBasis: 'estimate',
    sourceUrl: 'https://www.google.com/maps?cid=1',
    fetchedAt: '2026-10-20T12:00:00Z',
  },
];
const result = generateDiscoveredTrip(input, places, {
  tripId: 'test-preview',
  today: input.startDate,
  destination,
});
const state = {
  form: {
    ...initialTripForm(new Date('2099-10-20')),
    name: 'Chưa nhập xong',
    durationDays: '',
    destinationId: 'da-nang',
  },
  pace: 'balanced',
  interests: ['nature'],
  preview: { apiVersion: '1', destination, source: 'serpapi', places: [], result },
  previewAt: 1000,
  reviewing: true,
};

test('temporary form and preview survive reload, stay owner scoped, and expire independently', () => {
  assert.equal(result.ok, true);
  const storage = memory();
  assert.equal(saveCreation(storage, 'project.account-A', state, 1000), true);
  assert.deepEqual(restoreCreation(storage, 'project.account-A', 1001), state);
  assert.equal(restoreCreation(storage, 'project.account-B', 1001), null);
  const stale = restoreCreation(storage, 'project.account-A', 1000 + PREVIEW_TTL);
  assert.equal(stale.preview, null);
  assert.equal(stale.reviewing, false);
  assert.equal(stale.form.durationDays, '');
  assert.equal(restoreCreation(storage, 'project.account-A', 1000 + FORM_TTL), null);
  clearCreation(storage, 'project.account-A');
  assert.equal(restoreCreation(storage, 'project.account-A', 1001), null);
  const editorial = { ...state, contentId: 'editorial-destination' };
  saveCreation(storage, 'project.account-A', editorial, 1000);
  assert.deepEqual(restoreCreation(storage, 'project.account-A', 1001), editorial);
});

test('malformed or blocked temporary storage fails safely without deleting account data', () => {
  const storage = memory();
  saveCreation(storage, 'A', { ...state, pace: 'invented' }, 1000);
  assert.equal(restoreCreation(storage, 'A', 1001), null);
  const blocked = {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
    removeItem() {
      throw Error();
    },
  };
  assert.equal(saveCreation(blocked, 'A', state), false);
  assert.equal(restoreCreation(blocked, 'A'), null);
  assert.doesNotThrow(() => clearCreation(blocked, 'A'));
});
