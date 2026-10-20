import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { getDalatCatalog } from '@goease/catalog';
import { getDestination } from '@goease/contracts';
import { generateDiscoveredTrip } from '@goease/itinerary';

const root = fileURLToPath(new URL('..', import.meta.url));
const base = 'http://127.0.0.1:4187';
const authOrigin = 'https://abcdefghijklmnopqrst.supabase.co';
const owner = '12345678-1234-4234-8234-123456789abc';
const token = 'fixture.access.signature';
const dynamicNinhBinh = {
  id: 'dest-ninh-binh-fixture',
  name: 'Ninh Bình',
  countryCode: 'VN',
  timeZone: 'Asia/Ho_Chi_Minh',
  currency: 'VND',
  center: { latitude: 20.2506, longitude: 105.9745 },
  radiusKm: 25,
  selectionToken: 'a'.repeat(43),
  source: {
    provider: 'serpapi',
    externalId: 'ninh-binh-fixture',
    sourceUrl: 'https://www.google.com/maps?cid=ninh-binh',
    fetchedAt: '2026-10-20T12:00:00Z',
  },
};
const dynamicCanTho = {
  ...dynamicNinhBinh,
  id: 'dest-can-tho-fixture',
  name: 'Cần Thơ',
  timeZone: 'Asia/Ho_Chi_Minh',
  center: { latitude: 10.0452, longitude: 105.7469 },
  address: 'Cần Thơ, Việt Nam',
  source: {
    ...dynamicNinhBinh.source,
    externalId: 'can-tho-fixture',
    sourceUrl: 'https://www.google.com/maps?cid=cantho',
  },
};
const dynamicHoaLu = {
  ...dynamicNinhBinh,
  id: 'dest-hoa-lu-fixture',
  name: 'Hoa Lư',
  address: 'Ninh Bình, Việt Nam',
  center: { latitude: 20.251, longitude: 105.975 },
  source: {
    ...dynamicNinhBinh.source,
    externalId: 'hoa-lu-fixture',
    sourceUrl: 'https://www.google.com/maps?cid=hoa-lu',
  },
};
let server, browser;
before(async () => {
  server = await preview({
    root,
    configFile: false,
    build: { outDir: 'dist-test' },
    preview: { host: '127.0.0.1', port: 4187, strictPort: true },
  });
  browser = await chromium.launch();
  await mkdir(root + '/test-results', { recursive: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
});

function sourcePlaces(destination) {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `fixture-${destination.id}-${index}`,
    provider: 'serpapi',
    externalId: `test:${index}`,
    name: `Điểm thử nghiệm ${index + 1}`,
    destinationId: destination.id,
    coordinates: {
      latitude: destination.center.latitude + index * 0.003,
      longitude: destination.center.longitude,
    },
    address: `Địa chỉ thử nghiệm ${index + 1}, ${destination.name}`,
    category: index === 4 ? 'cafe' : 'nature',
    rating: index === 0 ? null : 4.3,
    priceLevel: null,
    durationMinutes: 60,
    durationBasis: 'estimate',
    sourceUrl: 'https://www.google.com/maps?cid=fixture' + index,
    fetchedAt: '2026-10-20T13:00:00Z',
  }));
}

