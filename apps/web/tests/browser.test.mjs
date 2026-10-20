import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getDalatCatalog } from '@goease/catalog';
const root = fileURLToPath(new URL('..', import.meta.url)),
  base = 'http://127.0.0.1:4186';
const authOrigin = 'https://abcdefghijklmnopqrst.supabase.co';
const ids = {
  A: '12345678-1234-4234-8234-123456789abc',
  B: '22345678-1234-4234-8234-123456789abc',
};
const tokens = Object.fromEntries(
  Object.entries(ids).map(([key, id]) => [
    key,
    Buffer.from('{"alg":"ES256"}').toString('base64url') +
      '.' +
      Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString(
        'base64url',
      ) +
      '.fixture_signature',
  ]),
);
let server, browser;
before(async () => {
  server = await preview({
    root,
    configFile: false,
    build: { outDir: 'dist-test' },
    preview: { host: '127.0.0.1', port: 4186, strictPort: true },
  });
  browser = await chromium.launch();
  await mkdir(root + '/test-results', { recursive: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
});
function fixtureUser(key = 'A') {
  return {
    id: ids[key],
    aud: 'authenticated',
    role: 'authenticated',
    is_anonymous: false,
    identities: [{ provider: 'google', id: ids[key] }],
    app_metadata: { provider: 'google', providers: ['google'] },
    email: key === 'A' ? 'ban.a@example.test' : 'ban.b@example.test',
    user_metadata: {
      full_name: key === 'A' ? 'Bạn A' : 'Bạn B',
      avatar_url: 'https://lh3.googleusercontent.com/fixture-avatar',
    },
    created_at: new Date().toISOString(),
  };
}
async function setup(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    page = await context.newPage();
  context.setDefaultTimeout(10000);
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  const state = {
    owner: 'A',
    records: new Map(),
    writes: [],
    receipts: new Map(),
    authorize: [],
    exchange: [],
    cancelled: false,
    mismatch: false,
    lose: false,
    mapFail: false,
    profiles: new Map(),
    profileWrites: [],
    profileFail: false,
    shortSession: false,
    refreshes: [],
    rejectRefresh: false,
    backendUnavailable: false,
    catalogBlock: null,
    catalogUnavailable: false,
    refreshBusy: 0,
    maxRefreshBusy: 0,
  };
  const codes = new Map();
  const cors = {
    'access-control-allow-origin': base,
    'access-control-allow-headers':
      'authorization,content-type,apikey,x-client-info,x-supabase-api-version',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  };
  const reply = (route, json, status = 200) => route.fulfill({ status, json, headers: cors });
  const fail = (route, status, code) =>
    reply(
      route,
      {
        apiVersion: '1',
        statusCode: status,
        error: { code, message: 'Offline fixture', requestId: randomUUID() },
      },
      status,
    );
  await context.route(authOrigin + '/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (request.method() === 'OPTIONS') return reply(route, {});
    if (url.pathname === '/auth/v1/authorize') {
      assert.equal(url.searchParams.get('provider'), 'google');
      assert.equal(url.searchParams.get('code_challenge_method'), 's256');
      state.authorize.push(url.href);
      const callback = new URL(url.searchParams.get('redirect_to'));
      const code = randomUUID();
      codes.set(code, { challenge: url.searchParams.get('code_challenge'), owner: state.owner });
      if (state.cancelled) callback.searchParams.set('error', 'access_denied');
      else callback.searchParams.set('code', code);
      return route.fulfill({
        contentType: 'text/html',
        body: `<script>location.replace(${JSON.stringify(callback.href)})</script>`,
      });
    }
    if (url.pathname === '/auth/v1/token') {
      const body = request.postDataJSON();
      let owner = state.owner;
      if (url.searchParams.get('grant_type') === 'pkce') {
        const saved = codes.get(body.auth_code);
        assert(saved, 'One-use auth code');
        codes.delete(body.auth_code);
        assert.equal(
          createHash('sha256').update(body.code_verifier).digest('base64url'),
          saved.challenge,
        );
        owner = saved.owner;
        state.exchange.push(body);
      } else if (url.searchParams.get('grant_type') === 'refresh_token') {
        state.refreshes.push(body.refresh_token);
        state.refreshBusy++;
        state.maxRefreshBusy = Math.max(state.maxRefreshBusy, state.refreshBusy);
        if (state.rejectRefresh) {
          state.refreshBusy--;
          return reply(route, {}, 400);
        }
        // Scheduling delay exposes refresh overlap between browser tabs in this fixture.
        await new Promise((resolve) => setTimeout(resolve, 30));
        state.refreshBusy--;
        owner = body.refresh_token.endsWith('_B') ? 'B' : 'A';
      } else assert.fail('Password login is not allowed');
      return reply(route, {
        token_type: 'bearer',
        access_token: tokens[owner],
        refresh_token: 'fixture_refresh_' + owner,
        expires_in: state.shortSession && url.searchParams.get('grant_type') === 'pkce' ? 90 : 3600,
        expires_at:
          Math.floor(Date.now() / 1000) +
          (state.shortSession && url.searchParams.get('grant_type') === 'pkce' ? 90 : 3600),
        user: fixtureUser(owner),
      });
    }
    if (url.pathname === '/auth/v1/user') {
      const owner = request.headers().authorization === 'Bearer ' + tokens.B ? 'B' : 'A';
      if (request.method() === 'PUT') {
        const body = request.postDataJSON();
        state.profileWrites.push({ owner, body });
        if (state.profileFail) return reply(route, {}, 503);
        assert.deepEqual(Object.keys(body), ['data']);
        assert.deepEqual(Object.keys(body.data), ['goease_profile']);
        state.profiles.set(owner, body.data.goease_profile);
      }
      const user = fixtureUser(owner);
      if (state.profiles.has(owner)) user.user_metadata.goease_profile = state.profiles.get(owner);
      return reply(route, user);
    }
    return route.fulfill({ status: 204, headers: cors });
  });
  await context.route('https://api.goease.test/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      method = request.method();
    if (method === 'OPTIONS') return reply(route, {});
    const owner = request.headers().authorization === 'Bearer ' + tokens.B ? 'B' : 'A';
    if (url.pathname === '/v1/auth/me' && state.backendUnavailable)
      return fail(route, 503, 'AUTH_UNAVAILABLE');
    if (url.pathname === '/v1/auth/me')
      return reply(route, {
        apiVersion: '1',
        identity: { id: ids[state.mismatch ? 'B' : owner], provider: 'supabase' },
      });
    if (url.pathname === '/v1/catalog/places') {
      await state.catalogBlock;
      if (state.catalogUnavailable) return fail(route, 503, 'CATALOG_UNAVAILABLE');
      return reply(route, {
        apiVersion: '1',
        places: getDalatCatalog().map((entry) => ({ entry, enabled: true, version: 1 })),
      });
    }
    if (url.pathname === '/v1/trips' && method === 'GET')
      return reply(route, {
        apiVersion: '1',
        nextCursor: null,
        items: [...state.records.values()]
          .filter((record) => record.owner === owner)
          .map(({ trip, version, updatedAt }) => ({
            id: trip.id,
            name: trip.name,
            startDate: trip.startDate,
            durationDays: trip.durationDays,
            people: trip.people,
            version,
            updatedAt,
          })),
      });
    const id = url.pathname.split('/').at(-1),
      record = state.records.get(id);
    if (method === 'GET')
      return record?.owner === owner
        ? reply(route, {
            apiVersion: '1',
            trip: record.trip,
            version: record.version,
            updatedAt: record.updatedAt,
          })
        : fail(route, 404, 'NOT_FOUND');
    const body = request.postDataJSON();
    state.writes.push({ owner, method, body });
    const receiptKey = owner + body.mutationId;
    if (state.receipts.has(receiptKey))
      return reply(
        route,
        { ...state.receipts.get(receiptKey), replayed: true },
        method === 'POST' ? 201 : 200,
      );
    if (method !== 'POST' && (!record || record.owner !== owner))
      return fail(route, 404, 'NOT_FOUND');
    if (method !== 'POST' && body.expectedVersion !== record.version)
      return fail(route, 409, 'VERSION_CONFLICT');
    let result;
    if (method === 'DELETE') {
      state.records.delete(id);
      result = {
        kind: 'deleted',
        id,
        version: record.version + 1,
        deletedAt: new Date().toISOString(),
      };
    } else {
      const saved = {
        owner,
        trip: body.trip,
        version: (record?.version ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      state.records.set(body.trip.id, saved);
      result = {
        kind: 'saved',
        trip: saved.trip,
        version: saved.version,
        updatedAt: saved.updatedAt,
      };
    }
    const receipt = { apiVersion: '1', mutationId: body.mutationId, replayed: false, result };
    state.receipts.set(receiptKey, receipt);
    if (state.lose) {
      state.lose = false;
      return route.abort('failed');
    }
    return reply(route, receipt, method === 'POST' ? 201 : 200);
  });
  await context.route('https://maps.googleapis.com/maps/api/js?*', (route) =>
    state.mapFail
      ? route.abort('failed')
      : route.fulfill({
          contentType: 'application/javascript',
          body: `window.goeaseMapCalls={pins:[]};window.google={maps:{Map:class{constructor(el){el.dataset.mapReady='true'}fitBounds(){}},LatLngBounds:class{extend(){}},importLibrary:async()=>({AdvancedMarkerElement:class{constructor(options){window.goeaseMapCalls.pins.push(options.title)}}}),event:{addListenerOnce:(m,n,cb)=>queueMicrotask(cb),clearInstanceListeners(){}}}};window.goeaseMapsReady();`,
        }),
  );
  return { context, page, errors, state, ...options };
}
async function login(page, path = '/trips') {
  await page.goto(base + path);
  await page.getByRole('button', { name: 'Tiếp tục với Google', exact: true }).click();
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).waitFor();
}
async function create(page, name = 'Đà Lạt cùng bạn', days = '2') {
  await page.goto(base + '/trips/new');
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill(name);
  await page.getByLabel('Số ngày', { exact: true }).fill(days);
  await page.getByLabel('Số người', { exact: true }).fill('5');
  await page.getByLabel('Ngân sách nhóm (VND)', { exact: true }).fill('10000000');
  await page.getByRole('button', { name: 'Tạo lịch trình', exact: true }).click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await page.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).waitFor();
  return page.url();
}
async function finish({ context, page, errors }, name) {
  try {
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          window.scrollTo(0, 0);
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
    await page.screenshot({
      path: root + '/test-results/' + name + '.png',
      fullPage: true,
      animations: 'disabled',
    });
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

test('all private deep links require Google; legacy local/IndexedDB bytes remain unassigned and unchanged', async () => {
  const f = await setup(),
    { page, context, state } = f;
  await context.addInitScript(() =>
    localStorage.setItem('goease.guest-trips.v1', 'legacy-private-bytes'),
  );
  await page.goto(base + '/');
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('goease.customer.v1', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('values');
      open.onsuccess = () => {
        const db = open.result,
          tx = db.transaction('values', 'readwrite');
        tx.objectStore('values').put('legacy-idb-bytes', 'goease.guest-trips.v1');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = reject;
      };
    });
  });
  for (const path of [
    '/',
    '/trips',
    '/trips/new',
    '/trips/private-trip',
    '/account',
    '/about',
    '/travel-services',
  ]) {
    await page.goto(base + path);
    await page.getByRole('button', { name: 'Tiếp tục với Google', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Tiếp tục với Google', exact: true }).isEnabled(),
      true,
    );
    assert.equal(await page.locator('.postcard-signin [role="status"]').count(), 0);
    assert.equal(await page.getByText('Chưa đăng nhập được. Vui lòng thử lại.').count(), 0);
    assert.equal(await page.getByRole('navigation', { name: 'Điều hướng chính' }).count(), 0);
    assert.equal(await page.locator('input[type=password]').count(), 0);
  }
  await login(page);
  assert.equal(state.records.size, 0);
  assert.equal(state.writes.length, 0);
  assert.equal(
    await page.evaluate(() => localStorage.getItem('goease.guest-trips.v1')),
    'legacy-private-bytes',
  );
  assert.equal(
    await page.evaluate(
      async () =>
        new Promise((resolve) => {
          const open = indexedDB.open('goease.customer.v1');
          open.onsuccess = () => {
            const db = open.result,
              tx = db.transaction('values', 'readonly'),
              read = tx.objectStore('values').get('goease.guest-trips.v1');
            read.onsuccess = () => {
              resolve(read.result);
              db.close();
            };
          };
        }),
    ),
    'legacy-idb-bytes',
  );
  assert.equal(await page.getByText(/Nhập chuyến từ thiết bị/).count(), 0);
  await finish(f, 'google-gate');
});

