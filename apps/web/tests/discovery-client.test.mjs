import test from 'node:test';
import assert from 'node:assert/strict';
import { getDestination } from '@goease/contracts';
import { generateDiscoveredTrip } from '@goease/itinerary';
import { initialTripForm, validateTripForm } from '@goease/trip-client/create-trip-controller';
import {
  callDiscoveryApi,
  callDestinationSearchApi,
} from '@goease/trip-client/discovery-api-controller';
import { createAuthPilot } from '@goease/trip-client/auth-pilot-controller';
import { projectDayMap } from '@goease/trip-client/map-controller';
import { notesAfterPlaceChange } from '@goease/trip-client/edit-trip-controller';
import { editBuffer, projectEditBuffer } from '../.logic-tests/edit-buffer.js';

const destination = getDestination('da-nang');
const input = {
  name: 'Đà Nẵng cùng bạn',
  destinationId: destination.id,
  startDate: '2099-10-20',
  durationDays: 1,
  people: 3,
  budgetVnd: null,
};
const places = [0, 1, 2].map((index) => ({
  id: `fixture-dn-${index}`,
  provider: 'serpapi',
  externalId: `fixture:${index}`,
  name: `Điểm thử ${index}`,
  destinationId: destination.id,
  coordinates: {
    latitude: destination.center.latitude + index * 0.004,
    longitude: destination.center.longitude,
  },
  address: 'Địa chỉ thử nghiệm',
  category: 'nature',
  rating: null,
  priceLevel: null,
  durationMinutes: 60,
  durationBasis: 'estimate',
  sourceUrl: 'https://www.google.com/maps?cid=' + index,
  fetchedAt: '2026-10-20T12:00:00Z',
}));
const generated = generateDiscoveredTrip(input, places, {
  tripId: 'fixture-discovery',
  today: '2099-10-20',
});
assert.equal(generated.ok, true);
const payload = { apiVersion: '1', destination, source: 'serpapi', places, result: generated };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const ninhBinh = {
  id: 'dest-ninh-binh-fixture',
  name: 'Ninh Bình',
  countryCode: 'VN',
  timeZone: 'Asia/Ho_Chi_Minh',
  currency: 'VND',
  center: { latitude: 20.2506, longitude: 105.9745 },
  radiusKm: 25,
  address: 'Ninh Bình, Việt Nam',
  selectionToken: 'a'.repeat(43),
  source: {
    provider: 'serpapi',
    externalId: 'ninhBinh-fixture',
    sourceUrl: 'https://www.google.com/maps?cid=ninhBinh',
    fetchedAt: '2026-10-20T12:00:00Z',
  },
};

test('destination form preserves chosen city, validates unknown IDs and keeps legacy default', () => {
  const form = {
    ...initialTripForm(new Date('2099-10-20T03:00:00Z')),
    name: 'Cuối tuần',
    destinationId: 'da-nang',
  };
  const parsed = validateTripForm(form, '2099-10-20');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.input.destinationId, 'da-nang');
  assert.equal(
    validateTripForm({ ...form, destinationId: 'invented-city' }, '2099-10-20').ok,
    false,
  );
  const legacy = { ...form };
  delete legacy.destinationId;
  assert.equal(validateTripForm(legacy, '2099-10-20').input.destinationId, 'da-lat');
});

test('form accepts a selected destination outside the popular list and keeps its complete signed snapshot', () => {
  const form = {
    ...initialTripForm(new Date('2099-10-20T03:00:00Z')),
    name: 'Ninh Bình cùng bạn',
    destinationId: ninhBinh.id,
    destination: ninhBinh,
  };
  const result = validateTripForm(form, '2099-10-20');
  assert.equal(result.ok, true);
  assert.deepEqual(result.input.destination, ninhBinh);
  assert.equal(result.input.destination.timeZone, 'Asia/Ho_Chi_Minh');
  assert.equal(result.input.destination.currency, 'VND');
  assert.equal(validateTripForm({ ...form, destinationId: 'dest-other' }, '2099-10-20').ok, false);
  assert.equal(
    validateTripForm({ ...form, destinationId: '', destination: undefined }, '2099-10-20').ok,
    false,
  );
  assert.equal(
    validateTripForm(form, '2099-10-21').ok,
    false,
    'destination-local date is enforced',
  );
});