async function setup(viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  context.setDefaultTimeout(10000);
  const errors = [],
    state = {
      requests: [],
      searches: [],
      searchDelay: null,
      writes: [],
      records: new Map(),
      failure: false,
      delay: null,
      tileRequests: [],
      listRequests: 0,
      listDelay: null,
      writeDelay: null,
    };
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'beforeunload') void dialog.accept();
    else {
      errors.push(`Unexpected native ${dialog.type()}: ${dialog.message()}`);
      void dialog.dismiss();
    }
  });
  await context.addInitScript(
    ({ owner }) => {
      localStorage.setItem(
        'goease.web.abcdefghijklmnopqrst.session',
        JSON.stringify({ version: 1, refreshToken: 'fixture_refresh_session', ownerId: owner }),
      );
    },
    { owner },
  );
  const cors = {
    'access-control-allow-origin': base,
    'access-control-allow-headers':
      'authorization,content-type,apikey,x-client-info,x-supabase-api-version',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  };
  const reply = (route, json, status = 200) => route.fulfill({ status, json, headers: cors });
  const fail = (route, status, code, message) =>
    reply(
      route,
      { apiVersion: '1', statusCode: status, error: { code, message, requestId: randomUUID() } },
      status,
    );
  await context.route(authOrigin + '/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'OPTIONS') return reply(route, {});
    if (path === '/auth/v1/token')
      return reply(route, {
        token_type: 'bearer',
        access_token: token,
        refresh_token: 'fixture_refresh_session',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
    if (path === '/auth/v1/user')
      return reply(route, {
        id: owner,
        aud: 'authenticated',
        role: 'authenticated',
        identities: [{ provider: 'google' }],
        user_metadata: { full_name: 'Bạn thử nghiệm' },
        email: 'fixture@example.test',
      });
    return reply(route, {});
  });
  await context.route('https://api.goease.test/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      method = request.method();
    if (method === 'OPTIONS') return reply(route, {});
    if (url.pathname === '/v1/catalog/places')
      return reply(route, {
        apiVersion: '1',
        places: getDalatCatalog().map((entry) => ({ entry, enabled: true, version: 1 })),
      });
    assert.equal(request.headers().authorization, 'Bearer ' + token);
    if (url.pathname === '/v1/auth/me')
      return reply(route, { apiVersion: '1', identity: { id: owner, provider: 'supabase' } });
    if (url.pathname === '/v1/destinations') {
      const query = url.searchParams.get('q');
      state.searches.push(query);
      if (state.searchDelay) await state.searchDelay;
      if (query.includes('Tokyo'))
        return fail(
          route,
          422,
          'DISCOVERY_NO_RESULTS',
          'Chưa tìm thấy điểm đến tại Việt Nam. Hãy thử tên địa phương cụ thể hơn.',
        );
      return reply(route, {
        apiVersion: '1',
        source: 'serpapi',
        destinations: query.includes('Ninh Bình')
          ? [dynamicNinhBinh, dynamicHoaLu]
          : query.includes('Cần Thơ')
            ? [dynamicCanTho]
            : [],
      });
    }
    if (url.pathname === '/v1/discovery/preview') {
      const body = request.postDataJSON();
      state.requests.push(body);
      if (state.delay) await state.delay;
      if (state.failure)
        return fail(route, 503, 'DISCOVERY_NOT_CONFIGURED', 'Chưa cấu hình nguồn địa điểm.');
      const destination = body.input.destination ?? getDestination(body.input.destinationId),
        places = sourcePlaces(destination);
      const result = generateDiscoveredTrip(body.input, places, {
        tripId: randomUUID(),
        today: body.input.startDate,
        destination,
      });
      assert.equal(result.ok, true);
      return reply(route, {
        apiVersion: '1',
        destination,
        source: 'serpapi',
        places,
        result,
        metadata: {
          cacheHit: false,
          providerRequests: 2,
          durationMs: 123,
          fetchedAt: '2026-10-20T13:00:00Z',
          missingPrices: 5,
        },
      });
    }
    if (url.pathname === '/v1/trips' && method === 'GET') {
      state.listRequests++;
      if (state.listDelay) await state.listDelay;
      return reply(route, {
        apiVersion: '1',
        nextCursor: null,
        items: [...state.records.values()].map(({ trip, version, updatedAt }) => ({
          id: trip.id,
          name: trip.name,
          startDate: trip.startDate,
          durationDays: trip.durationDays,
          people: trip.people,
          version,
          updatedAt,
        })),
      });
    }
    const id = url.pathname.split('/').at(-1),
      record = state.records.get(id);
    if (method === 'GET')
      return record
        ? reply(route, { apiVersion: '1', ...record })
        : fail(route, 404, 'NOT_FOUND', 'Không tìm thấy chuyến.');
    const body = request.postDataJSON();
    state.writes.push(body);
    if (state.writeDelay) await state.writeDelay;
    if (method === 'PUT' && body.expectedVersion !== record?.version)
      return fail(route, 409, 'TRIP_CONFLICT', 'Chuyến đã thay đổi.');
    const saved = {
      trip: body.trip,
      version: (record?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    state.records.set(body.trip.id, saved);
    return reply(
      route,
      {
        apiVersion: '1',
        mutationId: body.mutationId,
        replayed: false,
        result: { kind: 'saved', ...saved },
      },
      method === 'POST' ? 201 : 200,
    );
  });
  await context.route('https://maps.googleapis.com/**', (route) => route.abort());
  await context.route('https://tile.openstreetmap.org/**', (route) => {
    state.tileRequests.push(route.request().url());
    return route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        'base64',
      ),
      headers: { 'cache-control': 'public, max-age=604800' },
    });
  });
  await page.goto(base + '/trips/new');
  await page
    .getByRole('heading', { name: 'Một nơi mới, một hành trình mới.', exact: true })
    .waitFor();
  return { page, context, errors, state };
}
async function form(page, city = 'Đà Nẵng') {
  await page.getByRole('button', { name: city, exact: true }).click();
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Cuối tuần ở ' + city);
  await page.getByLabel('Ngày bắt đầu', { exact: true }).fill('2099-10-20');
  await page.getByLabel('Số ngày', { exact: true }).fill('2');
  await page.getByLabel('Số người', { exact: true }).fill('3');
}
async function finish(fixture, name) {
  assert.deepEqual(fixture.errors, []);
  assert.equal(
    await fixture.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await fixture.page.screenshot({ path: root + `/test-results/${name}.png`, fullPage: true });
  await fixture.context.close();
}

for (const [mode, viewport] of [
  ['mobile', { width: 390, height: 844 }],
  ['desktop', { width: 1440, height: 1000 }],
]) {
  test(`multi destination ${mode}: preview source, replace, edit, manual save, reopen snapshots and map`, async () => {
    const f = await setup(viewport),
      { page, state } = f;
    assert.equal(await page.getByRole('button', { name: 'Đà Nẵng', exact: true }).count(), 1);
    await form(page);
    await page.getByLabel('Thiên nhiên', { exact: true }).check();
    await page.getByLabel('Cà phê', { exact: true }).check();
    await page.getByRole('button', { name: 'Tìm địa điểm và lên lịch', exact: true }).click();
    await page.getByRole('heading', { name: 'Gợi ý cho Đà Nẵng', exact: true }).waitFor();
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].input.destinationId, 'da-nang');
    assert.deepEqual(state.requests[0].interests, ['nature', 'cafe']);
    assert.equal(state.writes.length, 0);
    assert.equal(await page.getByText('Chưa lưu vào tài khoản', { exact: true }).count(), 1);
    const replacement = page.getByLabel(/^Thay địa điểm /).first();
    await replacement.selectOption('fixture-da-nang-4');
    await page.getByRole('button', { name: 'Chỉnh sửa và lưu lịch này', exact: true }).click();
    await page.waitForURL(/\/trips\/[a-f0-9-]{36}$/);
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).waitFor();
    assert.equal(state.writes.length, 0);
    await page.getByRole('button', { name: 'Sửa Điểm thử nghiệm 5', exact: true }).first().click();
    assert.doesNotMatch(
      await page.getByLabel('Ghi chú', { exact: true }).inputValue(),
      /Di chuyển ước tính|km đường chim bay/,
    );
    assert.match(
      await page.getByLabel('Ghi chú', { exact: true }).inputValue(),
      /Đã thay địa điểm/,
    );
    const placeSelector = page.getByLabel('Địa điểm đã tìm', { exact: true });
    await placeSelector.selectOption('fixture-da-nang-1');
    assert.doesNotMatch(
      await page.getByLabel('Ghi chú', { exact: true }).inputValue(),
      /Di chuyển ước tính|km đường chim bay/,
    );
    await placeSelector.selectOption('fixture-da-nang-4');
    await page.getByLabel('Chi phí cả nhóm (VND)', { exact: true }).fill('90000');
    await page.getByLabel('Ghi chú', { exact: true }).fill('Kiểm tra giờ trước khi đi');
    let releaseSave;
    state.writeDelay = new Promise((resolve) => {
      releaseSave = resolve;
    });
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await page.getByText('Đang lưu thay đổi…', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Thử lưu lại', exact: true }).count(), 0);
    releaseSave();
    await page.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).waitFor();
    assert.equal(state.writes.length, 1);
    assert.equal(state.writes[0].trip.destinationId, 'da-nang');
    assert.equal(state.writes[0].trip.days[0].activities[0].costVnd, 90000);
    assert.equal(
      state.writes[0].trip.days[0].activities[0].location.placeSnapshot.name,
      'Điểm thử nghiệm 5',
    );
    await page.reload();
    await page
      .getByRole('heading', { level: 1, name: 'Cuối tuần ở Đà Nẵng', exact: true })
      .waitFor();
    await page.getByRole('tab', { name: 'Thông tin', exact: true }).click();
    await page.getByText('Đà Nẵng ·', { exact: false }).first().waitFor();
    await page.getByRole('tab', { name: 'Bản đồ', exact: true }).click();
    const osm = page.getByLabel('Bản đồ OpenStreetMap', { exact: true });
    await osm.locator('.leaflet-marker-icon').first().waitFor();
    assert.equal(
      await osm.locator('.leaflet-marker-icon').count(),
      state.writes[0].trip.days[0].activities.length,
    );
    await osm.getByRole('link', { name: 'OpenStreetMap', exact: true }).waitFor();
    await osm.locator('.leaflet-marker-icon').first().click();
    await osm
      .locator('.leaflet-popup-content')
      .getByText('Điểm thử nghiệm 5', { exact: true })
      .first()
      .waitFor();
    assert(state.tileRequests.length > 0);
    assert(state.tileRequests.length < 100, 'Only viewport tiles are requested');
    await page
      .getByRole('link', { name: 'Mở chỉ đường Google Maps ↗', exact: true })
      .first()
      .waitFor();
    assert.match(
      await page
        .getByRole('link', { name: 'Mở chỉ đường Google Maps ↗', exact: true })
        .first()
        .getAttribute('href'),
      /destination=16/,
    );
    await finish(f, `discovery-${mode}`);
  });
}

