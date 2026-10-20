import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createApi } from '../dist/bootstrap.js';
import { readConfig } from '../dist/config/env.js';
import { DiscoveryService } from '../dist/modules/discovery/discovery.service.js';
import { normalizePlaces } from '../dist/modules/discovery/normalize-places.js';
import {
  discoveryPlacesResponseSchema,
  discoveryPreviewResponseSchema,
  apiErrorResponseSchema,
  getDestination,
} from '@goease/contracts';

const NOW = new Date('2026-10-20T03:00:00.000Z');
const USER = 'b5aa7f8a-1711-4c09-b432-bcf075c57b5f';
const AUTH_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const SECRET = 'offline_serpapi_DO_NOT_LEAK_1234567890';
const env = {
  AUTH_ENABLED: 'true',
  AUTH_GOOGLE_ONLY: 'false',
  SUPABASE_AUTH_URL: AUTH_URL,
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_offline_fixture_00000000',
  API_REQUEST_TIMEOUT_MS: '20000',
  AUTH_TIMEOUT_MS: '100',
  SERPAPI_ENABLED: 'true',
  SERPAPI_API_KEY: SECRET,
  SERPAPI_MAX_ATTEMPTS_PER_MINUTE: '30',
  SERPAPI_MAX_ATTEMPTS_PER_USER_DAY: '100',
  SERPAPI_MAX_ATTEMPTS_PER_DAY: '100',
  SERPAPI_MAX_TOTAL_ATTEMPTS: '100',
};
function token() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'ES256' })}.${encode({ sub: USER, iss: `${AUTH_URL}/auth/v1`, aud: 'authenticated', role: 'authenticated', exp: NOW.getTime() / 1000 + 3600, iat: NOW.getTime() / 1000 })}.offline_signature_not_valid`;
}
const rawPlace = (index = 0, patch = {}) => ({
  place_id: `offline-place-${index}`,
  title: `Bảo tàng ${index}`,
  gps_coordinates: { latitude: 16.0544 + index * 0.002, longitude: 108.2022 + index * 0.002 },
  address: 'Đà Nẵng, Việt Nam',
  rating: 4.6,
  type: 'Museum',
  price: '$$',
  ...patch,
});
const payload = (count = 12) => ({
  local_results: Array.from({ length: count }, (_, index) => rawPlace(index)),
});
const weeklyHours = (value) =>
  Object.fromEntries(
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => [
      day,
      value,
    ]),
  );
const requestBody = { destinationId: 'da-nang' };
const tripInput = {
  name: 'Khám phá Đà Nẵng',
  destinationId: 'da-nang',
  startDate: '2026-10-21',
  durationDays: 3,
  people: 2,
  budgetVnd: 5000000,
};
const provider = async () => Response.json(payload());
async function service(run, patch = {}, fetcher = provider) {
  const directory = await mkdtemp(join(tmpdir(), 'goease-discovery-'));
  const instance = new DiscoveryService(
    readConfig({ ...env, ...patch, SERPAPI_STATE_DIR: directory }),
    { fetcher, now: () => new Date(NOW) },
  );
  try {
    await run(instance, directory);
  } finally {
    await instance.onModuleDestroy();
    await rm(directory, { recursive: true, force: true });
  }
}
async function api(run, patch = {}, fetcher = provider) {
  const directory = await mkdtemp(join(tmpdir(), 'goease-discovery-http-'));
  const { app } = await createApi(
    { ...env, ...patch, SERPAPI_STATE_DIR: directory },
    undefined,
    {},
    {
      now: () => NOW.getTime(),
      fetcher: async () => Response.json({ id: USER, aud: 'authenticated', role: 'authenticated' }),
    },
    {},
    { now: () => new Date(NOW), fetcher },
  );
  try {
    await app.listen(0, '127.0.0.1');
    await run(await app.getUrl());
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
}
const post = (base, path, body, authorized = true) =>
  fetch(`${base}/v1/discovery/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorized ? { authorization: `Bearer ${token()}` } : {}),
    },
    body: JSON.stringify(body),
  });
const signal = () => new AbortController().signal;
const rejectsCode = (work, code) => assert.rejects(work, (error) => error.code === code);