test('destination search is an authenticated bounded GET and preserves arbitrary Vietnamese destinations', async () => {
  const calls = [];
  const result = await callDestinationSearchApi(
    'https://api.goease.test',
    'access.token.signature',
    ' Ninh Bình & Việt Nam ',
    {
      fetcher: async (url, init) => {
        calls.push({ url, init });
        return response({ apiVersion: '1', destinations: [ninhBinh], source: 'serpapi' });
      },
    },
  );
  assert.deepEqual(result.destinations, [ninhBinh]);
  assert.equal(
    calls[0].url,
    'https://api.goease.test/v1/destinations?q=' + encodeURIComponent('Ninh Bình & Việt Nam'),
  );
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.headers.authorization, 'Bearer access.token.signature');
  await assert.rejects(
    callDestinationSearchApi('https://api.goease.test', 'access.token.signature', 'x', {
      fetcher: async () => {
        throw Error('must not call');
      },
    }),
    (error) => error.code === 'INVALID',
  );
  await assert.rejects(
    callDestinationSearchApi(
      'https://api.goease.test/other',
      'access.token.signature',
      'Ninh Bình',
    ),
    (error) => error.code === 'CONFIG',
  );
  await assert.rejects(
    callDestinationSearchApi('https://api.goease.test', 'access.token.signature', 'Ninh Bình', {
      fetcher: async () =>
        response({ apiVersion: '1', destinations: [{ ...ninhBinh, timeZone: 'invented/zone' }] }),
    }),
    (error) => error.code === 'OUTPUT_INVALID',
  );
  await assert.rejects(
    callDestinationSearchApi('https://api.goease.test', 'access.token.signature', 'Ninh Bình', {
      fetcher: async () =>
        response(
          {
            apiVersion: '1',
            statusCode: 401,
            error: {
              code: 'AUTH_INVALID',
              message: 'Cần đăng nhập.',
              requestId: '12345678-1234-4234-8234-123456789abc',
            },
          },
          401,
        ),
    }),
    (error) => error.code === 'AUTH_INVALID' && error.status === 401,
  );
});

test('new trip forms and fresh search results reject foreign or unknown-country selections', async () => {
  for (const countryCode of ['JP', null]) {
    const foreign = {
      ...ninhBinh,
      id: 'dest-tokyo-fixture',
      name: 'Tokyo',
      countryCode,
      timeZone: 'Asia/Tokyo',
      center: { latitude: 35.6764, longitude: 139.65 },
      address: 'Tokyo, Japan',
    };
    const result = validateTripForm(
      {
        ...initialTripForm(new Date('2099-10-20T03:00:00Z')),
        name: 'Chuyến mới',
        destinationId: foreign.id,
        destination: foreign,
      },
      '2099-10-20',
    );
    assert.equal(result.ok, false);
    assert.match(result.errors.destinationId, /Việt Nam/);
    await assert.rejects(
      callDestinationSearchApi('https://api.goease.test', 'access.token.signature', 'Tokyo', {
        fetcher: async () =>
          response({ apiVersion: '1', destinations: [foreign], source: 'serpapi' }),
      }),
      (error) => error.code === 'OUTPUT_INVALID',
    );
  }
  await assert.rejects(
    callDestinationSearchApi('https://api.goease.test', 'access.token.signature', 'Tokyo', {
      fetcher: async () =>
        response(
          {
            apiVersion: '1',
            statusCode: 422,
            error: {
              code: 'DISCOVERY_NO_RESULTS',
              message: 'Chưa tìm thấy điểm đến tại Việt Nam.',
              requestId: '12345678-1234-4234-8234-123456789abc',
            },
          },
          422,
        ),
    }),
    (error) =>
      error.code === 'DISCOVERY_NO_RESULTS' &&
      error.status === 422 &&
      /Việt Nam/.test(error.message),
  );
});

test('discovery sends auth only to configured GoEase origin and rejects invalid/mismatched output', async () => {
  const calls = [];
  const result = await callDiscoveryApi(
    'https://api.goease.test',
    'access.token.signature',
    { input },
    {
      fetcher: async (url, init) => {
        calls.push({ url, init });
        return response(payload);
      },
    },
  );
  assert.equal(result.result.trip.destinationId, 'da-nang');
  assert.equal(calls[0].url, 'https://api.goease.test/v1/discovery/preview');
  assert.equal(calls[0].init.headers.authorization, 'Bearer access.token.signature');
  assert.equal(JSON.stringify(calls).includes('api_key'), false);
  await assert.rejects(
    callDiscoveryApi('http://192.168.1.5:3000', 'access.token.signature', { input }),
    /cấu hình/,
  );
  await assert.rejects(
    callDiscoveryApi(
      'https://api.goease.test',
      'access.token.signature',
      { input },
      {
        fetcher: async () => response({ ...payload, destination: getDestination('ha-noi') }),
      },
    ),
    (error) => error.code === 'OUTPUT_INVALID',
  );
  await assert.rejects(
    callDiscoveryApi(
      'https://api.goease.test',
      'access.token.signature',
      { input },
      {
        fetcher: async () => response({ result: {} }),
      },
    ),
    /chưa hợp lệ/,
  );
});

test('discovery unavailable remains a typed failure and cancellation cannot become a successful preview', async () => {
  await assert.rejects(
    callDiscoveryApi(
      'https://api.goease.test',
      'access.token.signature',
      { input },
      {
        fetcher: async () =>
          response(
            {
              apiVersion: '1',
              statusCode: 503,
              error: {
                code: 'DISCOVERY_NOT_CONFIGURED',
                message: 'Chưa cấu hình nguồn địa điểm.',
                requestId: '12345678-1234-4234-8234-123456789abc',
              },
            },
            503,
          ),
      },
    ),
    (error) => error.code === 'DISCOVERY_NOT_CONFIGURED' && error.status === 503,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    callDiscoveryApi(
      'https://api.goease.test',
      'access.token.signature',
      { input },
      {
        signal: controller.signal,
        fetcher: async (_url, init) => {
          init.signal.throwIfAborted();
          return response(payload);
        },
      },
    ),
    (error) => error.code === 'CANCELLED',
  );
});