test('phone login fits narrow and short screens with a visible touch-sized Google button', async () => {
  const f = await setup(),
    { page } = f;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [430, 932],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(base + '/login');
    const button = page.getByRole('button', { name: 'Tiếp tục với Google', exact: true });
    await button.waitFor();
    const bounds = await button.boundingBox();
    assert(bounds && bounds.height >= 48 && bounds.y + bounds.height <= height);
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    const picture = await page.locator('.dalat-postcard').boundingBox();
    assert(picture && picture.y + picture.height < bounds.y);
  }
  await finish(f, 'phone-login');
});

test('Back from Google without login restores an idle login page and permits another attempt', async () => {
  const f = await setup(),
    { page, state } = f;
  await page.route(authOrigin + '/auth/v1/authorize?**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Google account selection</h1>' }),
  );
  await page.goto(base + '/login');
  await page.getByRole('button', { name: 'Tiếp tục với Google', exact: true }).click();
  await page.getByRole('heading', { name: 'Google account selection' }).waitFor();
  await page.goBack();
  const button = page.getByRole('button', { name: 'Tiếp tục với Google', exact: true });
  await button.waitFor();
  assert.equal(await button.isEnabled(), true);
  assert.equal(await page.locator('.postcard-signin [role="status"]').count(), 0);
  assert.equal(await page.getByText('Chưa đăng nhập được. Vui lòng thử lại.').count(), 0);
  assert.equal(
    await page.evaluate(() =>
      Object.keys(sessionStorage).some((key) => /google-flow|code-verifier/.test(key)),
    ),
    false,
  );
  await page.unroute(authOrigin + '/auth/v1/authorize?**');
  await button.click();
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).waitFor();
  assert.equal(state.exchange.length, 1);
  await finish(f, 'google-back');
});

