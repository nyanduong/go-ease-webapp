import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
export async function checkAdminBrowser({ base, token, entry }) {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    server: { host: '127.0.0.1', port: 5178, strictPort: true },
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(base),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        'https://abcdefghijklmnopqrst.supabase.co',
      ),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        'sb_publishable_offline_fixture_00000000',
      ),
    },
  });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('https://abcdefghijklmnopqrst.supabase.co/auth/v1/token?'))
        return route.fulfill({
          json: {
            token_type: 'bearer',
            access_token: token,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          },
        });
      if (url.startsWith('http://127.0.0.1:5178') || url.startsWith(base)) return route.continue();
      return route.abort();
    });
    await page.goto('http://127.0.0.1:5178/catalog/deep-link');
    await page.getByRole('heading', { name: 'Đăng nhập nhân viên' }).waitFor();
    await page.getByLabel('Email', { exact: true }).fill('admin@example.test');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('offline_fixture_password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('button', { name: '+ Tạo địa điểm' }).waitFor();
    await page.getByRole('button', { name: 'Chỉnh sửa ' + entry.name, exact: true }).click();
    await page.getByLabel('Tên địa điểm', { exact: true }).fill('Browser edited Place');
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Lưu địa điểm', exact: true }).click();
    await page.getByRole('heading', { name: 'Browser edited Place', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Chỉnh sửa Browser edited Place', exact: true }).click();
    await page.getByLabel('Địa điểm đang hoạt động', { exact: true }).uncheck();
    const saved = page.waitForResponse(
      (r) =>
        r.url().includes('/v1/admin/catalog/') &&
        r.request().method() === 'PUT' &&
        r.status() === 200,
    );
    await page.getByRole('button', { name: 'Lưu địa điểm', exact: true }).click();
    await saved;
    const output = fileURLToPath(new URL('../test-results/', import.meta.url));
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: output + '/admin-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: output + '/admin-mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await page.reload();
    await page.getByRole('heading', { name: 'Đăng nhập nhân viên' }).waitFor();
    assert.equal(
      await page.getByRole('heading', { name: 'Browser edited Place', exact: true }).count(),
      0,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
}