for (const [mode, destination, viewport] of [
  ['desktop', dynamicNinhBinh, { width: 1440, height: 1000 }],
  ['mobile', dynamicCanTho, { width: 390, height: 844 }],
  ['mobile-ninh-binh', dynamicNinhBinh, { width: 390, height: 844 }],
]) {
  test(`arbitrary destination ${mode}: explicit search outside popular list, snapshot save and reopen`, async () => {
    const f = await setup(viewport),
      { page, state } = f;
    const query = page.getByLabel('Tìm điểm đến', { exact: true });
    await query.fill(destination.name);
    assert.equal(state.searches.length, 0, 'typing does not spend a provider query');
    await page.getByText(/Chưa chọn điểm đến\./).waitFor();
    assert.equal(
      await page.locator('[aria-label="Chọn điểm đến"] button[aria-pressed="true"]').count(),
      0,
    );
    await query.press('Enter');
    await page
      .getByRole('heading', { name: `Kết quả cho “${destination.name}”`, exact: true })
      .waitFor();
    assert.equal(
      await page.locator('[aria-label="Chọn điểm đến"] button[aria-pressed="true"]').count(),
      0,
      'results are not automatically selected',
    );
    if (destination.id === dynamicNinhBinh.id) {
      const resultButtons = page.locator('[aria-label="Chọn điểm đến"] button');
      assert.match(await resultButtons.nth(0).innerText(), /^Ninh Bình/);
      assert.match(await resultButtons.nth(1).innerText(), /^Hoa Lư/);
      assert.equal(await page.getByRole('button', { name: /^Hoa Lư/ }).count(), 1);
    }
    await page.getByRole('button', { name: new RegExp('^' + destination.name) }).click();
    assert.deepEqual(state.searches, [destination.name]);
    assert.equal(
      state.requests.length,
      0,
      'Enter in destination field never submits the itinerary',
    );
    await page.getByText('Đang chọn: ' + destination.name, { exact: true }).waitFor();
    await page.getByText(/Ngân sách tính bằng VND/).waitFor();
    await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Khám phá ' + destination.name);
    await page.getByLabel('Ngày bắt đầu', { exact: true }).fill('2099-10-20');
    await page.getByLabel('Số ngày', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Tìm địa điểm và lên lịch', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Gợi ý cho ' + destination.name, exact: true })
      .waitFor();
    assert.deepEqual(state.requests[0].input.destination, destination);
    assert.equal(
      state.requests[0].input.destination.name,
      destination.name,
      'selection keeps the provider name instead of substituting the search query',
    );
    await page.getByRole('button', { name: 'Chỉnh sửa và lưu lịch này', exact: true }).click();
    await page.waitForURL(/\/trips\/[a-f0-9-]{36}$/);
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await page.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).waitFor();
    assert.deepEqual(state.writes[0].trip.destination, destination);
    assert.equal(state.writes[0].trip.timeZone, destination.timeZone);
    await page.reload();
    await page
      .getByRole('heading', { level: 1, name: 'Khám phá ' + destination.name, exact: true })
      .waitFor();
    await page.getByRole('tab', { name: 'Bản đồ', exact: true }).click();
    await page
      .getByLabel('Bản đồ OpenStreetMap', { exact: true })
      .locator('.leaflet-marker-icon')
      .first()
      .waitFor();
    assert.equal(state.searches.length, 1, 'saved trip opens without resolving destination again');
    await finish(f, `arbitrary-${mode}`);
  });
}