test('PKCE roundtrip verifies provider/backend, strips callback and never persists access/provider tokens', async () => {
  const f = await setup(),
    { page, state } = f;
  await login(page, '/trips/new');
  await page.getByRole('heading', { name: 'Lên lịch trình Đà Lạt', exact: true }).waitFor();
  assert.equal(state.exchange.length, 1);
  assert(!page.url().includes('code='));
  assert(!page.url().includes('flow='));
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  assert(!JSON.stringify(storage).includes(tokens.A));
  assert(JSON.stringify(storage.local).includes('fixture_refresh_A'));
  assert(!JSON.stringify(storage).includes('code-verifier'));
  assert(!JSON.stringify(storage).includes('google-flow'));
  await finish(f, 'google-login');
});

test('cancelled, missing, expired, tampered and replayed callbacks never open private app', async () => {
  const f = await setup(),
    { page, state } = f;
  state.cancelled = true;
  await page.goto(base + '/trips');
  await page.getByRole('button', { name: 'Tiếp tục với Google', exact: true }).click();
  await page.getByText('Chưa đăng nhập được. Vui lòng thử lại.', { exact: true }).waitFor();
  for (const suffix of [
    '?code=orphan&flow=wrong',
    '?error=access_denied',
    '?code=x&flow=y#access_token=do-not-accept',
  ]) {
    await page.goto(base + '/auth/callback' + suffix);
    await page.getByRole('button', { name: 'Tiếp tục với Google', exact: true }).waitFor();
    assert.equal(await page.getByRole('navigation').count(), 0);
    assert.equal(page.url(), base + '/login');
  }
  assert.equal(state.exchange.length, 0);
  await finish(f, 'google-cancel');
});

