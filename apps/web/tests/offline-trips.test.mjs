import test from 'node:test';
import assert from 'node:assert/strict';
import { getDalatCatalog } from '@goease/catalog';
import { generateSampleTrip } from '@goease/itinerary';
import { createAccountTrips } from '@goease/trip-client/account-trip-controller';
import {
  createOfflineTripRequest,
  OFFLINE_TRIPS_KEY,
  OFFLINE_WORKSPACE_OWNER,
} from '@goease/trip-client/offline-trip-controller';
const trip = generateSampleTrip(
  {
    name: 'Dev offline',
    destinationId: 'da-lat',
    startDate: '2099-10-20',
    durationDays: 2,
    people: 2,
    budgetVnd: null,
  },
  getDalatCatalog(),
  { tripId: 'offline-trip', today: '2099-10-20' },
).trip;
const mutationId = '12345678-1234-4234-8234-123456789abc';
const nextId = '22345678-1234-4234-8234-123456789abc';

function fixture() {
  const values = new Map([
    ['goease.guest-trips.v1', 'keep legacy'],
    ['goease.account-workspace.v1.real', 'keep account'],
  ]);
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
  };
  const transaction = async (work) => work(storage);
  return {
    values,
    request: createOfflineTripRequest(transaction, () => '2099-10-20T00:00:00.000Z'),
  };
}

test('local CRUD persists across instances, replays identical writes and enforces versions', async () => {
  const f = fixture();
  const create = { kind: 'create', trip, mutationId };
  assert.equal((await f.request(create)).data.result.version, 1);
  const update = {
    kind: 'update',
    trip: { ...trip, name: 'Đã sửa offline' },
    id: trip.id,
    expectedVersion: 1,
    mutationId: nextId,
  };
  assert.equal((await f.request(update)).data.result.version, 2);
  assert.equal((await f.request(create)).data.replayed, true);
  assert.equal((await f.request({ mutationId, trip, kind: 'create' })).data.replayed, true);
  assert.equal((await f.request({ kind: 'get', id: trip.id })).data.trip.name, 'Đã sửa offline');
  await assert.rejects(
    f.request({ ...update, mutationId: '32345678-1234-4234-8234-123456789abc' }),
    { status: 409 },
  );
  await assert.rejects(f.request({ ...create, trip: { ...trip, name: 'Changed replay' } }), {
    status: 409,
  });
  const restarted = createOfflineTripRequest(async (work) =>
    work({
      getItem: async (key) => f.values.get(key) ?? null,
      setItem: async (key, value) => f.values.set(key, value),
    }),
  );
  assert.equal((await restarted({ kind: 'list' })).data.items[0].name, 'Đã sửa offline');
  const deletion = {
    kind: 'delete',
    id: trip.id,
    expectedVersion: 2,
    mutationId: '42345678-1234-4234-8234-123456789abc',
  };
  await restarted(deletion);
  assert.equal((await restarted(deletion)).data.replayed, true);
  assert.deepEqual((await restarted({ kind: 'list' })).data.items, []);
  assert.equal(f.values.get('goease.guest-trips.v1'), 'keep legacy');
  assert.equal(f.values.get('goease.account-workspace.v1.real'), 'keep account');
});

test('corrupt local data is retained and blocks writes', async () => {
  const f = fixture();
  f.values.set(OFFLINE_TRIPS_KEY, '{broken');
  await assert.rejects(f.request({ kind: 'create', trip, mutationId }));
  assert.equal(f.values.get(OFFLINE_TRIPS_KEY), '{broken');
});

test('workspace restores a draft, saves it locally and can edit after restart', async () => {
  const f = fixture();
  const make = () =>
    createAccountTrips({
      storage: {
        get: async (key) => f.values.get('dev.' + key) ?? null,
        set: async (key, value) => {
          f.values.set('dev.' + key, value);
        },
      },
      newId: () => crypto.randomUUID(),
      request: f.request,
    });
  const first = make();
  await first.activate(OFFLINE_WORKSPACE_OWNER);
  assert.equal(await first.begin(trip), true);
  const second = make();
  await second.activate(OFFLINE_WORKSPACE_OWNER);
  assert.equal(second.getSnapshot().draft.trip.name, trip.name);
  assert.equal(await second.save(), true);
  const third = make();
  await third.activate(OFFLINE_WORKSPACE_OWNER);
  assert.equal(await third.read(trip.id), true);
  await third.begin(third.getSnapshot().selected.trip, third.getSnapshot().selected.version);
  await third.change({ ...trip, name: 'Sửa sau reload' });
  assert.equal(await third.save(), true);
  assert.equal((await f.request({ kind: 'get', id: trip.id })).data.trip.name, 'Sửa sau reload');
});
