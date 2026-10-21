import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { getDalatCatalog } from '@goease/catalog';

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
      'Điểm đến nổi bật',
      'Địa điểm đáng ghé',
      'Ẩm thực & đặc sản',
      'Cẩm nang du lịch',
    ])
      await page.getByRole('region', { name }).waitFor();
    await page.screenshot({
      path: root + `/test-results/content/home-${mode}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByLabel('Tìm cảm hứng cho chuyến tiếp theo').fill('Tràng An');
    await page.getByRole('button', { name: 'Tìm nội dung', exact: true }).click();
    await page.getByRole('heading', { name: 'Tràng An', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Điểm đến', exact: true }).click();
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
    await page.getByRole('link', { name: 'Lên kế hoạch ở đây', exact: true }).click();
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

test('public discovery requires no account; unpublished/missing detail never offers a planning action', async () => {
  const f = await setup({ width: 390, height: 844 }, false),
    { page } = f;
  await page.goto(base + '/explore');
  await page.getByRole('heading', { name: 'Ninh Bình', exact: true }).waitFor();
  await page.goto(base + '/explore/hidden-place');
  await page
    .getByText('Nội dung chưa được công bố hoặc không còn hiển thị.', { exact: false })
    .waitFor();
  assert.equal(
    await page.getByRole('link', { name: 'Lên kế hoạch ở đây', exact: true }).count(),
    0,
  );
  assert.deepEqual(f.errors, []);
  await f.context.close();
});