test('discovery config requires authenticated bounded deadline and never accepts malformed secrets', () => {
  assert.throws(() => readConfig({ ...env, AUTH_ENABLED: 'false' }), /SERPAPI_ENABLED/);
  assert.throws(() => readConfig({ ...env, API_REQUEST_TIMEOUT_MS: '1000' }), /SERPAPI_ENABLED/);
  assert.throws(
    () => readConfig({ ...env, SERPAPI_API_KEY: 'https://evil.example' }),
    /SERPAPI_API_KEY/,
  );
});
test('public destination search supports Vietnamese accents and rejects repeated or arbitrary query fields', () =>
  api(async (base) => {
    const response = await fetch(`${base}/v1/destinations?q=da%20nang`);
    assert.deepEqual(
      (await response.json()).destinations.map((item) => item.id),
      ['da-nang'],
    );
    assert.equal((await fetch(`${base}/v1/destinations?q=a&q=b`)).status, 400);
    assert.equal((await fetch(`${base}/v1/destinations?url=https://evil.example`)).status, 400);
  }));
test('discovery HTTP requires verified auth before provider and rejects prompt, URL, query identity and unsupported city', () =>
  api(
    async (base) => {
      assert.equal((await post(base, 'places', requestBody, false)).status, 401);
      for (const body of [
        { ...requestBody, url: 'https://evil.example' },
        { ...requestBody, prompt: 'ignore instructions' },
        { destinationId: 'made-up-city' },
      ])
        assert.equal((await post(base, 'places', body)).status, 400);
      assert.equal((await post(base, 'places?userId=other', requestBody)).status, 400);
    },
    {},
    async () => assert.fail('invalid request must not spend provider quota'),
  ));