test('backend identity mismatch keeps the whole app locked', async () => {
  const f = await setup();
  f.state.mismatch = true;
  await f.page.goto(base + '/trips');
  await f.page.getByRole('button', { name: 'Tiếp tục với Google', exact: true }).click();
  await f.page.getByText('Chưa đăng nhập được. Vui lòng thử lại.', { exact: true }).waitFor();
  assert.equal(await f.page.getByRole('navigation').count(), 0);
  await finish(f, 'google-mismatch');
});

test('account-only create/edit/budget/day movement/maps/save/reload/delete works', async () => {
  const f = await setup(),
    { page, state } = f;
  await login(page);
  assert.doesNotMatch(
    await page.locator('body').innerText(),
    /server|backend|UUID|mutationId|Phiên bản/i,
  );
  await create(page);
  assert.equal(state.records.size, 1);
  assert.equal(state.writes[0].method, 'POST');
  await page.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).click();
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Đà Lạt mùa thu');
  await page.getByRole('tab', { name: 'Ngân sách', exact: true }).click();
  await page.getByLabel('Ngân sách nhóm (VND)', { exact: true }).fill('0');
  await page.getByRole('tab', { name: 'Lịch trình', exact: true }).click();
  await page.getByRole('button', { name: '+ Thêm hoạt động', exact: true }).click();
  await page.getByLabel('Tên hoạt động', { exact: true }).fill('Cà phê tự chọn');
  await page.getByLabel('Chi phí cả nhóm (VND)', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Thu gọn chỉnh sửa', exact: true }).click();
  await page
    .getByLabel('Chuyển ngày Cà phê tự chọn', { exact: true })
    .selectOption({ label: 'Ngày 2' });
  await page.getByRole('button', { name: /^Ngày 2/ }).click();
  assert.equal(state.writes.length, 1, 'Editing only checkpoints local owner draft');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await page.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { level: 1, name: 'Đà Lạt mùa thu', exact: true }).waitFor();
  assert.doesNotMatch(
    await page.locator('body').innerText(),
    /server|backend|UUID|mutationId|Phiên bản/i,
  );
  await page.getByRole('button', { name: /^Ngày 2/ }).click();
  await page.getByRole('heading', { name: 'Cà phê tự chọn', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Bản đồ', exact: true }).click();
  await page.locator('[data-map-ready=true]').waitFor();
  assert.equal(await page.evaluate(() => window.goeaseMapCalls.pins.length), 2);
  assert.match(
    await page
      .getByRole('link', { name: 'Mở chỉ đường Google Maps ↗' })
      .first()
      .getAttribute('href'),
    /^https:\/\/www.google.com\/maps\/dir/,
  );
  await page.getByRole('tab', { name: 'Ngân sách', exact: true }).click();
  await page.getByRole('heading', { name: 'Ngân sách đặt ra: 0 đ', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Xóa chuyến', exact: true }).click();
  await page.waitForURL(base + '/trips');
  assert.equal(state.records.size, 0);
  await finish(f, 'account-crud');
});

test('raw invalid input survives tabs/days; validation blocks writes, then one Save commits and Cancel restores', async () => {
  const f = await setup(),
    { page, state } = f;
  await login(page);
  await create(page, 'Giữ bản nháp');
  await page.getByRole('button', { name: /^Ngày 2/ }).click();
  const name = await page.getByRole('heading', { level: 3 }).first().innerText();
  await page.getByRole('button', { name: 'Sửa ' + name, exact: true }).click();
  await page.getByLabel('Chi phí cả nhóm (VND)', { exact: true }).fill('12.000');
  await page.getByLabel('Ghi chú', { exact: true }).fill('Nội dung đang sửa');
  for (const tab of ['Ngân sách', 'Bản đồ', 'Thông tin', 'Lịch trình'])
    await page.getByRole('tab', { name: tab, exact: true }).click();
  await page.getByRole('button', { name: /^Ngày 1/ }).click();
  await page.getByRole('button', { name: /^Ngày 2/ }).click();
  assert.equal(
    await page.getByLabel('Chi phí cả nhóm (VND)', { exact: true }).inputValue(),
    '12.000',
  );
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await page
    .getByText('Chưa lưu thay đổi. Kiểm tra các mục được đánh dấu.', { exact: true })
    .waitFor();
  assert.equal(state.writes.length, 1);
  await page.getByLabel('Chi phí cả nhóm (VND)', { exact: true }).fill('12000');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await page.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).click();
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Tên bị hủy');
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await page.getByRole('heading', { level: 1, name: 'Giữ bản nháp', exact: true }).waitFor();
  assert.equal(state.writes.length, 2);
  await finish(f, 'account-edit');
});

test('lost response uses the exact durable mutation on explicit retry without duplicate trips', async () => {
  const f = await setup(),
    { page, state } = f;
  await login(page);
  state.lose = true;
  await page.goto(base + '/trips/new');
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Một chuyến duy nhất');
  await page.getByRole('button', { name: 'Tạo lịch trình', exact: true }).click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await page.getByRole('button', { name: 'Thử lưu lại', exact: true }).waitFor();
  assert.doesNotMatch(
    await page.locator('body').innerText(),
    /server|backend|mutationId|NETWORK|5xx/i,
  );
  assert.equal(state.writes.length, 1);
  await page.reload();
  await page.getByRole('button', { name: 'Thử lưu lại', exact: true }).click();
  await page.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).waitFor();
  assert.equal(state.records.size, 1);
  assert.deepEqual(state.writes[0], state.writes[1]);
  await finish(f, 'account-retry');
});

test('logout/account switch never shows or sends another owner draft or pending mutation', async () => {
  const f = await setup(),
    { page, state } = f;
  await login(page);
  const url = await create(page, 'Riêng của A');
  await page.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).click();
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Nháp A giữ riêng');
  await page.getByRole('navigation').getByRole('link', { name: 'Tài khoản', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  state.owner = 'B';
  await page.getByRole('button', { name: 'Tiếp tục với Google', exact: true }).click();
  await page.getByRole('navigation').waitFor();
  assert.equal(await page.getByText(/Riêng của A|Nháp A giữ riêng/).count(), 0);
  await page.goto(url);
  await page.getByText(/Chưa mở được chuyến đi/).waitFor();
  assert.equal(await page.getByRole('heading', { level: 1, name: 'Riêng của A' }).count(), 0);
  assert.equal(state.writes.length, 1);
  await page.goto(base + '/account');
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  state.owner = 'A';
  await page.getByRole('button', { name: 'Tiếp tục với Google', exact: true }).click();
  await page
    .getByRole('link', { name: 'Tiếp tục chỉnh sửa: Nháp A giữ riêng', exact: true })
    .click();
  await page.getByLabel('Tên chuyến đi', { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('Tên chuyến đi', { exact: true }).inputValue(),
    'Nháp A giữ riêng',
  );
  await finish(f, 'account-owners');
});

test('offline shell stays gated, cannot create guest trips and never caches OAuth/API data', async () => {
  const f = await setup(),
    { page, context, state } = f;
  await login(page);
  const url = await create(page, 'Chuyến cần mạng');
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
          (await (await caches.open(name)).keys()).map((request) => request.url),
        ),
      )
    ).flat(),
  );
  assert(
    cached.every(
      (url) => !url.includes('/v1/') && !url.includes('/auth/') && !url.includes('googleapis'),
    ),
  );
  await context.setOffline(true);
  await page.reload();
  await page.getByText('Bạn đang mất kết nối.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('navigation').count(), 0);
  assert.equal(state.records.size, 1);
  assert.equal(page.url(), url);
  await finish(f, 'account-offline');
});