test('discovered snapshots survive raw edits, reorder and reopening without a live catalog', () => {
  const trip = generated.trip;
  const buffer = editBuffer(trip),
    activity = trip.days[0].activities[0];
  buffer.activities[activity.id].notes = 'Nhớ mang nước';
  buffer.activities[activity.id].costVnd = '120000';
  const edited = projectEditBuffer(buffer, [], new Set());
  assert.equal(edited.ok, true);
  assert.deepEqual(edited.trip.days[0].activities[0].location, activity.location);
  assert.equal(edited.trip.days[0].activities[0].costVnd, 120000);
  assert.equal(trip.days[0].activities[0].costVnd, null);
  const reopened = JSON.parse(JSON.stringify(edited.trip));
  const map = projectDayMap(reopened, reopened.days[0].id, []);
  assert.equal(map.pins.length, reopened.days[0].activities.length);
  assert.equal(map.unlocated.length, 0);
  assert.equal(
    map.pins[0].coordinates.latitude,
    activity.location.placeSnapshot.coordinates.latitude,
  );
});

test('replacing a place clears generated route facts while preserving personal notes', () => {
  const notes = generated.trip.days[0].activities[0].notes;
  assert.match(notes, /Di chuyển ước tính/);
  const changed = notesAfterPlaceChange(notes);
  assert.doesNotMatch(changed, /Di chuyển ước tính|km đường chim bay|Tham quan ước tính/);
  assert.match(changed, /Đã thay địa điểm/);
  assert.equal(notesAfterPlaceChange('Nhớ mang nước và áo khoác'), 'Nhớ mang nước và áo khoác');
  assert.equal(notesAfterPlaceChange(notes + '\nNhớ mua quà'), changed + '\nNhớ mua quà');
  assert.equal(notesAfterPlaceChange(changed), changed);
  assert.equal(
    notesAfterPlaceChange('Tham quan ước tính 90 phút. Lời nhắc của nhóm'),
    'Tham quan ước tính 90 phút. Lời nhắc của nhóm',
  );
});

test('auth discovery requires verified account and drops late response after session cancellation', async () => {
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  const id = '12345678-1234-4234-8234-123456789abc';
  const auth = createAuthPilot({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    key: 'sb_publishable_offline_fixture_00000000',
    now: () => 1800000000000,
    requiredProvider: 'google',
    storage: { get: async () => null, set: async () => {}, remove: async () => {} },
    fetcher: async (url) => {
      if (url.endsWith('/auth/v1/user'))
        return response({
          id,
          aud: 'authenticated',
          role: 'authenticated',
          identities: [{ provider: 'google' }],
        });
      if (url.endsWith('/v1/auth/me'))
        return response({ apiVersion: '1', identity: { id, provider: 'supabase' } });
      await delayed;
      return response(payload);
    },
  });
  await assert.rejects(auth.discoveryPreview({ input }), (error) => error.code === 'AUTH_REQUIRED');
  await auth.acceptOAuth({
    token_type: 'bearer',
    access_token: 'access.token.signature',
    refresh_token: 'fixture_refresh_token',
    expires_in: 3600,
    expires_at: 1800003600,
  });
  await auth.verifyBackend('https://api.goease.test');
  const pending = auth.discoveryPreview({ input });
  auth.cancel();
  release();
  await assert.rejects(pending, (error) => error.code === 'CANCELLED');
  assert.equal(auth.snapshot().userId, null);
});

test('destination search drops late responses after account cancellation and rejects unauthenticated calls', async () => {
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  const id = '12345678-1234-4234-8234-123456789abc';
  const auth = createAuthPilot({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    key: 'sb_publishable_offline_fixture_00000000',
    now: () => 1800000000000,
    requiredProvider: 'google',
    storage: { get: async () => null, set: async () => {}, remove: async () => {} },
    fetcher: async (url) => {
      if (url.endsWith('/auth/v1/user'))
        return response({
          id,
          aud: 'authenticated',
          role: 'authenticated',
          identities: [{ provider: 'google' }],
        });
      if (url.endsWith('/v1/auth/me'))
        return response({ apiVersion: '1', identity: { id, provider: 'supabase' } });
      await delayed;
      return response({ apiVersion: '1', destinations: [ninhBinh] });
    },
  });
  await assert.rejects(
    auth.searchDestinations('Ninh Bình'),
    (error) => error.code === 'AUTH_REQUIRED',
  );
  await auth.acceptOAuth({
    token_type: 'bearer',
    access_token: 'access.token.signature',
    refresh_token: 'fixture_refresh_token',
    expires_in: 3600,
    expires_at: 1800003600,
  });
  await auth.verifyBackend('https://api.goease.test');
  const pending = auth.searchDestinations('Ninh Bình');
  auth.cancel();
  release();
  await assert.rejects(pending, (error) => error.code === 'CANCELLED');
  assert.equal(auth.snapshot().userId, null);
});
