import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
export async function checkAdminBrowser({ base, token, entry }) {
  const config = {
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    build: { outDir: 'dist-test' },
    preview: { host: '127.0.0.1', port: 5178, strictPort: true },
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(base),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        'https://abcdefghijklmnopqrst.supabase.co',
      ),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        'sb_publishable_offline_fixture_00000000',
      ),
    },
  };
  await build(config);
  const server = await preview(config);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
      errors = [],
      requestTrace = [],
      nativeDialogs = [];
    page.setDefaultTimeout(10000);
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.includes('/auth/') || url.pathname.includes('/v1/'))
        requestTrace.push(request.method() + ' ' + url.pathname);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', async (dialog) => {
      nativeDialogs.push(dialog.type());
      await dialog.dismiss();
    });
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.route('**/*', async (route) => {
      if (
        route.request().url().startsWith('https://abcdefghijklmnopqrst.supabase.co/') &&
        route.request().method() === 'OPTIONS'
      )
        return route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': 'http://127.0.0.1:5178',
            'access-control-allow-headers':
              'apikey,authorization,content-type,x-client-info,x-supabase-api-version',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
          },
        });
      const url = route.request().url();
      if (url.startsWith('https://abcdefghijklmnopqrst.supabase.co/auth/v1/authorize')) {
        const redirect = new URL(new URL(url).searchParams.get('redirect_to'));
        redirect.searchParams.set('code', 'offline-admin-code');
        return route.fulfill({
          contentType: 'text/html',
          body: `<script>location.replace(${JSON.stringify(redirect.href)})</script>`,
        });
      }
      if (url.startsWith('https://abcdefghijklmnopqrst.supabase.co/auth/v1/token?'))
        return route.fulfill({
          headers: { 'access-control-allow-origin': 'http://127.0.0.1:5178' },
          json: {
            token_type: 'bearer',
            access_token: token,
            refresh_token: 'offline_admin_refresh',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: '12345678-1234-4234-8234-123456789abc',
              aud: 'authenticated',
              role: 'authenticated',
              identities: [{ provider: 'google' }],
            },
          },
        });
      if (url === 'https://abcdefghijklmnopqrst.supabase.co/auth/v1/user')
        return route.fulfill({
          headers: { 'access-control-allow-origin': 'http://127.0.0.1:5178' },
          json: { is_anonymous: false, identities: [{ provider: 'google' }] },
        });
      if (url.startsWith('http://127.0.0.1:5178') || url.startsWith(base)) return route.continue();
      return route.abort();
    });
    await page.goto('http://127.0.0.1:5178/catalog/deep-link');
    await page.getByRole('heading', { name: 'Đăng nhập nhân viên' }).waitFor();
    await page.getByRole('button', { name: 'Tiếp tục với Google', exact: true }).click();
    try {
      await page.getByRole('button', { name: '+ Tạo địa điểm' }).waitFor();
    } catch (error) {
      console.error(
        'Admin OAuth fixture:',
        await page.locator('body').innerText(),
        errors,
        requestTrace,
      );
      throw error;
    }
    while (
      !(await page.getByRole('button', { name: 'Chỉnh sửa ' + entry.name, exact: true }).count())
    ) {
      await page.getByRole('button', { name: 'Tải thêm địa điểm', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Chỉnh sửa ' + entry.name, exact: true }).click();
    await page.getByLabel('Tên địa điểm', { exact: true }).fill('Browser edited Place');
    // Regression: hiding and returning to a valid RAM session must preserve the editor.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(
      await page.getByLabel('Tên địa điểm', { exact: true }).inputValue(),
      'Browser edited Place',
    );
    assert.equal(await page.getByRole('button', { name: 'Đăng xuất', exact: true }).count(), 1);
    const writes = () =>
      requestTrace.filter((request) => /^(POST|PUT) \/v1\/admin\//.test(request)).length;
    const writesBeforeSave = writes();
    await page.getByRole('button', { name: 'Lưu địa điểm', exact: true }).click();
    const saveDialog = page.getByRole('dialog', { name: 'Lưu địa điểm?', exact: true });
    await saveDialog.waitFor();
    assert.equal(
      await saveDialog
        .getByRole('button', { name: 'Tiếp tục chỉnh sửa' })
        .evaluate((button) => document.activeElement === button),
      true,
    );
    await page.keyboard.press('Shift+Tab');
    assert.equal(
      await saveDialog
        .getByRole('button', { name: 'Xác nhận lưu', exact: true })
        .evaluate((button) => document.activeElement === button),
      true,
    );
    await page.keyboard.press('Tab');
    assert.equal(
      await saveDialog
        .getByRole('button', { name: 'Tiếp tục chỉnh sửa' })
        .evaluate((button) => document.activeElement === button),
      true,
    );
    assert.equal(writes(), writesBeforeSave);
    await page.keyboard.press('Escape');
    await saveDialog.waitFor({ state: 'hidden' });
    assert.equal(
      await page.getByLabel('Tên địa điểm', { exact: true }).inputValue(),
      'Browser edited Place',
    );
    assert.equal(
      await page
        .getByRole('button', { name: 'Lưu địa điểm', exact: true })
        .evaluate((button) => document.activeElement === button),
      true,
    );
    assert.equal(writes(), writesBeforeSave);
    await page.getByRole('button', { name: 'Bỏ form', exact: true }).click();
    const discardDialog = page.getByRole('dialog', { name: 'Bỏ thay đổi chưa lưu?', exact: true });
    await discardDialog.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }).click();
    assert.equal(
      await page.getByLabel('Tên địa điểm', { exact: true }).inputValue(),
      'Browser edited Place',
    );
    await page.getByRole('button', { name: 'Lưu địa điểm', exact: true }).click();
    await saveDialog.getByRole('button', { name: 'Xác nhận lưu', exact: true }).click();
    await page.getByRole('heading', { name: 'Browser edited Place', exact: true }).waitFor();
    assert.equal(writes(), writesBeforeSave + 1);
    await page.getByRole('button', { name: 'Chỉnh sửa Browser edited Place', exact: true }).click();
    await page.getByLabel('Địa điểm đang hoạt động', { exact: true }).uncheck();
    const saved = page.waitForResponse(
      (r) =>
        r.url().includes('/v1/admin/catalog/') &&
        r.request().method() === 'PUT' &&
        r.status() === 200,
    );
    await page.getByRole('button', { name: 'Lưu địa điểm', exact: true }).click();
    await saveDialog.getByRole('button', { name: 'Xác nhận lưu', exact: true }).click();
    await saved;
    const output = fileURLToPath(new URL('../test-results/', import.meta.url));
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: output + '/admin-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Chỉnh sửa Browser edited Place', exact: true }).click();
    await page.getByLabel('Tên địa điểm', { exact: true }).fill('Unsaved mobile Place');
    await page.getByRole('button', { name: 'Bỏ form', exact: true }).click();
    await discardDialog.waitFor();
    assert.equal(
      await discardDialog.evaluate((dialog) => {
        const box = dialog.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && box.height <= innerHeight;
      }),
      true,
    );
    await page.screenshot({ path: output + '/admin-mobile-popup.png', fullPage: true });
    const writesBeforeDiscard = writes();
    await discardDialog.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
    await discardDialog.waitFor({ state: 'hidden' });
    assert.equal(await page.getByLabel('Tên địa điểm', { exact: true }).count(), 0);
    assert.equal(writes(), writesBeforeDiscard);
    await page.screenshot({ path: output + '/admin-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'CMS khám phá', exact: true }).click();
    await page.getByRole('button', { name: 'Tải nội dung', exact: true }).click();
    await page.getByRole('button', { name: 'Tải lại nội dung', exact: true }).waitFor();
    await page.getByRole('button', { name: '+ Tạo nội dung', exact: true }).click();
    const contentId = 'browser-cms-' + Date.now();
    await page.getByLabel('ID nội dung', { exact: true }).fill(contentId);
    await page.getByLabel('Tiêu đề', { exact: true }).fill('Điểm đến CMS trình duyệt');
    await page
      .getByLabel('Mô tả ngắn', { exact: true })
      .fill('Điểm đến được nhập qua biểu mẫu quản trị.');
    await page
      .getByLabel('Nội dung bài viết', { exact: true })
      .fill('Nội dung fixture cho luồng biên tập và công bố.');
    await page.getByLabel('Địa chỉ', { exact: true }).fill('Đà Lạt, Việt Nam');
    await page.getByLabel('Vĩ độ nội dung', { exact: true }).fill('11.9404');
    await page.getByLabel('Kinh độ nội dung', { exact: true }).fill('108.4583');
    await page.getByRole('button', { name: '+ Thêm nguồn', exact: true }).click();
    await page.getByLabel('Tên nguồn 1', { exact: true }).fill('Nguồn fixture');
    await page
      .getByLabel('URL nguồn 1', { exact: true })
      .fill('https://example.test/editorial-source');
    await page.getByRole('button', { name: 'Lưu nội dung', exact: true }).click();
    await page
      .getByRole('button', { name: 'Sửa nội dung Điểm đến CMS trình duyệt', exact: true })
      .waitFor();
    assert.equal((await page.request.get(base + '/v1/content/' + contentId)).status(), 404);
    await page
      .getByRole('button', { name: 'Sửa nội dung Điểm đến CMS trình duyệt', exact: true })
      .click();
    await page.getByLabel('Trạng thái', { exact: true }).selectOption('published');
    await page.getByRole('button', { name: 'Lưu nội dung', exact: true }).click();
    await page
      .getByRole('button', { name: 'Sửa nội dung Điểm đến CMS trình duyệt', exact: true })
      .waitFor();
    assert.equal((await page.request.get(base + '/v1/content/' + contentId)).status(), 200);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: output + '/cms-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: output + '/cms-mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await page.reload();
    await page.getByRole('heading', { name: 'Đăng nhập nhân viên' }).waitFor();
    assert.equal(
      await page.getByRole('heading', { name: 'Browser edited Place', exact: true }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(nativeDialogs, []);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}