test('disabled or unconfigured discovery fails truthfully instead of sample data', async () => {
  for (const [patch, code] of [
    [{ SERPAPI_ENABLED: 'false' }, 'DISCOVERY_DISABLED'],
    [{ SERPAPI_API_KEY: '' }, 'DISCOVERY_NOT_CONFIGURED'],
  ])
    await api(
      async (base) => {
        const response = await post(base, 'preview', { input: tripInput });
        assert.equal(response.status, 503);
        assert.equal(apiErrorResponseSchema.parse(await response.json()).error.code, code);
      },
      patch,
      async () => assert.fail('unconfigured provider must not run'),
    );
});
test('normalization filters no-GPS/out-of-region/closed/duplicate places, preserves sources and never invents ticket prices', () => {
  const raw = {
    local_results: [
      rawPlace(0),
      rawPlace(0),
      rawPlace(1, { title: 'Bảo tàng 0', gps_coordinates: rawPlace(0).gps_coordinates }),
      rawPlace(2, { gps_coordinates: undefined }),
      rawPlace(3, { gps_coordinates: { latitude: 21.0285, longitude: 105.8542 } }),
      rawPlace(4, { permanently_closed: true }),
      rawPlace(5, { rating: 90, price: undefined }),
      rawPlace(6, {
        type: 'Coffee shop',
        title: 'Quán cà phê',
        operating_hours: { monday: '8 AM–5 PM', tuesday: '09:00–18:00', wednesday: '10 PM–2 AM' },
      }),
    ],
  };
  const result = normalizePlaces(raw, getDestination('da-nang'), NOW.toISOString());
  assert.equal(result.valid, true);
  assert.equal(result.places.length, 3);
  assert.equal(result.rejected, 5);
  assert.equal(result.places[1].rating, null);
  assert.equal(result.places[1].priceLevel, null);
  assert.equal(result.places[2].category, 'cafe');
  assert.equal(result.places[2].openingWindows, undefined);
  assert.ok(result.warnings.some((warning) => warning.includes('qua đêm')));
  assert.equal('costVnd' in result.places[0], false);
  assert.equal(result.places[0].priceLevel, '$$');
  assert.match(result.places[0].sourceUrl, /^https:\/\/www.google.com\/maps\/search\//);
  assert.equal(JSON.stringify(result).includes(SECRET), false);
});
test('fixed SerpApi search returns schema-valid city data and cache reuse costs zero extra calls across users', () => {
  let calls = 0;
  return service(
    async (instance, directory) => {
      const first = discoveryPlacesResponseSchema.parse(
        await instance.places(
          { ...requestBody, interests: ['nature', 'cafe', 'nature'] },
          USER,
          signal(),
        ),
      );
      assert.equal(first.source, 'serpapi');
      assert.equal(first.metadata.providerRequests, 1);
      const second = discoveryPlacesResponseSchema.parse(
        await instance.places(
          { ...requestBody, interests: ['cafe', 'nature'] },
          'other-user',
          signal(),
        ),
      );
      assert.equal(second.source, 'cache');
      assert.equal(second.metadata.providerRequests, 0);
      assert.equal(second.metadata.cacheHit, true);
      assert.equal(calls, 1);
      const state = await readFile(join(directory, 'quota.json'), 'utf8');
      assert.equal(state.includes(USER), false);
      assert.equal(JSON.parse(state).total, 1);
    },
    {},
    async (url, options) => {
      calls++;
      const parsed = new URL(url);
      assert.equal(parsed.origin + parsed.pathname, 'https://serpapi.com/search.json');
      assert.equal(parsed.searchParams.get('engine'), 'google_maps');
      assert.equal(parsed.searchParams.get('type'), 'search');
      assert.equal(parsed.searchParams.get('api_key'), SECRET);
      assert.match(parsed.searchParams.get('q'), /Đà Nẵng Việt Nam/);
      assert.equal(parsed.searchParams.has('no_cache'), false);
      assert.equal(options.redirect, 'error');
      assert.equal(options.method, 'GET');
      return Response.json(payload());
    },
  );
});
test('HTTP preview schedules only grounded snapshots, carries source diagnostics, leaves all unverified costs null', () =>
  api(async (base) => {
    const response = await post(base, 'preview', { input: tripInput, interests: ['heritage'] });
    assert.equal(response.status, 200);
    const body = discoveryPreviewResponseSchema.parse(await response.json());
    assert.equal(body.result.trip.destinationId, 'da-nang');
    assert.equal(body.result.trip.generationSource, 'discovery');
    const activities = body.result.trip.days.flatMap((day) => day.activities);
    assert.ok(activities.length > 0);
    assert.equal(
      new Set(activities.map((activity) => activity.location.placeId)).size,
      activities.length,
    );
    assert.ok(
      activities.every(
        (activity) =>
          activity.costVnd === null &&
          activity.location.kind === 'discovered' &&
          body.places.some((place) => place.id === activity.location.placeId),
      ),
    );
    assert.ok(body.result.warnings.length);
    assert.equal(body.metadata.providerRequests, 1);
    assert.equal(body.metadata.missingPrices, body.places.length);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }));
test('past start date is rejected before charged discovery', () =>
  service(
    async (instance) =>
      rejectsCode(
        instance.preview({ input: { ...tripInput, startDate: '2026-10-19' } }, USER, signal()),
        'BAD_REQUEST',
      ),
    {},
    async () => assert.fail('past date must not spend quota'),
  ));
test('provider errors and malformed/oversized responses are normalized and never expose key or upstream text', async () => {
  for (const [fetcher, code] of [
    [
      async () => new Response(`DO_NOT_LEAK ${SECRET}`, { status: 403 }),
      'DISCOVERY_UPSTREAM_DENIED',
    ],
    [async () => new Response(`DO_NOT_LEAK ${SECRET}`, { status: 429 }), 'DISCOVERY_RATE_LIMITED'],
    [
      async () => Response.json({ error: `DO_NOT_LEAK ${SECRET}` }),
      'DISCOVERY_UPSTREAM_UNAVAILABLE',
    ],
    [async () => new Response('not json'), 'DISCOVERY_OUTPUT_INVALID'],
    [async () => new Response(' '.repeat(2 * 1024 * 1024 + 1)), 'DISCOVERY_OUTPUT_INVALID'],
    [async () => Response.json({ local_results: [] }), 'DISCOVERY_NO_RESULTS'],
    [
      async () => Response.json({ local_results: [{ title: 'Missing GPS' }] }),
      'DISCOVERY_NO_RESULTS',
    ],
    [async () => Response.json({ nonsense: [] }), 'DISCOVERY_OUTPUT_INVALID'],
  ])
    await service(
      async (instance, directory) => {
        await assert.rejects(instance.places(requestBody, USER, signal()), (error) => {
          assert.equal(error.code, code);
          assert.equal(error.message.includes(SECRET), false);
          return true;
        });
        assert.equal(JSON.parse(await readFile(join(directory, 'quota.json'), 'utf8')).total, 1);
      },
      {},
      fetcher,
    );
});
test('per-user and global daily quotas persist across service restarts; cache hits are uncharged', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goease-discovery-persist-'));
  const config = readConfig({
    ...env,
    SERPAPI_STATE_DIR: directory,
    SERPAPI_MAX_ATTEMPTS_PER_USER_DAY: '1',
    SERPAPI_MAX_ATTEMPTS_PER_DAY: '2',
    SERPAPI_MAX_TOTAL_ATTEMPTS: '2',
  });
  let instance = new DiscoveryService(config, { fetcher: provider, now: () => new Date(NOW) });
  try {
    await instance.places(requestBody, USER, signal());
    await instance.places(requestBody, USER, signal());
    await rejectsCode(
      instance.places({ ...requestBody, interests: ['nature'] }, USER, signal()),
      'DISCOVERY_BUDGET_EXCEEDED',
    );
    await instance.places({ ...requestBody, interests: ['nature'] }, 'second-user', signal());
    await instance.onModuleDestroy();
    instance = new DiscoveryService(config, {
      fetcher: async () => assert.fail('persistent quota must prevent request'),
      now: () => new Date(NOW),
    });
    await rejectsCode(
      instance.places(requestBody, 'third-user', signal()),
      'DISCOVERY_BUDGET_EXCEEDED',
    );
  } finally {
    await instance.onModuleDestroy();
    await rm(directory, { recursive: true, force: true });
  }
});
test('provider minute limit prevents new calls and corrupt persistent guard fails closed', async () => {
  await service(
    async (instance) => {
      await instance.places(requestBody, USER, signal());
      await rejectsCode(
        instance.places({ ...requestBody, interests: ['garden'] }, USER, signal()),
        'DISCOVERY_RATE_LIMITED',
      );
    },
    { SERPAPI_MAX_ATTEMPTS_PER_MINUTE: '1' },
  );
  const directory = await mkdtemp(join(tmpdir(), 'goease-discovery-guard-'));
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(directory, 'quota.json'), '{broken');
  const instance = new DiscoveryService(readConfig({ ...env, SERPAPI_STATE_DIR: directory }), {
    fetcher: async () => assert.fail('corrupt guard must not call provider'),
    now: () => new Date(NOW),
  });
  try {
    await rejectsCode(instance.places(requestBody, USER, signal()), 'DISCOVERY_GUARD_UNAVAILABLE');
  } finally {
    await instance.onModuleDestroy();
    await rm(directory, { recursive: true, force: true });
  }
});
test('uncached concurrency is bounded and timeout interrupts an uncooperative provider without automatic retry', async () => {
  let calls = 0;
  await service(
    async (instance) => {
      const first = instance.places(requestBody, USER, signal());
      await rejectsCode(
        instance.places({ ...requestBody, interests: ['nature'] }, USER, signal()),
        'DISCOVERY_BUSY',
      );
      await rejectsCode(first, 'REQUEST_TIMEOUT');
      assert.equal(calls, 1);
    },
    { SERPAPI_TIMEOUT_MS: '100' },
    async () => {
      calls++;
      return new Promise(() => {});
    },
  );
});
test('cancelled requests never spend quota or call provider', () =>
  service(
    async (instance) => {
      const controller = new AbortController();
      controller.abort();
      await rejectsCode(
        instance.places(requestBody, USER, controller.signal),
        'DISCOVERY_CANCELLED',
      );
    },
    {},
    async () => assert.fail('cancelled request must not reach provider'),
  ));