test('desktop/mobile detail and reduced-motion layouts fit 320–1440 px', async () => {
  for (const motion of ['reduce', 'no-preference']) {
    const run = await setup();
    const { page } = run;
    await page.emulateMedia({ reducedMotion: motion });
    await page.setViewportSize({ width: 1440, height: 960 });
    await login(page);
    await create(page, 'Đà Lạt cùng bạn', '5');
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        'No overflow at ' + width,
      );
    }
    await finish(run, 'google-detail-' + motion);
  }
});

test('manifest icons and PWA scope are valid', async () => {
  const manifest = JSON.parse(await readFile(root + '/dist-test/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const bytes = await readFile(root + '/dist-test' + icon.src);
    assert.equal(bytes.readUInt32BE(16), Number(icon.sizes.split('x')[0]));
  }
});

test('legacy migration copies only after explicit Google-account action; preserves bytes and reruns without duplicates', async () => {
  const f = await setup(),
    { page, state } = f;
  await login(page);
  await create(page, 'Chuyến cũ');
  const trip = [...state.records.values()][0].trip;
  state.records.clear();
  state.writes.length = 0;
  const raw = JSON.stringify({ storageVersion: 1, trips: [{ trip, revision: 3 }] });
  await page.evaluate((raw) => localStorage.setItem('goease.guest-trips.v1', raw), raw);
  await page.goto(base + '/account');
  assert.equal(state.records.size, 0);
  if (
    !(await page
      .getByRole('button', { name: 'Chuyển chuyến cũ vào tài khoản', exact: true })
      .isVisible())
  )
    await page.getByText('Dữ liệu chuyến đi cũ', { exact: true }).click();
  await page.getByRole('button', { name: 'Chuyển chuyến cũ vào tài khoản', exact: true }).click();
  await page
    .getByText('Đã thêm 1 chuyến. 0 chuyến đã có trong tài khoản được giữ nguyên.', { exact: true })
    .waitFor();
  const copy = [...state.records.values()][0];
  assert.equal(copy.owner, 'A');
  assert.deepEqual({ ...copy.trip, id: trip.id }, trip);
  assert.match(copy.trip.id, /^legacy-[a-f0-9]{64}$/);
  assert.equal(await page.evaluate(() => localStorage.getItem('goease.guest-trips.v1')), raw);
  await page.reload();
  if (
    !(await page
      .getByRole('button', { name: 'Chuyển chuyến cũ vào tài khoản', exact: true })
      .isVisible())
  )
    await page.getByText('Dữ liệu chuyến đi cũ', { exact: true }).click();
  await page.getByRole('button', { name: 'Chuyển chuyến cũ vào tài khoản', exact: true }).click();
  await page
    .getByText('Đã thêm 0 chuyến. 1 chuyến đã có trong tài khoản được giữ nguyên.', { exact: true })
    .waitFor();
  assert.equal(state.records.size, 1);
  assert.equal(state.writes.length, 1);
  await finish(f, 'legacy-account-migration');
});

test('corrupt legacy data is not overwritten or partly imported', async () => {
  const f = await setup();
  await login(f.page, '/account');
  await f.page.evaluate(() => localStorage.setItem('goease.guest-trips.v1', 'corrupt-original'));
  await f.page.getByText('Dữ liệu chuyến đi cũ', { exact: true }).click();
  await f.page.getByRole('button', { name: 'Chuyển chuyến cũ vào tài khoản', exact: true }).click();
  await f.page.getByText(/Chưa thêm được chuyến đi cũ/).waitFor();
  assert.equal(f.state.writes.length, 0);
  assert.equal(
    await f.page.evaluate(() => localStorage.getItem('goease.guest-trips.v1')),
    'corrupt-original',
  );
  await finish(f, 'legacy-migration-corrupt');
});

test('legacy migration stops on lost response and resumes the original mutation without duplicate copies', async () => {
  const f = await setup(),
    { page, state } = f;
  await login(page);
  await create(page, 'Chuyến cũ cần retry');
  const trip = [...state.records.values()][0].trip;
  state.records.clear();
  state.writes.length = 0;
  await page.evaluate(
    (trip) =>
      localStorage.setItem(
        'goease.guest-trips.v1',
        JSON.stringify({ storageVersion: 1, trips: [{ trip, revision: 1 }] }),
      ),
    trip,
  );
  await page.goto(base + '/account');
  state.lose = true;
  if (
    !(await page
      .getByRole('button', { name: 'Chuyển chuyến cũ vào tài khoản', exact: true })
      .isVisible())
  )
    await page.getByText('Dữ liệu chuyến đi cũ', { exact: true }).click();
  await page.getByRole('button', { name: 'Chuyển chuyến cũ vào tài khoản', exact: true }).click();
  await page.getByText(/Chưa xác nhận chuyển xong/).waitFor();
  assert.equal(state.records.size, 1);
  assert.equal(state.writes.length, 1);
  await page.goto(base + '/trips/' + [...state.records.keys()][0]);
  await page.getByRole('button', { name: 'Thử lưu lại', exact: true }).click();
  await page.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).waitFor();
  assert.deepEqual(state.writes[0], state.writes[1]);
  await page.goto(base + '/account');
  if (
    !(await page
      .getByRole('button', { name: 'Chuyển chuyến cũ vào tài khoản', exact: true })
      .isVisible())
  )
    await page.getByText('Dữ liệu chuyến đi cũ', { exact: true }).click();
  await page.getByRole('button', { name: 'Chuyển chuyến cũ vào tài khoản', exact: true }).click();
  await page
    .getByText('Đã thêm 0 chuyến. 1 chuyến đã có trong tài khoản được giữ nguyên.', { exact: true })
    .waitFor();
  assert.equal(state.records.size, 1);
  assert.equal(state.writes.length, 2);
  await finish(f, 'legacy-migration-retry');
});