test('editing a destination query cancels stale results and requires a new selection', async () => {
  const f = await setup(),
    { page, state } = f;
  let release;
  state.searchDelay = new Promise((resolve) => {
    release = resolve;
  });
  const query = page.getByLabel('Tìm điểm đến', { exact: true });
  await query.fill('Ninh Bình');
  await query.press('Enter');
  await page.getByText('Đang tìm điểm đến…', { exact: true }).waitFor();
  await query.fill('Cần Thơ');
  await page.getByText(/Chưa chọn điểm đến\./).waitFor();
  assert.equal(await page.getByRole('heading', { name: /^Kết quả cho/ }).count(), 0);
  state.searchDelay = null;
  release();
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Chưa chọn nơi');
  await page.getByRole('button', { name: 'Tìm địa điểm và lên lịch', exact: true }).click();
  await page.getByText('Tìm và chọn một điểm đến trước khi lên lịch.', { exact: true }).waitFor();
  assert.equal(state.requests.length, 0);
  assert.equal(await page.getByRole('button', { name: /^Ninh Bình/ }).count(), 0);
  await page.getByRole('button', { name: 'Tìm điểm đến', exact: true }).click();
  await page.getByRole('button', { name: /^Cần Thơ/ }).click();
  await page.getByText('Đang chọn: Cần Thơ', { exact: true }).waitFor();
  assert.deepEqual(state.searches, ['Ninh Bình', 'Cần Thơ']);
  await finish(f, 'arbitrary-cancelled-search');
});

