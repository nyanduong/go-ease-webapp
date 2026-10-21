import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { getDalatCatalog } from '@goease/catalog';
import { getDestination } from '@goease/contracts';
import { generateDiscoveredTrip } from '@goease/itinerary';
import { randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const base = 'http://127.0.0.1:4193';
const owner = '12345678-1234-4234-8234-123456789abc';
const token = 'fixture.access.signature';
const destination = {
  id: 'editorial-ninh-binh',
  name: 'Ninh Bình',
  countryCode: 'VN',
  timeZone: 'Asia/Ho_Chi_Minh',
  currency: 'VND',
  center: { latitude: 20.2506, longitude: 105.9745 },
  radiusKm: 25,
};
const make = (id, kind, title, extra = {}) => ({
  entry: {
    id,
    kind,
    title,
    summary: 'Khám phá vẻ đẹp địa phương theo nhịp của bạn.',
    body: 'Một hành trình giữa thiên nhiên và những câu chuyện địa phương.\n\nKiểm tra giờ mở cửa và điều kiện trước khi đi.',
    status: 'published',
    destinationId: ['place', 'food', 'article'].includes(kind) ? destination.id : null,
    categoryIds: kind === 'category' ? [] : ['nature'],
    image: null,
    address: ['place', 'food'].includes(kind) ? 'Ninh Bình, Việt Nam' : '',
    coordinates: ['place', 'food'].includes(kind) ? destination.center : null,
    destination: kind === 'destination' ? destination : null,
    sources: [{ title: 'Cổng thông tin du lịch Việt Nam', url: 'https://vietnam.travel/' }],
    ...extra,
  },
  version: 1,
  updatedAt: '2026-10-21T00:00:00Z',
});
const records = [
  make(destination.id, 'destination', 'Ninh Bình'),
  make('nature', 'category', 'Giữa thiên nhiên'),
  make('trang-an', 'place', 'Tràng An'),
  make('com-chay', 'food', 'Cơm cháy Ninh Bình'),
  make('ninh-binh-guide', 'article', 'Một ngày ở Ninh Bình'),
];
let server, browser;
before(async () => {
  server = await preview({
    root,
    configFile: false,
    build: { outDir: 'dist-test' },
    preview: { host: '127.0.0.1', port: 4193, strictPort: true },
  });
  browser = await chromium.launch();
  await mkdir(root + '/test-results/content', { recursive: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
});

async function setup(viewport, authenticated = true) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [],
    favorites = new Set(),
    trips = new Map(),
    calls = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  if (authenticated)
    await context.addInitScript(
      ({ owner }) => {
        if (!localStorage.getItem('goease.web.abcdefghijklmnopqrst.session'))
          localStorage.setItem(
            'goease.web.abcdefghijklmnopqrst.session',
            JSON.stringify({ version: 1, refreshToken: 'fixture_refresh_session', ownerId: owner }),
          );
      },
      { owner },
    );
  const headers = {
    'access-control-allow-origin': base,
    'access-control-allow-headers':
      'authorization,content-type,apikey,x-client-info,x-supabase-api-version',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  };
  const reply = (route, json, status = 200) => route.fulfill({ json, status, headers });
  await context.route('https://abcdefghijklmnopqrst.supabase.co/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'OPTIONS') return reply(route, {});
    if (path.endsWith('/token'))
      return reply(route, {
        token_type: 'bearer',
        access_token: token,
        refresh_token: 'fixture_refresh_session',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
    return reply(route, {
      id: owner,
      aud: 'authenticated',
      role: 'authenticated',
      identities: [{ provider: 'google' }],
      app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: { full_name: 'Bạn khám phá' },
      email: 'fixture@example.test',
    });
  });
  await context.route('https://api.goease.test/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      method = request.method();
    if (method === 'OPTIONS') return reply(route, {});
    calls.push(method + ' ' + url.pathname);
    if (url.pathname === '/v1/content') {
      assert.equal(request.headers().authorization, undefined);
      const q = url.searchParams;
      const items = records.filter(
        ({ entry }) =>
          (!q.get('kind') || q.get('kind') === entry.kind) &&
          (!q.get('destinationId') || q.get('destinationId') === entry.destinationId) &&
          (!q.get('categoryId') || entry.categoryIds.includes(q.get('categoryId'))) &&
          (!q.get('q') || entry.title.toLowerCase().includes(q.get('q').toLowerCase())),
      );
      return reply(route, { apiVersion: '1', items, nextCursor: null });
    }
    if (url.pathname.startsWith('/v1/content/')) {
      const record = records.find(({ entry }) => entry.id === url.pathname.split('/').at(-1));
      return reply(route, record ?? {}, record ? 200 : 404);
    }
    if (url.pathname === '/v1/catalog/places')
      return reply(route, {
        apiVersion: '1',
        places: getDalatCatalog().map((entry) => ({ entry, enabled: true, version: 1 })),
      });
    assert.equal(request.headers().authorization, 'Bearer ' + token);
    if (url.pathname === '/v1/auth/me')
      return reply(route, { apiVersion: '1', identity: { id: owner, provider: 'supabase' } });
    if (url.pathname === '/v1/favorites')
      return reply(route, {
        apiVersion: '1',
        items: records.filter(({ entry }) => favorites.has(entry.id)),
        nextCursor: null,
      });
    if (url.pathname.startsWith('/v1/favorites/')) {
      const id = url.pathname.split('/').at(-1);
      if (method === 'PUT') favorites.add(id);
      else favorites.delete(id);
      return reply(route, { apiVersion: '1', saved: method === 'PUT' });
    }
    if (url.pathname === '/v1/discovery/preview') {
      const body = request.postDataJSON();
      const selected = body.input.destination ?? getDestination(body.input.destinationId);
      const places = Array.from({ length: 5 }, (_, index) => ({
        id: `editorial-preview-${index}`,
        provider: 'serpapi',
        externalId: `fixture:${index}`,
        name: `Địa điểm gợi ý ${index + 1}`,
        destinationId: selected.id,
        coordinates: {
          latitude: selected.center.latitude + index * 0.003,
          longitude: selected.center.longitude,
        },
        address: `Địa chỉ fixture ${index + 1}`,
        category: 'nature',
        rating: null,
        priceLevel: null,
        durationMinutes: 60,
        durationBasis: 'estimate',
        sourceUrl: `https://www.google.com/maps?cid=editorial${index}`,
        fetchedAt: '2026-10-20T13:00:00Z',
      }));
      const result = generateDiscoveredTrip(body.input, places, {
        tripId: randomUUID(),
        today: body.input.startDate,
        destination: selected,
        pace: body.pace,
      });
      assert.equal(result.ok, true);
      return reply(route, {
        apiVersion: '1',
        destination: selected,
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
    if (url.pathname === '/v1/trips' && method === 'GET')
      return reply(route, {
        apiVersion: '1',
        items: [...trips.values()].map(({ trip, version, updatedAt }) => ({
          id: trip.id,
          name: trip.name,
          destinationId: trip.destinationId,
          startDate: trip.startDate,
          durationDays: trip.durationDays,
          people: trip.people,
          version,
          updatedAt,
        })),
        nextCursor: null,
      });
    if (url.pathname.startsWith('/v1/trips/') && method === 'GET')
      return reply(route, { apiVersion: '1', ...trips.get(url.pathname.split('/').at(-1)) });
    if (url.pathname === '/v1/trips' && method === 'POST') {
      const body = request.postDataJSON();
      const saved = { trip: body.trip, version: 1, updatedAt: new Date().toISOString() };
      trips.set(body.trip.id, saved);
      return reply(
        route,
        {
          apiVersion: '1',
          mutationId: body.mutationId,
          replayed: false,
          result: { kind: 'saved', ...saved },
        },
        201,
      );
    }
    throw Error('Unexpected fixture route: ' + method + ' ' + url.pathname);
  });
  return { page, context, errors, calls, trips, favorites };
}

for (const [mode, viewport] of [
  ['mobile', { width: 390, height: 844 }],
  ['desktop', { width: 1440, height: 1000 }],
]) {
  test(`editorial discovery ${mode}: home, query filters, detail, favorite, plan save and reopen`, async () => {
    const f = await setup(viewport),
      { page, calls, trips, favorites } = f;
    await page.goto(base + '/');
    await page.getByRole('heading', { name: 'Ninh Bình', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Tiếp tục chuyến gần nhất' }).count(), 0);
    for (const name of [
      'Bạn muốn đi đâu?',
      'Địa điểm đáng ghé',
      'Ăn gì ở đây?',
      'Kinh nghiệm cho chuyến đi',
    ])
      await page.getByRole('region', { name }).waitFor();
    await page.screenshot({
      path: root + `/test-results/content/home-${mode}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByLabel('Tìm điểm đến, địa điểm, món ngon…').fill('Tràng An');
    await page.getByRole('button', { name: 'Tìm nội dung', exact: true }).click();
    await page.getByRole('heading', { name: 'Tràng An', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Điểm đến', exact: true }).click();
    await page.getByText('Chưa có nội dung phù hợp.', { exact: false }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('q'), 'Tràng An');
    await page.getByLabel('Tìm nội dung du lịch').fill('Ninh Bình');
    await page.getByRole('button', { name: 'Tìm nội dung', exact: true }).click();
    await page.getByRole('heading', { name: 'Ninh Bình', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Ninh Bình', exact: true }).click();
    await page.getByRole('heading', { name: 'Ninh Bình', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Lưu yêu thích', exact: true }).click();
    await page.getByRole('button', { name: 'Bỏ yêu thích', exact: true }).waitFor();
    assert.equal(favorites.has(destination.id), true);
    await page.getByRole('link', { name: 'Danh sách yêu thích', exact: true }).click();
    await page.getByRole('heading', { name: 'Ninh Bình', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Ninh Bình', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Ninh Bình', exact: true }).click();
    await page.getByRole('button', { name: 'Bỏ yêu thích', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Bỏ yêu thích', exact: true }).waitFor();
    await page.screenshot({
      path: root + `/test-results/content/detail-${mode}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('link', { name: /^Lên lịch tại /, exact: true }).click();
    await page.getByRole('button', { name: 'Ninh Bình Việt Nam', exact: true }).waitFor();
    await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Ninh Bình từ khám phá');
    await page.getByLabel('Ngày bắt đầu', { exact: true }).fill('2099-10-20');
    await page.reload();
    await page.getByRole('button', { name: 'Ninh Bình Việt Nam', exact: true }).waitFor();
    assert.equal(
      await page.getByLabel('Tên chuyến đi', { exact: true }).inputValue(),
      'Ninh Bình từ khám phá',
    );
    assert.equal(await page.getByLabel('Ngày bắt đầu', { exact: true }).inputValue(), '2099-10-20');
    assert.equal(
      await page.getByRole('button', { name: 'Tạo lịch trình', exact: true }).count(),
      0,
    );
    await page.getByRole('button', { name: 'Tạo lịch trống', exact: true }).click();
    await page.getByRole('button', { name: 'Giữ chuyến này', exact: true }).click();
    await page.getByRole('heading', { name: 'Ninh Bình từ khám phá', exact: true }).waitFor();
    const saved = [...trips.values()][0].trip;
    assert.deepEqual(saved.destination, destination);
    assert.equal(saved.destination.source, undefined);
    assert.equal(saved.destination.selectionToken, undefined);
    await page.reload();
    await page.getByRole('heading', { name: 'Ninh Bình từ khám phá', exact: true }).waitFor();
    assert.equal(
      calls.some((call) => call.includes('discovery')),
      false,
    );
    assert.deepEqual(f.errors, []);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.screenshot({
      path: root + `/test-results/content/reopened-${mode}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await f.context.close();
  });
}

test('editorial planning back remains available with an existing draft and preserves that draft', async () => {
  const f = await setup({ width: 1440, height: 1000 });
  const { page, calls } = f;
  try {
    await page.goto(base + '/trips/new?content=' + destination.id);
    await page.getByRole('button', { name: 'Ninh Bình Việt Nam', exact: true }).waitFor();
    await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Bản nháp cần giữ');
    await page.getByLabel('Ngày bắt đầu', { exact: true }).fill('2099-10-20');
    await page.getByRole('button', { name: 'Tạo lịch trống', exact: true }).click();
    await page.getByRole('button', { name: 'Giữ chuyến này', exact: true }).waitFor();
    const draftUrl = page.url();
    await page.goto(base + '/explore/trang-an');
    await page.getByRole('link', { name: /^Lên lịch tại /, exact: true }).click();
    await page.getByRole('button', { name: 'Ninh Bình Việt Nam', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Tạo lịch trống', exact: true }).isEnabled(),
      false,
    );
    await page.getByRole('button', { name: 'Tạo chuyến đi', exact: true }).click();
    await page.getByRole('dialog', { name: 'Hủy tạo chuyến đi?', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Tiếp tục nhập', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/trips/new');
    await page.getByRole('button', { name: 'Tạo chuyến đi', exact: true }).click();
    await page.getByRole('button', { name: 'Bỏ thông tin', exact: true }).click();
    await page.waitForURL(base + '/explore/trang-an');
    await page.getByRole('link', { name: /^Lên lịch tại /, exact: true }).click();
    await page.getByRole('button', { name: 'Ninh Bình Việt Nam', exact: true }).waitFor();
    await page.goBack();
    await page.getByRole('button', { name: 'Rời trang', exact: true }).click();
    await page.waitForURL(base + '/explore/trang-an');
    await page.goto(draftUrl);
    await page.getByRole('button', { name: 'Giữ chuyến này', exact: true }).waitFor();
    assert.equal(
      await page.getByLabel('Tên chuyến đi', { exact: true }).inputValue(),
      'Bản nháp cần giữ',
    );
    assert.equal(
      calls.some((call) => call === 'POST /v1/trips'),
      false,
    );
    assert.deepEqual(f.errors, []);
  } finally {
    await f.context.close();
  }
});

test('public discovery requires no account; unpublished/missing detail never offers a planning action', async () => {
  const f = await setup({ width: 390, height: 844 }, false),
    { page } = f;
  await page.goto(base + '/explore');
  await page.getByRole('heading', { name: 'Ninh Bình', exact: true }).waitFor();
  await page.goto(base + '/explore/hidden-place');
  await page
    .getByText('Nội dung chưa được công bố hoặc không còn hiển thị.', { exact: false })
    .waitFor();
  assert.equal(await page.getByRole('link', { name: /^Lên lịch tại /, exact: true }).count(), 0);
  assert.deepEqual(f.errors, []);
  await f.context.close();
});

test('editorial handoff preserves changed-destination provider preview and creation mode across reload', async () => {
  const f = await setup({ width: 390, height: 844 });
  const { page, calls } = f;
  try {
    await page.goto(base + '/trips/new?content=' + destination.id);
    await page.getByRole('button', { name: 'Ninh Bình Việt Nam', exact: true }).waitFor();
    if (!(await page.getByLabel('Tìm điểm đến', { exact: true }).isVisible()))
      await page.getByRole('button', { name: 'Ninh Bình Việt Nam', exact: true }).click();
    await page.getByLabel('Tìm điểm đến', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Đà Nẵng', exact: true }).click();
    await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Đổi điểm đến từ nội dung');
    await page.getByLabel('Ngày bắt đầu', { exact: true }).fill('2099-10-20');
    await page.getByLabel('Số ngày', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Tạo lịch trình', exact: true }).click();
    await page.getByRole('heading', { name: 'Gợi ý cho Đà Nẵng', exact: true }).waitFor();
    const refetched = page.waitForResponse((response) =>
      response.url().endsWith('/v1/content/' + destination.id),
    );
    await page.reload();
    await refetched;
    await page.getByRole('heading', { name: 'Gợi ý cho Đà Nẵng', exact: true }).waitFor();
    // Going back also checks that a late editorial fetch did not change the restored creation mode.
    await page.getByRole('button', { name: 'Sửa thông tin chuyến', exact: true }).click();
    await page.getByRole('button', { name: 'Tạo lịch trình', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Xem lại lịch gợi ý', exact: true }).click();
    await page.getByRole('heading', { name: 'Gợi ý cho Đà Nẵng', exact: true }).waitFor();
    assert.equal(calls.filter((call) => call === 'POST /v1/discovery/preview').length, 1);
    assert.equal(
      calls.some((call) => call === 'POST /v1/trips'),
      false,
    );
    assert.equal(new URL(page.url()).searchParams.get('content'), destination.id);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.context.close();
  }
});

test('discovery pagination preserves keyword and topic, deduplicates records and clears old results on type change', async () => {
  const f = await setup({ width: 390, height: 844 });
  const { page, context } = f;
  const pages = [];
  const places = Array.from({ length: 19 }, (_, index) =>
    make('page-place-' + index, 'place', 'Ninh Bình ' + index),
  );
  try {
    await context.route('https://api.goease.test/v1/content?**', (route) => {
      const params = new URL(route.request().url()).searchParams;
      if (params.get('kind') === 'category')
        return route.fulfill({
          json: { apiVersion: '1', items: [records[1]], nextCursor: null },
          headers: { 'access-control-allow-origin': base },
        });
      pages.push(Object.fromEntries(params));
      const empty = params.get('kind') === 'food';
      return route.fulfill({
        json: {
          apiVersion: '1',
          items: empty ? [] : params.has('after') ? [places[17], places[18]] : places.slice(0, 18),
          nextCursor: empty || params.has('after') ? null : 'page-place-17',
        },
        headers: { 'access-control-allow-origin': base },
      });
    });
    await page.goto(base + '/explore?q=Ninh+B%C3%ACnh&kind=place&categoryId=nature');
    await page.getByRole('heading', { name: 'Ninh Bình 0', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Xem thêm nội dung', exact: true }).click();
    await page.getByRole('heading', { name: 'Ninh Bình 18', exact: true }).waitFor();
    assert.equal(await page.locator('.discovery-card-place').count(), 19);
    assert.equal(pages.at(-1).q, 'Ninh Bình');
    assert.equal(pages.at(-1).categoryId, 'nature');
    await page.getByRole('link', { name: 'Ẩm thực', exact: true }).click();
    await page.getByText('Chưa có nội dung phù hợp.', { exact: false }).waitFor();
    assert.equal(await page.locator('.discovery-card-place').count(), 0);
    assert.equal(await page.getByLabel('Tìm nội dung du lịch').inputValue(), 'Ninh Bình');
    assert.equal(new URL(page.url()).searchParams.get('categoryId'), 'nature');
    assert.equal(new URL(page.url()).searchParams.get('q'), 'Ninh Bình');
    assert.equal(
      await page.getByRole('button', { name: 'Xem thêm nội dung', exact: true }).count(),
      0,
    );
    assert.deepEqual(f.errors, []);
  } finally {
    await context.close();
  }
});

test('polished Home limits places/articles, prioritizes photographs and keeps page credits without image controls', async () => {
  const f = await setup({ width: 390, height: 844 }, false);
  const { page, context } = f;
  const illustrated = (id, kind, title) =>
    make(id, kind, title, {
      image: {
        url: 'https://images.example.test/' + id + '.jpg',
        alt: title,
        credit: 'Fixture photographer',
      },
    });
  const extra = [
    ...records,
    ...Array.from({ length: 6 }, (_, i) =>
      illustrated('polish-place-' + i, 'place', 'Địa điểm có ảnh ' + i),
    ),
    ...Array.from({ length: 3 }, (_, i) =>
      illustrated('polish-article-' + i, 'article', 'Cẩm nang có ảnh ' + i),
    ),
    illustrated('polish-food', 'food', 'Món ăn có ảnh'),
  ];
  try {
    await context.route('https://images.example.test/**', (route) => route.abort());
    await context.route('https://api.goease.test/v1/content?**', (route) => {
      const kind = new URL(route.request().url()).searchParams.get('kind');
      return route.fulfill({
        json: {
          apiVersion: '1',
          items: extra.filter((item) => !kind || item.entry.kind === kind).slice(0, 6),
          nextCursor: null,
        },
        headers: { 'access-control-allow-origin': base },
      });
    });
    await page.goto(base + '/');
    await page.getByRole('heading', { name: 'Địa điểm có ảnh 0', exact: true }).waitFor();
    assert.equal(await page.locator('.discovery-card-place').count(), 4);
    assert.equal(await page.locator('.discovery-card-article').count(), 2);
    assert.equal(
      await page.locator('.discovery-collection-food.discovery-collection-rail').count(),
      1,
    );
    assert.equal(
      await page.locator('.discovery-card-food h3').first().innerText(),
      'Món ăn có ảnh',
    );
    assert.equal(
      await page.locator('.discovery-card-place h3').filter({ hasText: 'Tràng An' }).count(),
      0,
    );
    assert.equal(await page.locator('.photo-credit-trigger, figure figcaption').count(), 0);
    // Broken photos do not claim to be displayed; credits track the actual fallback.
    await page.goto(base + '/explore/da-lat');
    // Missing content must not retain credits from the previous screen.
    await page.getByRole('button', { name: 'Thử mở lại', exact: true }).waitFor();
    assert.equal(await page.locator('.page-photo-credits').count(), 0);
    await page.goto(base + '/');
    await page.getByRole('heading', { name: 'Địa điểm có ảnh 0', exact: true }).waitFor();
    const food = page.locator('.discovery-card-food');
    await food.filter({ hasText: 'Món ăn có ảnh' }).locator('[data-image-state="error"]').waitFor();
    await food
      .filter({ hasText: 'Cơm cháy Ninh Bình' })
      .locator('[data-image-state="missing"]')
      .waitFor();
    await food
      .filter({ hasText: 'Món ăn có ảnh' })
      .getByRole('img', { name: 'Ảnh chưa tải được: Món ăn có ảnh' })
      .waitFor();
    await food
      .filter({ hasText: 'Cơm cháy Ninh Bình' })
      .getByRole('img', { name: 'Chưa có ảnh: Cơm cháy Ninh Bình' })
      .waitFor();
    await page
      .getByRole('region', { name: 'Địa điểm đáng ghé' })
      .getByRole('link', { name: 'Xem tất cả', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Tràng An', exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('kind'), 'place');
    assert.equal(await page.locator('.discovery-card-place').count(), 6);
    assert.deepEqual(f.errors, []);
  } finally {
    await context.close();
  }
});

test('detail and creation Back preserve search/topic context across cancellation and reload', async () => {
  const f = await setup({ width: 390, height: 844 });
  const { page } = f;
  try {
    const path = '/explore?q=Tr%C3%A0ng+An&kind=place&categoryId=nature';
    await page.goto(base + path);
    await page.getByRole('link', { name: 'Tràng An', exact: true }).click();
    await page.getByRole('link', { name: 'Lên lịch tại Ninh Bình', exact: true }).click();
    await page.getByRole('button', { name: 'Ninh Bình Việt Nam', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Hủy tạo chuyến', exact: true }).click();
    await page.getByRole('button', { name: 'Bỏ thông tin', exact: true }).click();
    await page.waitForURL(base + '/explore/trang-an');
    await page.reload();
    await page.locator('main article > a').first().click();
    await page.waitForURL(base + path);
    assert.equal(await page.getByLabel('Tìm nội dung du lịch').inputValue(), 'Tràng An');
    assert.deepEqual(f.errors, []);
  } finally {
    await f.context.close();
  }
});

test('same-page photo credits identify the displayed photo, preserve license and clear on navigation', async () => {
  const f = await setup({ width: 390, height: 844 });
  const { page, context } = f;
  const photo = make('credited-place', 'place', 'Ảnh có ghi công', {
    image: {
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Da_Lat_-_Xuan_Huong_Lake.jpg',
      alt: 'Hồ Xuân Hương',
      credit: 'P. Hughes · CC BY 4.0',
    },
    sources: [
      {
        title: 'Ảnh Hồ Xuân Hương',
        url: 'https://commons.wikimedia.org/wiki/File:Da_Lat_-_Xuan_Huong_Lake.jpg',
      },
    ],
  });
  try {
    await context.route('https://api.goease.test/v1/content/credited-place', (route) =>
      route.fulfill({ json: photo, headers: { 'access-control-allow-origin': base } }),
    );
    await page.goto(base + '/explore/credited-place');
    await page.getByRole('heading', { name: 'Ảnh có ghi công', exact: true }).waitFor();
    assert.equal(await page.locator('figure figcaption, .photo-credit-trigger').count(), 0);
    const credits = page.locator('.page-photo-credits');
    await credits.locator('summary').click();
    await credits.getByText('P. Hughes · CC BY 4.0', { exact: true }).waitFor();
    assert.equal(
      await credits.getByRole('link', { name: 'Nguồn ảnh ↗', exact: true }).getAttribute('href'),
      photo.entry.sources[0].url,
    );
    assert.equal(
      await credits.getByRole('link', { name: 'Giấy phép ↗', exact: true }).getAttribute('href'),
      'https://creativecommons.org/licenses/by/4.0',
    );
    await page.goto(base + '/about');
    assert.equal(await page.locator('.page-photo-credits').count(), 0);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.context.close();
  }
});

test('favorite lookup failure ends the loading label, blocks writes and recovers after reload', async () => {
  const f = await setup({ width: 390, height: 844 });
  const { page, context, calls } = f;
  let unavailable = true;
  try {
    await context.route('https://api.goease.test/v1/favorites', (route) =>
      unavailable
        ? route.fulfill({ status: 503, json: {}, headers: { 'access-control-allow-origin': base } })
        : route.fallback(),
    );
    await page.goto(base + '/explore/trang-an');
    const failed = page.getByRole('button', { name: 'Chưa tải được yêu thích', exact: true });
    await failed.waitFor();
    assert.equal(await failed.isEnabled(), false);
    await page.getByText('Chưa kiểm tra được trạng thái yêu thích.', { exact: false }).waitFor();
    assert.equal(
      calls.some((call) => call.startsWith('PUT /v1/favorites/')),
      false,
    );
    unavailable = false;
    await page.reload();
    const ready = page.getByRole('button', { name: 'Lưu yêu thích', exact: true });
    await ready.waitFor();
    assert.equal(await ready.isEnabled(), true);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.context.close();
  }
});