test('profile shows Google identity, persists edits across reload and isolates accounts', async () => {
  const f = await setup(),
    { page, state } = f;
  await login(page, '/account');
  await page.getByRole('heading', { name: 'Bạn A', exact: true }).waitFor();
  assert.equal(await page.getByText('ban.a@example.test', { exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Chỉnh sửa hồ sơ', exact: true }).click();
  assert.equal(await page.getByLabel('Email Google', { exact: true }).getAttribute('readonly'), '');
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Nyan đi Đà Lạt');
  await page.getByLabel('Giới thiệu ngắn', { exact: true }).fill('Thích săn mây và cà phê.');
  await page.getByRole('radio', { name: 'Cắm trại', exact: true }).check();
  await page.getByRole('button', { name: 'Lưu hồ sơ', exact: true }).click();
  await page.getByText('Đã lưu hồ sơ của bạn.', { exact: true }).waitFor();
  assert.deepEqual(state.profileWrites[0], {
    owner: 'A',
    body: {
      data: {
        goease_profile: {
          displayName: 'Nyan đi Đà Lạt',
          bio: 'Thích săn mây và cà phê.',
          avatar: 'tent',
        },
      },
    },
  });
  await page.reload();
  await page.getByRole('heading', { name: 'Nyan đi Đà Lạt', exact: true }).waitFor();
  await page.getByText('Thích săn mây và cà phê.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Chỉnh sửa hồ sơ', exact: true }).click();
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Tên chưa lưu');
  await page.getByRole('button', { name: 'Hủy chỉnh sửa', exact: true }).click();
  assert.equal(state.profileWrites.length, 1);
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  state.owner = 'B';
  await page.getByRole('button', { name: 'Tiếp tục với Google', exact: true }).click();
  await page.getByRole('navigation').waitFor();
  await page.goto(base + '/account');
  await page.getByRole('heading', { name: 'Bạn B', exact: true }).waitFor();
  assert.equal(await page.getByText('Nyan đi Đà Lạt', { exact: true }).count(), 0);
  await finish(f, 'profile-mobile');
});

test('failed profile save preserves draft, requires explicit retry and fits mobile/desktop', async () => {
  const f = await setup(),
    { page, state } = f;
  await login(page, '/account');
  await page.getByRole('button', { name: 'Chỉnh sửa hồ sơ', exact: true }).click();
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Tên đang sửa');
  state.profileFail = true;
  await page.getByRole('button', { name: 'Lưu hồ sơ', exact: true }).click();
  await page.getByText(/Chưa biết hồ sơ đã lưu xong chưa/).waitFor();
  assert.equal(await page.getByLabel('Tên hiển thị', { exact: true }).inputValue(), 'Tên đang sửa');
  assert.equal(state.profileWrites.length, 1);
  state.profileFail = false;
  await page.getByRole('button', { name: 'Lưu hồ sơ', exact: true }).click();
  await page.getByText('Đã lưu hồ sơ của bạn.', { exact: true }).waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
  }
  await finish(f, 'profile-desktop');
});

test('access token refresh is automatic and preserves unsaved profile input', async () => {
  const f = await setup(),
    { page, state } = f;
  state.shortSession = true;
  await page.clock.install();
  await login(page, '/account');
  await page.getByRole('button', { name: 'Chỉnh sửa hồ sơ', exact: true }).click();
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Tên chưa lưu khi refresh');
  const verified = page.waitForResponse((response) => response.url().includes('/v1/auth/me'));
  await page.clock.fastForward(45000);
  await verified;
  await page.waitForFunction(
    () => document.querySelector('button[type="submit"]')?.disabled === false,
  );
  await page.getByRole('button', { name: 'Lưu hồ sơ', exact: true }).waitFor({ state: 'visible' });
  assert.equal(
    await page.getByLabel('Tên hiển thị', { exact: true }).inputValue(),
    'Tên chưa lưu khi refresh',
  );
  assert.equal(state.refreshes.length, 1);
  assert.equal(state.profileWrites.length, 0);
  assert.equal(await page.getByRole('button', { name: 'Khôi phục phiên', exact: true }).count(), 0);
  await finish(f, 'automatic-refresh');
});

test('persistent login survives closing a tab; concurrent tabs serialize refresh and logout everywhere', async () => {
  const f = await setup(),
    { page, context, state } = f;
  await login(page, '/account');
  const second = await context.newPage(),
    third = await context.newPage();
  await Promise.all([second.goto(base + '/account'), third.goto(base + '/account')]);
  await Promise.all([
    second.getByRole('heading', { name: 'Bạn A', exact: true }).waitFor(),
    third.getByRole('heading', { name: 'Bạn A', exact: true }).waitFor(),
  ]);
  assert.equal(state.maxRefreshBusy, 1);
  await second.close();
  await third.close();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(base + '/account');
  await reopened.getByRole('heading', { name: 'Bạn A', exact: true }).waitFor();
  assert.equal(state.authorize.length, 1, 'No second Google login');
  const other = await context.newPage();
  await other.goto(base + '/account');
  await other.getByRole('heading', { name: 'Bạn A', exact: true }).waitFor();
  await reopened.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await other.getByRole('button', { name: 'Tiếp tục với Google', exact: true }).waitFor();
  assert.equal(await other.getByRole('heading', { name: 'Bạn A', exact: true }).count(), 0);
  state.owner = 'B';
  await other.getByRole('button', { name: 'Tiếp tục với Google', exact: true }).click();
  await other.getByRole('heading', { name: 'Bạn B', exact: true }).waitFor();
  await reopened.bringToFront();
  await reopened.getByRole('navigation', { name: 'Điều hướng chính' }).waitFor();
  await reopened.goto(base + '/account');
  await reopened.getByRole('heading', { name: 'Bạn B', exact: true }).waitFor();
  assert.equal(await reopened.getByRole('heading', { name: 'Bạn A', exact: true }).count(), 0);
  assert.equal(state.writes.length, 0);
  await other.close();
  await finish({ ...f, page: reopened }, 'persistent-login');
});

test('a revoked refresh token requires Google login and clears persistent credentials', async () => {
  const f = await setup(),
    { page, state } = f;
  await login(page, '/account');
  state.rejectRefresh = true;
  await page.reload();
  await page.getByRole('button', { name: 'Tiếp tục với Google', exact: true }).waitFor();
  await page.getByText('Chưa đăng nhập được. Vui lòng thử lại.', { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () => Object.keys(localStorage).filter((key) => key.endsWith('.session')).length,
    ),
    0,
  );
  await finish(f, 'revoked-session');
});

test('online backend outage preserves login, reports server failure and recovers on retry or reconnect', async () => {
  const f = await setup(),
    { page, context, state } = f;
  await login(page, '/account');
  state.backendUnavailable = true;
  await page.reload();
  assert.equal(await page.evaluate(() => navigator.onLine), true);
  await page.getByText('Chưa mở được GoEase. Vui lòng thử lại.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('navigation').count(), 0);
  assert.equal(
    await page.evaluate(
      () => Object.keys(localStorage).filter((key) => key.endsWith('.session')).length,
    ),
    1,
  );
  state.backendUnavailable = false;
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await page.getByRole('heading', { name: 'Bạn A', exact: true }).waitFor();
  await context.setOffline(true);
  await page.reload();
  await page.getByText('Bạn đang mất kết nối.', { exact: true }).waitFor();
  await context.setOffline(false);
  await page.getByRole('heading', { name: 'Bạn A', exact: true }).waitFor();
  assert.equal(state.authorize.length, 1, 'Recovery must reuse the saved session');
  assert.equal(state.writes.length, 0);
  await finish(f, 'server-reconnect');
});

test('workspace loading stays quiet; catalog failure offers a retry without technical auth messages', async () => {
  const f = await setup(),
    { page, state } = f;
  await login(page, '/account');
  let release;
  state.catalogBlock = new Promise((resolve) => {
    release = resolve;
  });
  state.catalogUnavailable = true;
  try {
    const catalogRequest = page.waitForRequest((request) =>
      request.url().endsWith('/v1/catalog/places'),
    );
    await page.reload();
    await catalogRequest;
    await page.getByRole('status').waitFor();
    assert.equal(await page.getByText(/UUID|Supabase|Đang mở lại tài khoản/).count(), 0);
    assert.equal(await page.getByRole('button').count(), 0);
  } finally {
    release();
    state.catalogBlock = null;
  }
  await page.getByText('Chưa tải được dữ liệu. Vui lòng thử lại.', { exact: true }).waitFor();
  state.catalogUnavailable = false;
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await page.getByRole('heading', { name: 'Bạn A', exact: true }).waitFor();
  assert.equal(state.authorize.length, 1);
  await finish(f, 'quiet-loading');
});

test('customer pages use plain language and map failures keep a useful next action', async () => {
  const f = await setup(),
    { page, state } = f;
  state.mapFail = true;
  await login(page);
  const tripUrl = await create(page, 'Chuyến đi của nhóm');
  const technicalCopy =
    /server|backend|\bAPI\b|Supabase|UUID|credential|mutationId|IndexedDB|localStorage|YYYY-MM-DD|HH:mm|đối soát|máy chủ|phiên bản \d|đã lưu giao diện|mẫu local/i;
  for (const [path, heading] of [
    ['/', 'Chuyến đi của bạn'],
    ['/trips', 'Chuyến đi của bạn'],
    ['/trips/new', 'Lên lịch trình Đà Lạt'],
    ['/account', 'Bạn A'],
    ['/about', 'Just go. We’ll plan.'],
    ['/travel-services', 'Một chuyến đi trọn vẹn'],
  ]) {
    await page.goto(base + path);
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    assert.doesNotMatch(await page.locator('body').innerText(), technicalCopy, path);
  }
  const booking = page.getByRole('link', { name: 'Mở Booking.com ↗', exact: true });
  assert.equal(await booking.getAttribute('href'), 'https://www.booking.com/');
  assert.equal(await booking.getAttribute('target'), '_blank');
  await page.goto(tripUrl);
  await page.getByRole('heading', { name: 'Chuyến đi của nhóm', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Thông tin', exact: true }).click();
  assert.doesNotMatch(await page.locator('body').innerText(), technicalCopy);
  await page.getByRole('tab', { name: 'Bản đồ', exact: true }).click();
  await page.getByText(/Chưa tải được bản đồ\. Hãy thử lại hoặc mở chỉ đường bên dưới\./).waitFor();
  assert.doesNotMatch(await page.locator('body').innerText(), technicalCopy);
  assert(await page.getByRole('link', { name: 'Mở chỉ đường Google Maps ↗' }).count());
  await finish(f, 'plain-language-pages');
});
