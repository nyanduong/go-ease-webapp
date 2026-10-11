import { test, expect } from '@playwright/test';

test('web production nhận health thật, kiểm tra lại, không lỗi JS hoặc tràn ngang', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const health = page.waitForResponse('http://127.0.0.1:3020/api/health');
  await page.goto('/technical/health');
  expect((await health).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'API đang hoạt động' })).toBeVisible();
  const retry = page.waitForResponse('http://127.0.0.1:3020/api/health');
  await page.getByRole('button', { name: /Kiểm tra lại/ }).click();
  expect((await retry).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'API đang hoạt động' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('admin deep links and refresh stay gated without a configured Google session', async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 360, height: 800 });
  const errors: string[] = [], catalogRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (request.url().includes('/admin/places')) catalogRequests.push(request.url()); });
  await page.goto('/admin/catalog');
  await expect(page.getByRole('heading', { name: 'Không gian vận hành', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dữ liệu tham chiếu', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Không gian vận hành', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Yêu cầu dịch vụ', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/requests$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Không gian vận hành', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/unknown-admin-page');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(catalogRequests).toEqual([]);
  expect(errors).toEqual([]);
});