test('a foreign destination query explains Vietnam coverage and preserves the form without allowing a preview', async () => {
  const f = await setup(),
    { page, state } = f;
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Chuyến mới của nhóm');
  await page.getByLabel('Tìm điểm đến', { exact: true }).fill('Tokyo');
  await page.getByRole('button', { name: 'Tìm điểm đến', exact: true }).click();
  await page
    .getByText('Chưa tìm thấy điểm đến tại Việt Nam. Hãy thử tên địa phương cụ thể hơn.', {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.getByLabel('Tìm điểm đến', { exact: true }).inputValue(), 'Tokyo');
  assert.equal(
    await page.getByLabel('Tên chuyến đi', { exact: true }).inputValue(),
    'Chuyến mới của nhóm',
  );
  assert.equal(await page.locator('[aria-label="Chọn điểm đến"] button').count(), 0);
  await page.getByRole('button', { name: 'Tìm địa điểm và lên lịch', exact: true }).click();
  await page.getByText('Tìm và chọn một điểm đến trước khi lên lịch.', { exact: true }).waitFor();
  assert.equal(state.requests.length, 0);
  assert.equal(state.writes.length, 0);
  await finish(f, 'arbitrary-vietnam-only');
});

test('missing provider keeps user input and supports an honestly empty manual plan in another city', async () => {
  const f = await setup({ width: 320, height: 568 }),
    { page, state } = f;
  await form(page, 'Hội An');
  state.failure = true;
  await page.getByRole('button', { name: 'Tìm địa điểm và lên lịch', exact: true }).click();
  await page.getByText(/Chưa cấu hình nguồn địa điểm\./).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Xem trước lịch trình' }).count(), 0);
  assert.equal(
    await page.getByLabel('Tên chuyến đi', { exact: true }).inputValue(),
    'Cuối tuần ở Hội An',
  );
  assert.equal(state.writes.length, 0);
  await page.getByRole('button', { name: 'Tạo lịch trống', exact: true }).click();
  await page.waitForURL(/\/trips\/[a-f0-9-]{36}$/);
  await page.getByText('Ngày này chưa có hoạt động.', { exact: true }).waitFor();
  await page.getByRole('button', { name: '+ Thêm hoạt động', exact: true }).click();
  await page.getByLabel('Tên hoạt động', { exact: true }).fill('Ăn tối cùng nhóm');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await page.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).waitFor();
  assert.equal(state.writes[0].trip.destinationId, 'hoi-an');
  assert.equal(state.writes[0].trip.days[0].activities[0].costVnd, null);
  assert.equal(state.writes[0].trip.days[0].activities[0].location.kind, 'custom');
  await finish(f, 'discovery-no-provider-mobile');
});