test('cache expiry and a different destination require new source data, without leaking one city into another', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goease-discovery-expiry-'));
  let now = new Date(NOW),
    calls = 0;
  const instance = new DiscoveryService(
    readConfig({ ...env, SERPAPI_STATE_DIR: directory, SERPAPI_CACHE_TTL_MS: '60000' }),
    {
      now: () => new Date(now),
      fetcher: async (url) => {
        calls++;
        const city = new URL(url).searchParams.get('q').includes('Hà Nội')
          ? getDestination('ha-noi')
          : getDestination('da-nang');
        return Response.json({
          local_results: [
            rawPlace(0, { title: `Điểm tham quan ${city.name}`, gps_coordinates: city.center }),
          ],
        });
      },
    },
  );
  try {
    const first = await instance.places(requestBody, USER, signal());
    now = new Date(NOW.getTime() + 59000);
    assert.equal((await instance.places(requestBody, USER, signal())).source, 'cache');
    now = new Date(NOW.getTime() + 61000);
    const refreshed = await instance.places(requestBody, USER, signal());
    assert.equal(refreshed.source, 'serpapi');
    assert.notEqual(first.metadata.fetchedAt, refreshed.metadata.fetchedAt);
    const otherCity = await instance.places({ destinationId: 'ha-noi' }, USER, signal());
    assert.equal(otherCity.places[0].destinationId, 'ha-noi');
    assert.match(otherCity.places[0].name, /Hà Nội/);
    assert.equal(calls, 3);
  } finally {
    await instance.onModuleDestroy();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a second process cannot spend through an already owned quota directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goease-discovery-owner-'));
  const config = readConfig({ ...env, SERPAPI_STATE_DIR: directory });
  const first = new DiscoveryService(config, { now: () => new Date(NOW), fetcher: provider });
  const second = new DiscoveryService(config, {
    now: () => new Date(NOW),
    fetcher: async () => assert.fail('another guard owner must not spend'),
  });
  try {
    await first.places(requestBody, USER, signal());
    await rejectsCode(second.places(requestBody, USER, signal()), 'DISCOVERY_GUARD_UNAVAILABLE');
  } finally {
    await first.onModuleDestroy();
    await second.onModuleDestroy();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a verified dead PID lock is recovered without resetting charged totals, while legacy locks stay closed', async () => {
  const child = spawn(process.execPath, ['-e', ''], { windowsHide: true });
  const deadPid = child.pid;
  await once(child, 'exit');
  const directory = await mkdtemp(join(tmpdir(), 'goease-discovery-dead-owner-'));
  const config = readConfig({
    ...env,
    SERPAPI_STATE_DIR: directory,
    SERPAPI_MAX_TOTAL_ATTEMPTS: '1',
  });
  let instance = new DiscoveryService(config, { now: () => new Date(NOW), fetcher: provider });
  try {
    await instance.places(requestBody, USER, signal());
    await instance.onModuleDestroy();
    await writeFile(
      join(directory, 'quota.lock'),
      JSON.stringify({ version: 1, pid: deadPid, nonce: randomUUID() }),
    );
    instance = new DiscoveryService(config, {
      now: () => new Date(NOW),
      fetcher: async () => assert.fail('stale recovery must keep spent quota'),
    });
    await rejectsCode(instance.places(requestBody, USER, signal()), 'DISCOVERY_BUDGET_EXCEEDED');
    assert.equal(JSON.parse(await readFile(join(directory, 'quota.json'), 'utf8')).total, 1);
    await instance.onModuleDestroy();
    await writeFile(join(directory, 'quota.lock'), '');
    instance = new DiscoveryService(config, { now: () => new Date(NOW), fetcher: provider });
    await rejectsCode(instance.places(requestBody, USER, signal()), 'DISCOVERY_GUARD_UNAVAILABLE');
  } finally {
    await instance.onModuleDestroy();
    await rm(directory, { recursive: true, force: true });
  }
});

test('known closed schedules stay closed and old quarter titles are not mistaken for phở restaurants', () => {
  const normalized = normalizePlaces(
    {
      local_results: [
        rawPlace(0, {
          title: 'Phố cổ',
          type: 'Historical landmark',
          operating_hours: { ...weeklyHours('Closed'), tuesday: 'Đóng cửa' },
        }),
        rawPlace(1, {
          title: 'Công viên',
          type: 'Park',
          operating_hours: weeklyHours('Open 24 hours'),
        }),
        rawPlace(2, { open_state: 'Permanently closed' }),
      ],
    },
    getDestination('da-nang'),
    NOW.toISOString(),
  );
  assert.equal(normalized.places.length, 2);
  assert.equal(normalized.places[0].category, 'heritage');
  assert.deepEqual(normalized.places[0].openingWindows, []);
  assert.equal(normalized.places[1].openingWindows.length, 7);
  assert.deepEqual(normalized.places[1].openingWindows[0], {
    dayOfWeek: 1,
    startTime: '00:00',
    endTime: '23:59',
  });
});

test('complete Vietnamese provider hours respect all weekdays, split intervals, closed days and full-day opening', () => {
  const vietnamese = {
    'thứ ba': '08:00–17:00',
    'thứ tư': '08:00–17:00',
    'thứ năm': '08:00–17:00',
    'thứ sáu': '08:00–17:00',
    'thứ bảy': '08:00–17:00',
    'chủ nhật': '08:00–17:00',
    'thứ hai': '08:00–17:00',
  };
  const schedules = [
    vietnamese,
    {
      ...weeklyHours('09:00–20:00'),
      monday: '00:00–08:00, 09:00–20:00',
      tuesday: 'Đóng cửa',
      wednesday: 'Mở cửa cả ngày',
    },
    { monday: '08:00–17:00' },
    { ...weeklyHours('09:00–17:00'), monday: '22:00–02:00' },
    { ...weeklyHours('09:00–17:00'), monday: '1–5 PM' },
    weeklyHours('8 AM–5 PM'),
  ];
  const normalized = normalizePlaces(
    {
      local_results: schedules.map((operating_hours, index) =>
        rawPlace(index, { operating_hours }),
      ),
    },
    getDestination('da-nang'),
    NOW.toISOString(),
  );
  assert.equal(normalized.places[0].openingWindows.length, 7);
  assert.ok(
    normalized.places[0].openingWindows.every(
      (window) => window.startTime === '08:00' && window.endTime === '17:00',
    ),
  );
  assert.deepEqual(
    normalized.places[1].openingWindows.filter((window) => window.dayOfWeek === 1),
    [
      { dayOfWeek: 1, startTime: '00:00', endTime: '08:00' },
      { dayOfWeek: 1, startTime: '09:00', endTime: '20:00' },
    ],
  );
  assert.equal(
    normalized.places[1].openingWindows.some((window) => window.dayOfWeek === 2),
    false,
  );
  assert.deepEqual(
    normalized.places[1].openingWindows.find((window) => window.dayOfWeek === 3),
    { dayOfWeek: 3, startTime: '00:00', endTime: '23:59' },
  );
  for (const index of [2, 3, 4]) assert.equal(normalized.places[index].openingWindows, undefined);
  assert.equal(normalized.places[5].openingWindows.length, 7);
  assert.ok(normalized.warnings.some((warning) => warning.includes('3 địa điểm')));
});

test('discovery excludes travel agencies, tour offices and stays instead of scheduling them as attractions', () => {
  const rejectedTypes = [
    { type: 'Travel agency', title: 'Vietnam Treasures Travel' },
    { type: 'Đại lý du lịch' },
    { type_id: 'travel_agency' },
    { types: ['Tour operator'] },
    { type_ids: ['tour_agency'] },
    { type: 'Hotel' },
    { type: 'Khách sạn' },
    { type: 'Real estate agency' },
  ];
  const result = normalizePlaces(
    {
      local_results: [
        ...rejectedTypes.map((patch, index) => rawPlace(index, patch)),
        rawPlace(30, { type: 'Tourist attraction', title: 'Travel Through History Museum' }),
        rawPlace(31, { type: 'Cafe', title: 'Cà phê ven hồ' }),
      ],
    },
    getDestination('da-nang'),
    NOW.toISOString(),
  );
  assert.equal(result.rejected, rejectedTypes.length);
  assert.equal(result.places.length, 2);
  assert.deepEqual(
    result.places.map((place) => place.name),
    ['Travel Through History Museum', 'Cà phê ven hồ'],
  );
});

test('competing stale-lock recovery permits only one spending owner', async () => {
  const child = spawn(process.execPath, ['-e', ''], { windowsHide: true });
  const deadPid = child.pid;
  await once(child, 'exit');
  const directory = await mkdtemp(join(tmpdir(), 'goease-discovery-recovery-race-'));
  const config = readConfig({ ...env, SERPAPI_STATE_DIR: directory });
  await writeFile(
    join(directory, 'quota.lock'),
    JSON.stringify({ version: 1, pid: deadPid, nonce: randomUUID() }),
  );
  const instances = [0, 1].map(
    () => new DiscoveryService(config, { now: () => new Date(NOW), fetcher: provider }),
  );
  try {
    const results = await Promise.allSettled(
      instances.map((instance) => instance.places(requestBody, USER, signal())),
    );
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(
      results.filter(
        (result) =>
          result.status === 'rejected' && result.reason.code === 'DISCOVERY_GUARD_UNAVAILABLE',
      ).length,
      1,
    );
    assert.equal(JSON.parse(await readFile(join(directory, 'quota.json'), 'utf8')).total, 1);
  } finally {
    await Promise.all(instances.map((instance) => instance.onModuleDestroy()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('optional discovery metrics contain only aggregate diagnostics and omit keys, owners, free text and raw places', async () => {
  const originalInfo = console.info,
    logs = [];
  console.info = (...items) => logs.push(items);
  try {
    await service(async (instance) => {
      await instance.places(requestBody, USER, signal());
    });
    assert.equal(logs.length, 0);
    await service(
      async (instance) => {
        await instance.places(requestBody, USER, signal());
        await instance.places(requestBody, USER, signal());
      },
      { SERPAPI_LOG_METRICS: 'true' },
    );
    const metrics = logs.map(([message]) => JSON.parse(message));
    assert.equal(metrics.length, 2);
    for (const record of metrics) {
      assert.deepEqual(
        Object.keys(record).sort(),
        [
          'cacheHit',
          'destinationId',
          'durationMs',
          'event',
          'placeCount',
          'providerRequests',
        ].sort(),
      );
      assert.equal(record.event, 'goease.discovery');
      assert.equal(record.destinationId, 'da-nang');
      assert.equal(record.placeCount, 12);
      assert.ok(Number.isInteger(record.durationMs) && record.durationMs >= 0);
    }
    assert.deepEqual(
      metrics.map((record) => [record.cacheHit, record.providerRequests]),
      [
        [false, 1],
        [true, 0],
      ],
    );
    const serialized = JSON.stringify(logs);
    for (const privateValue of [
      SECRET,
      USER,
      'Bảo tàng',
      'gps_coordinates',
      'authorization',
      'api_key',
    ])
      assert.equal(serialized.includes(privateValue), false);
  } finally {
    console.info = originalInfo;
  }
});

test('misclassified tour offices with business suffixes are excluded while travel museums and old quarters remain', () => {
  const names = [
    'Vietnam Treasures Travel',
    'Lotus Tours',
    'Example Travel Company',
    'Museum of Travel',
    'Travel Through History Museum',
    'Phố cổ Hội An',
  ];
  const result = normalizePlaces(
    {
      local_results: names.map((title, index) =>
        rawPlace(index, {
          title,
          type: 'Điểm thu hút khách du lịch',
          types: ['Điểm thu hút khách du lịch'],
        }),
      ),
    },
    getDestination('da-nang'),
    NOW.toISOString(),
  );
  assert.equal(result.rejected, 3);
  assert.deepEqual(
    result.places.map((place) => place.name),
    names.slice(3),
  );
  const typedMuseum = normalizePlaces(
    { local_results: [rawPlace(0, { title: 'Around the World Travel', type: 'Museum' })] },
    getDestination('da-nang'),
    NOW.toISOString(),
  );
  assert.equal(typedMuseum.places.length, 1);
});
