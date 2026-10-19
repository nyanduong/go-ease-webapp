import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getDalatCatalog } from '@goease/catalog';
import { AI_LABEL, GEMINI_MODEL } from '@goease/contracts';
import { generateSampleTrip } from '@goease/itinerary';

const root = fileURLToPath(new URL('..', import.meta.url)),
  base = 'http://127.0.0.1:4186';
let server, browser;
before(async () => {
  server = await preview({
    root,
    configFile: false,
    build: { outDir: 'dist-test' },
    preview: { host: '127.0.0.1', port: 4186, strictPort: true },
  });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  if (server)
    await new Promise((resolve, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
});
let captureIndex = 0;
async function capture(context) {
  await mkdir(root + '/test-results', { recursive: true });
  for (const page of context.pages()) {
    const name = root + '/test-results/state-' + ++captureIndex;
    await page.screenshot({ path: name + '.png', fullPage: true }).catch(() => {});
    await writeFile(
      name + '.txt',
      await page
        .locator('body')
        .innerText()
        .catch(() => ''),
    ).catch(() => {});
  }
}
async function setup(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ...options,
  });
  // Offline SDK adapter double. No Google tile/API request leaves the browser test.
  await context.route('https://maps.googleapis.com/maps/api/js?*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
    window.goeaseMapCalls = { maps: [], pins: [] };
    window.google = { maps: {
      Map: class { constructor(element, options) { this.element = element; element.dataset.mapReady = 'true'; window.goeaseMapCalls.maps.push(options); } fitBounds() {} },
      LatLngBounds: class { extend() {} },
      importLibrary: async () => ({ AdvancedMarkerElement: class { constructor(options) { Object.assign(this, options); window.goeaseMapCalls.pins.push({ position: options.position, title: options.title }); } } }),
      event: { addListenerOnce: (_map, _name, callback) => queueMicrotask(callback), clearInstanceListeners() {} }
    } };
    window.goeaseMapsReady();
  `,
    }),
  );
  const page = await context.newPage(),
    errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  return { context, page, errors };
}
async function create(page, name = 'Đà Lạt cùng bạn', days = '2') {
  await page.goto(base + '/trips/new');
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill(name);
  await page.getByLabel('Số ngày', { exact: true }).fill(days);
  await page.getByLabel('Số người', { exact: true }).fill('5');
  await page.getByLabel('Ngân sách nhóm (VND)', { exact: true }).fill('10000000');
  await page.getByRole('button', { name: 'Tạo lịch trình mẫu', exact: true }).click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  await page.getByRole('heading', { level: 1, name }).waitFor();
  return page.url();
}
test('PWA guest CRUD, group budget, day movement, map links and persistence across reload', async () => {
  const { context, page, errors } = await setup();
  try {
    await page.goto(base + '/trips/new');
    await page.getByRole('button', { name: 'Tạo lịch trình mẫu', exact: true }).click();
    await page.getByText('Nhập tên chuyến từ 1 đến 80 ký tự.', { exact: true }).waitFor();
    const tripUrl = await create(page);
    await page.getByRole('tab', { name: 'Ngân sách', exact: true }).click();
    await page.getByText('Còn 4 khoản chưa có giá; tổng chưa đầy đủ.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).click();
    await page.getByRole('button', { name: 'Đổi ngân sách / số người', exact: true }).click();
    await page.getByLabel('Ngân sách nhóm (VND)', { exact: true }).fill('0');
    await page.getByRole('button', { name: 'Áp dụng ngân sách', exact: true }).click();
    await page.getByRole('tab', { name: 'Lịch trình', exact: true }).click();
    await page.getByRole('button', { name: '+ Thêm hoạt động', exact: true }).click();
    await page.getByLabel('Tên hoạt động', { exact: true }).fill('Cà phê tự chọn');
    await page.getByLabel('Chi phí cả nhóm (VND)', { exact: true }).fill('0');
    await page.getByRole('button', { name: 'Áp dụng hoạt động', exact: true }).click();
    await page.getByText('Miễn phí', { exact: false }).waitFor();
    await page.getByLabel('Đưa lên Cà phê tự chọn', { exact: true }).click();
    await page
      .getByLabel('Chuyển ngày Cà phê tự chọn', { exact: true })
      .selectOption({ label: 'Ngày 2' });
    await page.getByRole('button', { name: /^Ngày 2/ }).click();
    await page.getByRole('heading', { name: 'Cà phê tự chọn', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Lưu chuyến', exact: true }).click();
    await page.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: /^Ngày 2/ }).click();
    await page.getByRole('heading', { name: 'Cà phê tự chọn', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Bản đồ', exact: true }).click();
    await page.locator('[data-map-ready="true"]').waitFor();
    assert.equal(await page.evaluate(() => window.goeaseMapCalls.pins.length), 2);
    const direction = page.getByRole('link', { name: 'Mở chỉ đường Google Maps ↗' }).first();
    await direction.waitFor();
    assert.match(
      await direction.getAttribute('href'),
      /^https:\/\/www.google.com\/maps\/dir\/\?api=1&destination=/,
    );
    await page.getByText('Hoạt động tự nhập · Chưa có tọa độ', { exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Ngân sách', exact: true }).click();
    await page.getByRole('heading', { name: 'Ngân sách đặt ra: 0 đ', exact: true }).waitFor();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
        `No horizontal overflow at ${width}`,
      );
    }
    await mkdir(root + '/test-results', { recursive: true });
    await page.screenshot({
      path: root + '/test-results/pwa-budget-desktop.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: 'Lịch trình', exact: true }).click();
    await page.screenshot({
      path: root + '/test-results/pwa-itinerary-mobile.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Xóa chuyến', exact: true }).click();
    await page.waitForURL(base + '/trips');
    await page.reload();
    await page
      .getByRole('heading', {
        name: 'Hành trình đầu tiên đang chờ bạn',
        exact: true,
      })
      .waitFor();
    assert.notEqual(page.url(), tripUrl);
    assert.deepEqual(errors, []);
  } finally {
    await capture(context);
    await context.close();
  }
});
test('installed shell reloads a deep link offline and can create another guest trip; cache excludes private data', async () => {
  const { context, page, errors } = await setup();
  try {
    const tripUrl = await create(page, 'Chuyến ngoại tuyến', '1');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
        );
    });
    const cached = await page.evaluate(async () =>
      (
        await Promise.all(
          (await caches.keys()).map(async (name) =>
            (await (await caches.open(name)).keys()).map((item) => item.url),
          ),
        )
      ).flat(),
    );
    assert(cached.some((url) => url.endsWith('/index.html')));
    assert(
      cached.every(
        (url) => !url.includes('/v1/') && !url.includes('/auth/') && !url.includes('googleapis'),
      ),
    );
    await context.setOffline(true);
    await page.reload();
    await page
      .getByRole('heading', {
        level: 1,
        name: 'Chuyến ngoại tuyến',
        exact: true,
      })
      .waitFor();
    await page.getByText('Ngoại tuyến · Chuyến khách vẫn dùng được', { exact: true }).waitFor();
    await create(page, 'Tạo khi mất mạng', '1');
    assert.notEqual(page.url(), tripUrl);
    assert.deepEqual(errors, []);
  } finally {
    await capture(context);
    await context.close();
  }
});
test('two tabs cannot silently overwrite the same guest revision', async () => {
  const { context, page, errors } = await setup();
  try {
    const url = await create(page, 'Chuyến hai tab', '1'),
      other = await context.newPage();
    await other.goto(url);
    for (const [current, name] of [
      [page, 'Sửa từ tab A'],
      [other, 'Sửa từ tab B'],
    ]) {
      await current.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).click();
      await current.getByLabel('Tên chuyến đi', { exact: true }).fill(name);
      await current.getByRole('button', { name: 'Áp dụng tên', exact: true }).click();
    }
    await Promise.all(
      [page, other].map((current) =>
        current.getByRole('button', { name: 'Lưu chuyến', exact: true }).click(),
      ),
    );
    await Promise.all(
      [page, other].map((current) =>
        current.waitForFunction(
          () =>
            document.body.textContent.includes('Đã lưu chuyến.') ||
            document.body.textContent.includes('Chuyến đã thay đổi'),
        ),
      ),
    );
    const results = await Promise.all(
      [page, other].map((current) => current.locator('body').innerText()),
    );
    assert.equal(results.filter((text) => text.includes('Đã lưu chuyến.')).length, 1);
    assert.equal(results.filter((text) => text.includes('Chuyến đã thay đổi')).length, 1);
    assert.deepEqual(errors, []);
  } finally {
    await capture(context);
    await context.close();
  }
});
test('corrupt legacy storage is preserved and does not fall back to an empty writable store', async () => {
  const { context, page } = await setup();
  try {
    await context.addInitScript(() => localStorage.setItem('goease.guest-trips.v1', '{broken'));
    await page.goto(base + '/trips');
    await page
      .getByText('Kho chuyến không đọc được. Dữ liệu vẫn được giữ nguyên.', {
        exact: false,
      })
      .waitFor();
    assert.equal(
      await page.evaluate(() => localStorage.getItem('goease.guest-trips.v1')),
      '{broken',
    );
    await page.goto(base + '/trips/new');
    assert.equal(
      await page.getByRole('button', { name: 'Tạo lịch trình mẫu', exact: true }).isDisabled(),
      true,
    );
  } finally {
    await capture(context);
    await context.close();
  }
});
test('web manifest has real icons, standalone display and correct customer scope', async () => {
  const manifest = JSON.parse(await readFile(root + '/dist-test/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, '/');
  for (const icon of manifest.icons) {
    const bytes = await readFile(root + '/dist-test' + icon.src);
    assert.equal(bytes.readUInt32BE(16), Number(icon.sizes.split('x')[0]));
  }
});

test('storage write failure keeps input and permits a single successful retry', async () => {
  const { context, page, errors } = await setup();
  try {
    await context.addInitScript(() => {
      const put = IDBObjectStore.prototype.put;
      window.goeaseFailWrite = true;
      IDBObjectStore.prototype.put = function (...args) {
        if (window.goeaseFailWrite) throw Error('offline fixture disk full');
        return put.apply(this, args);
      };
    });
    await page.goto(base + '/trips/new');
    await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Giữ nội dung khi lỗi lưu');
    await page.getByRole('button', { name: 'Tạo lịch trình mẫu', exact: true }).click();
    await page
      .getByText('Không lưu được chuyến. Nội dung chưa lưu vẫn được giữ để thử lại.', {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.getByLabel('Tên chuyến đi', { exact: true }).inputValue(),
      'Giữ nội dung khi lỗi lưu',
    );
    await page.evaluate(() => {
      window.goeaseFailWrite = false;
    });
    await page.getByRole('button', { name: 'Tạo lịch trình mẫu', exact: true }).click();
    await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
    await page.goto(base + '/trips');
    await page.getByRole('heading', { name: '1 chuyến đã lưu', exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await capture(context);
    await context.close();
  }
});

const userId = '12345678-1234-4234-8234-123456789abc';
async function accountFixture(context) {
  const records = new Map(),
    writes = [];
  let loseReply = true;
  const fulfill = (route, json, status = 200) =>
    route.fulfill({
      status,
      json,
      headers: {
        'access-control-allow-origin': base,
        'access-control-allow-headers': 'authorization,content-type,apikey',
        'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      },
    });
  await context.route('https://abcdefghijklmnopqrst.supabase.co/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfill(route, {});
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token'))
      return fulfill(route, {
        token_type: 'bearer',
        access_token: 'offline.fixture.signature',
        refresh_token: 'fixture_refresh',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
    if (path.endsWith('/user'))
      return fulfill(route, {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        is_anonymous: false,
      });
    return route.fulfill({
      status: 204,
      headers: { 'access-control-allow-origin': base },
    });
  });
  await context.route('https://api.goease.test/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return fulfill(route, {});
    if (path === '/v1/auth/me')
      return fulfill(route, {
        apiVersion: '1',
        identity: { id: userId, provider: 'supabase' },
      });
    if (path === '/v1/catalog/places')
      return fulfill(route, {
        apiVersion: '1',
        places: getDalatCatalog().map((entry) => ({
          entry,
          enabled: true,
          version: 1,
        })),
      });
    if (path === '/v1/trips' && request.method() === 'GET')
      return fulfill(route, {
        apiVersion: '1',
        nextCursor: null,
        items: [...records.values()].map(({ trip, version, updatedAt }) => ({
          id: trip.id,
          name: trip.name,
          startDate: trip.startDate,
          durationDays: trip.durationDays,
          people: trip.people,
          version,
          updatedAt,
        })),
      });
    if (path === '/v1/trips' && request.method() === 'POST') {
      const body = request.postDataJSON();
      writes.push(body);
      const replayed = records.has(body.trip.id),
        saved = records.get(body.trip.id) ?? {
          trip: body.trip,
          version: 1,
          updatedAt: new Date().toISOString(),
        };
      records.set(body.trip.id, saved);
      if (loseReply) {
        loseReply = false;
        return route.abort('failed');
      }
      return fulfill(
        route,
        {
          apiVersion: '1',
          mutationId: body.mutationId,
          replayed,
          result: { ...saved, kind: 'saved' },
        },
        201,
      );
    }
    const saved = records.get(path.split('/').at(-1));
    if (saved) return fulfill(route, { apiVersion: '1', ...saved });
    return fulfill(route, {}, 404);
  });
  return { records, writes };
}
test('account browser session, owner-bound drafts, explicit lost-response retry and guest isolation', async () => {
  const { context, page, errors } = await setup();
  try {
    const fixture = await accountFixture(context);
    await create(page, 'Chuyến khách gốc', '1');
    await page.goto(base + '/account');
    await page.getByLabel('Email GoEase', { exact: true }).fill('user@example.test');
    await page.getByLabel('Mật khẩu GoEase', { exact: true }).fill('offline_fixture_password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('heading', { name: 'Góc hành trình của bạn', exact: true }).waitFor();
    await page.getByText('Nhập chuyến từ thiết bị · 1 chuyến khách', { exact: true }).click();
    await page
      .getByRole('button', {
        name: 'Nhập bản sao: Chuyến khách gốc',
        exact: true,
      })
      .click();
    await page.getByRole('button', { name: 'Lưu bản nháp lên server', exact: true }).waitFor();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.getByRole('heading', { name: 'Chào mừng bạn trở lại', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('heading', { name: 'Chuyến khách gốc', exact: true }).count(),
      0,
    );
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
    });
    await page.getByRole('button', { name: 'Khôi phục phiên', exact: true }).click();
    await page.getByRole('button', { name: 'Lưu bản nháp lên server', exact: true }).click();
    await page.getByRole('button', { name: 'Thử lại đúng yêu cầu đã gửi', exact: true }).waitFor();
    await page
      .getByText('Giữ nguyên yêu cầu để thử lại sau khi đăng nhập/kết nối lại.', { exact: false })
      .waitFor();
    assert.equal(fixture.writes.length, 1);
    await page.getByRole('button', { name: 'Thử lại đúng yêu cầu đã gửi', exact: true }).click();
    await page.getByText('Đã nhận biên nhận cũ.', { exact: false }).waitFor();
    assert.equal(fixture.writes.length, 2);
    assert.deepEqual(fixture.writes[0], fixture.writes[1]);
    await page.getByRole('button', { name: 'Tải lại danh sách server', exact: true }).click();
    await page
      .getByRole('button', {
        name: 'Mở chuyến tài khoản: Chuyến khách gốc',
        exact: true,
      })
      .click();
    await page.getByRole('heading', { level: 1, name: 'Chuyến khách gốc', exact: true }).waitFor();
    const stored = await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }));
    assert.equal(JSON.stringify(stored.local).includes('fixture_refresh'), false);
    assert.equal(JSON.stringify(stored.session).includes('fixture_refresh'), true);
    await page
      .getByRole('button', {
        name: 'Đăng xuất / xóa phiên trên tab',
        exact: true,
      })
      .click();
    await page.getByRole('heading', { name: 'Chào mừng bạn trở lại', exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() =>
        Object.values(sessionStorage).some((value) => value.includes('fixture_refresh')),
      ),
      false,
    );
    await page.goto(base + '/trips');
    await page.getByRole('heading', { name: '1 chuyến đã lưu', exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await capture(context);
    await context.close();
  }
});
test('AI demo stays preview-only until saved and never repeats provider calls to save', async () => {
  const { context, page, errors } = await setup();
  let calls = 0;
  try {
    await context.route('https://ai.goease.test/**', (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS')
        return route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': base,
            'access-control-allow-headers': 'authorization,content-type',
            'access-control-allow-methods': 'POST,OPTIONS',
          },
        });
      calls++;
      const input = request.postDataJSON(),
        generated = generateSampleTrip(input, getDalatCatalog(), {
          tripId: 'provider-fixture',
          today: input.startDate,
        });
      assert.equal(generated.ok, true);
      return route.fulfill({
        json: {
          apiVersion: '1',
          kind: 'ai',
          provider: 'gemini',
          model: GEMINI_MODEL,
          policyVersion: 1,
          label: AI_LABEL,
          trip: { ...generated.trip, generationSource: 'ai' },
          budget: generated.budget,
          warnings: ['Offline provider fixture; not a live Gemini call.'],
        },
        headers: { 'access-control-allow-origin': base },
      });
    });
    await page.goto(base + '/trips/new');
    await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Chuyến AI thử nghiệm');
    await page.getByText('Gợi ý bằng Gemini · Phiên nội bộ', { exact: true }).click();
    await page
      .getByLabel('Mã phiên AI nội bộ', { exact: true })
      .fill('offline_fixture_session_code');
    await page.getByRole('button', { name: 'Đề xuất lịch trình', exact: true }).click();
    await page.getByRole('button', { name: 'Lưu chuyến AI / thử lưu lại', exact: true }).waitFor();
    assert.equal(calls, 1);
    assert.equal(new URL(page.url()).pathname, '/trips/new');
    await page.getByRole('button', { name: 'Lưu chuyến AI / thử lưu lại', exact: true }).click();
    await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
    assert.equal(calls, 1);
    await page.reload();
    await page.getByRole('tab', { name: 'Thông tin', exact: true }).click();
    await page.getByText('Lịch trình gợi ý bằng AI', { exact: false }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await capture(context);
    await context.close();
  }
});

test('map SDK failure preserves location list and explicit retry can draw the day pins', async () => {
  const { context, page, errors } = await setup();
  let failed = false;
  try {
    await context.route('https://maps.googleapis.com/maps/api/js?*', (route) => {
      if (!failed) {
        failed = true;
        return route.abort('failed');
      }
      return route.fallback();
    });
    await create(page, 'Thử lỗi bản đồ', '1');
    await page.getByRole('tab', { name: 'Bản đồ', exact: true }).click();
    await page.getByText('Không kết nối được Google Maps.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Mở chỉ đường Google Maps ↗' }).count(), 2);
    await page.getByRole('button', { name: 'Tải lại bản đồ', exact: true }).click();
    await page.locator('[data-map-ready="true"]').waitFor();
    assert.equal(await page.evaluate(() => window.goeaseMapCalls.pins.length), 2);
    assert.deepEqual(errors, []);
  } finally {
    await capture(context);
    await context.close();
  }
});
test('long names fit mobile, and cancelling navigation keeps an unapplied form', async () => {
  const { context, page, errors } = await setup({
    viewport: { width: 320, height: 740 },
  });
  try {
    const url = await create(page, 'X'.repeat(80), '1');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).click();
    await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Chưa áp dụng');
    page.removeAllListeners('dialog');
    page.on('dialog', (dialog) => dialog.dismiss());
    await page
      .getByRole('navigation', { name: 'Điều hướng chính' })
      .getByRole('link', { name: 'Trang chủ', exact: true })
      .click();
    assert.equal(page.url(), url);
    assert.equal(
      await page.getByLabel('Tên chuyến đi', { exact: true }).inputValue(),
      'Chưa áp dụng',
    );
    page.removeAllListeners('dialog');
    page.on('dialog', (dialog) => dialog.accept());
    await page
      .getByRole('navigation', { name: 'Điều hướng chính' })
      .getByRole('link', { name: 'Trang chủ', exact: true })
      .click();
    await page.waitForURL(base + '/');
    assert.deepEqual(errors, []);
  } finally {
    await capture(context);
    await context.close();
  }
});

test('desktop and mobile use distinct layouts, with reduced-motion support', async () => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const { context, page, errors } = await setup({
      viewport: { width: 1440, height: 960 },
      reducedMotion,
    });
    try {
      await context.addInitScript(() => {
        window.goeaseMotionCalls = 0;
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (...args) {
          window.goeaseMotionCalls++;
          return animate.apply(this, args);
        };
      });
      await page.goto(base + '/');
      await page.getByRole('heading', { level: 1 }).waitFor();
      const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
      let bounds = await nav.boundingBox();
      assert.equal(bounds.x, 0);
      assert.equal(bounds.y, 0);
      assert.equal(bounds.width, 256);
      assert.equal(bounds.height, 960);
      assert.equal(
        await page.getByRole('complementary', { name: 'Tổng quan chuyến đi' }).isVisible(),
        true,
      );
      const count = await page.evaluate(() => window.goeaseMotionCalls);
      assert.equal(reducedMotion === 'reduce' ? count === 0 : count > 0, true);
      await page.goto(base + '/trips/new');
      await page.getByRole('heading', { level: 1 }).waitFor();
      assert.equal(
        await page.getByRole('complementary', { name: 'Hướng dẫn lên kế hoạch' }).isVisible(),
        true,
      );
      await create(page, 'Đà Lạt cuối tuần', '3');
      assert.equal(
        await page.getByRole('complementary', { name: 'Tóm tắt chuyến đi' }).isVisible(),
        true,
      );
      if (reducedMotion === 'reduce')
        assert.equal(await page.evaluate(() => window.goeaseMotionCalls), 0);
      await page.goto(base + '/');
      await page.getByRole('heading', { name: 'Đà Lạt cuối tuần', exact: true }).first().waitFor();
      await page.screenshot({
        path: root + '/test-results/pwa-home-desktop.png',
        fullPage: true,
        animations: 'disabled',
      });
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 960 });
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          'Fits viewport ' + width,
        );
        if (width < 1024) {
          bounds = await nav.boundingBox();
          assert(bounds.y > 850);
          assert.equal(Math.round(bounds.width), width);
          assert.equal(
            await page.getByRole('complementary', { name: 'Tổng quan chuyến đi' }).isVisible(),
            false,
          );
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: root + '/test-results/pwa-home-mobile.png',
        fullPage: true,
        animations: 'disabled',
      });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
});