test('entering trip list after an authenticated deep link loads saved trips before claiming an empty account', async () => {
  const f = await setup(),
    { page, state } = f;
  const destination = getDestination('ha-noi');
  const generated = generateDiscoveredTrip(
    {
      name: 'Chuyến lưu ở Hà Nội',
      destinationId: destination.id,
      startDate: '2099-10-20',
      durationDays: 1,
      people: 2,
      budgetVnd: null,
    },
    sourcePlaces(destination),
    { tripId: 'deep-link-saved-trip', today: '2099-10-20' },
  );
  assert.equal(generated.ok, true);
  state.records.set(generated.trip.id, {
    trip: generated.trip,
    version: 1,
    updatedAt: new Date().toISOString(),
  });
  await page.goto(base + '/trips/' + generated.trip.id);
  await page.getByRole('heading', { level: 1, name: generated.trip.name, exact: true }).waitFor();
  const before = state.listRequests;
  let release;
  state.listDelay = new Promise((resolve) => {
    release = resolve;
  });
  await page.getByRole('link', { name: 'Chuyến đi', exact: true }).click();
  await page.getByText('Đang tải danh sách chuyến đi…', { exact: true }).waitFor();
  assert.equal(
    await page
      .getByText('Chưa có chuyến nào. Tạo hành trình đầu tiên của bạn.', { exact: true })
      .count(),
    0,
  );
  release();
  await page
    .getByRole('button', { name: 'Mở chuyến tài khoản: ' + generated.trip.name, exact: true })
    .waitFor();
  assert.equal(state.listRequests, before + 1);
  assert.equal(state.writes.length, 0);
  await finish(f, 'discovery-list-after-deep-link');
});

test('cancel discovery prevents a delayed preview from replacing current form values', async () => {
  const f = await setup(),
    { page, state } = f;
  let release;
  state.delay = new Promise((resolve) => {
    release = resolve;
  });
  await form(page);
  await page.getByRole('button', { name: 'Tìm địa điểm và lên lịch', exact: true }).click();
  await page.getByRole('button', { name: 'Dừng tìm', exact: true }).click();
  await page.getByRole('button', { name: 'Hà Nội', exact: true }).click();
  release();
  await page.getByText('Đang chọn: Hà Nội', { exact: true }).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Xem trước lịch trình' }).count(), 0);
  assert.equal(state.writes.length, 0);
  await finish(f, 'discovery-cancelled');
});
