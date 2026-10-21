import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';

// Real loopback Nest/PostgreSQL traffic. Only Supabase is an explicit offline auth double.
export async function checkCmsDatabaseBrowser({ base, token, owner, record }) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const origin = 'http://127.0.0.1:4197';
  const authOrigin = 'https://abcdefghijklmnopqrst.supabase.co';
  const output = fileURLToPath(new URL('../../../docs/qa/v2-core/db-content/', import.meta.url));
  const config = {
    root,
    configFile: root + '/vite.config.ts',
    envDir: root + '/tests/fixtures/no-personal-env',
    build: { outDir: 'dist-cms-test' },
    preview: { host: '127.0.0.1', port: 4197, strictPort: true, open: false },
    define: Object.fromEntries(
      Object.entries({
        VITE_API_BASE_URL: base,
        VITE_SUPABASE_URL: authOrigin,
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_offline_fixture_00000000',
        VITE_GOOGLE_MAPS_API_KEY: '',
        VITE_CLOUDINARY_DALAT_URL: '',
        VITE_CLOUDINARY_LOGIN_LAKE_URL: '',
        VITE_CLOUDINARY_LOGIN_LANE_URL: '',
        VITE_DEV_OFFLINE: 'false',
      }).map(([key, value]) => ['import.meta.env.' + key, JSON.stringify(value)]),
    ),
  };
  await build(config);
  const server = await preview(config);
  let browser;
  const evidence = {
    data: 'Isolated real PostgreSQL and real Nest HTTP; editorial fixture created/published through admin API. Supabase provider is an offline double; no live providers.',
    viewports: [],
  };
  const tripIds = [];
  try {
    await mkdir(output, { recursive: true });
    browser = await chromium.launch();
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 1000 },
    ]) {
      const name = viewport.width < 500 ? 'mobile' : 'desktop';
      const context = await browser.newContext({
        viewport,
        serviceWorkers: 'block',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [],
        requests = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('response', (response) => {
        if (response.url().startsWith(base + '/v1/'))
          requests.push({
            method: response.request().method(),
            path: new URL(response.url()).pathname,
            status: response.status(),
          });
      });
      await context.route('**/*', async (route) => {
        const url = route.request().url();
        if (url.startsWith(authOrigin + '/')) {
          const cors = {
            'access-control-allow-origin': origin,
            'access-control-allow-headers':
              'apikey,authorization,content-type,x-client-info,x-supabase-api-version',
            'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
          };
          if (route.request().method() === 'OPTIONS')
            return route.fulfill({ status: 204, headers: cors });
          const path = new URL(url).pathname;
          if (path === '/auth/v1/token')
            return route.fulfill({
              headers: cors,
              json: {
                token_type: 'bearer',
                access_token: token,
                refresh_token: 'isolated_cms_refresh_fixture',
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
              },
            });
          if (path === '/auth/v1/user')
            return route.fulfill({
              headers: cors,
              json: {
                id: owner,
                aud: 'authenticated',
                role: 'authenticated',
                is_anonymous: false,
                identities: [{ provider: 'google' }],
                email: 'isolated-cms@example.test',
                user_metadata: { full_name: 'Người thử nghiệm GoEase' },
              },
            });
          return route.fulfill({ status: 400, headers: cors, json: {} });
        }
        if (url.startsWith(origin + '/') || url.startsWith(base + '/')) return route.continue();
        return route.abort();
      });
      const screenshot = async (suffix) => {
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          'No horizontal overflow',
        );
        await page.screenshot({
          path: output + name + '-' + suffix + '.png',
          fullPage: true,
          animations: 'disabled',
        });
      };
      const contentLink = () =>
        page
          .locator('a[href="/explore/' + record.entry.id + '"]')
          .filter({ hasText: record.entry.title })
          .last();
      try {
        await page.goto(origin + '/');
        await contentLink().waitFor();
        await screenshot('home-real-db-auth-fixture');
        await page
          .getByLabel('Tìm cảm hứng cho chuyến tiếp theo', { exact: true })
          .fill(record.entry.title);
        await page.getByRole('button', { name: 'Tìm nội dung', exact: true }).click();
        await page.waitForURL(/\/explore\?q=/);
        await contentLink().click();
        await page.waitForURL(origin + '/explore/' + record.entry.id);
        // Restore a fixture refresh session, then require the real backend /auth/me to accept it.
        await page.evaluate(
          ({ owner }) =>
            localStorage.setItem(
              'goease.web.abcdefghijklmnopqrst.session',
              JSON.stringify({
                version: 1,
                refreshToken: 'isolated_cms_refresh_fixture',
                ownerId: owner,
              }),
            ),
          { owner },
        );
        const verified = page.waitForResponse(
          (response) => response.url() === base + '/v1/auth/me' && response.status() === 200,
        );
        const initialFavorites = page.waitForResponse(
          (response) =>
            response.url() === base + '/v1/favorites' &&
            response.request().method() === 'GET' &&
            response.status() === 200,
        );
        await page.reload();
        await verified;
        const favoritePage = await (await initialFavorites).json();
        if (!favoritePage.items.some((item) => item.entry.id === record.entry.id)) {
          await page.getByRole('button', { name: 'Lưu yêu thích', exact: true }).click();
        }
        await page.getByRole('button', { name: 'Bỏ yêu thích', exact: true }).waitFor();
        await screenshot('detail-real-db-auth-fixture');
        await page.getByRole('link', { name: 'Lên kế hoạch ở đây', exact: true }).click();
        await page.getByText('Đã chọn điểm đến từ nội dung GoEase.', { exact: false }).waitFor();
        const tripName = 'Hành trình từ CMS · ' + name;
        await page.getByLabel('Tên chuyến đi', { exact: true }).fill(tripName);
        await page.getByLabel('Số ngày', { exact: true }).fill('1');
        await screenshot('planning-real-db-auth-fixture');
        await page.getByRole('button', { name: 'Tạo lịch trống', exact: true }).click();
        await page.waitForURL(/\/trips\/[a-f0-9-]{36}$/);
        await page.getByRole('button', { name: 'Thêm địa điểm', exact: true }).click();
        const activityName = 'Dạo phố theo kế hoạch riêng';
        await page.getByLabel('Tên hoạt động', { exact: true }).fill(activityName);
        const saved = page.waitForResponse(
          (response) =>
            response.url() === base + '/v1/trips' &&
            response.request().method() === 'POST' &&
            response.status() === 201,
        );
        await page.getByRole('button', { name: 'Giữ chuyến này', exact: true }).click();
        const savedBody = await (await saved).json();
        const trip = savedBody.result.trip;
        assert.equal(trip.destination.id, record.entry.id);
        assert.equal(trip.days[0].activities[0].name, activityName);
        tripIds.push(trip.id);
        await page.getByRole('button', { name: 'Chỉnh sửa lịch trình', exact: true }).waitFor();
        await page.reload();
        await page.getByRole('heading', { name: tripName, exact: true }).waitFor();
        await page.getByRole('heading', { name: activityName, exact: true }).waitFor();
        await screenshot('saved-reopened-real-db-auth-fixture');
        await page.goto(origin + '/favorites');
        await contentLink().waitFor();
        await page.reload();
        await contentLink().waitFor();
        await screenshot('favorites-reopened-real-db-auth-fixture');
        assert.deepEqual(errors, []);
        assert(requests.some((value) => value.path === '/v1/auth/me' && value.status === 200));
        assert(
          requests.some(
            (value) =>
              value.path === '/v1/trips' && value.method === 'POST' && value.status === 201,
          ),
        );
        evidence.viewports.push({ name, viewport, tripId: trip.id, requests });
      } catch (error) {
        await page.screenshot({ path: output + name + '-failure.png', fullPage: true });
        console.error(
          'Real DB CMS browser failure:',
          await page.locator('body').innerText(),
          errors,
          requests,
        );
        throw error;
      } finally {
        await context.close();
      }
    }
    await writeFile(output + 'evidence.json', JSON.stringify(evidence, null, 2));
    return { tripIds };
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}
