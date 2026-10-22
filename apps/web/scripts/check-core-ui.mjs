import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Read-only visual checks against the running local PWA and its real CMS/API.
// No identity fixture, provider calls, storage injection or database writes.
const root = fileURLToPath(new URL('../../..', import.meta.url));
const folder = root + '/docs/qa/' + (process.argv[2] ?? 'v2-ui/after');
const browser = await chromium.launch();
const evidence = [];
await mkdir(folder, { recursive: true });
async function loadImages(page) {
  for (const image of await page.locator('main img').all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((img) => img.decode().catch(() => {}));
  }
  await page.evaluate(() => {
    document.querySelectorAll('.discovery-collection').forEach((row) => (row.scrollLeft = 0));
    scrollTo(0, 0);
  });
}
try {
  for (const [name, viewport] of [
    ['360', { width: 360, height: 800 }],
    ['390', { width: 390, height: 844 }],
    ['desktop', { width: 1440, height: 1000 }],
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [screen, path] of [
      ['home', '/'],
      ['explore', '/explore'],
    ]) {
      await page.goto('http://localhost:5174' + path);
      await page.getByRole('heading', { name: 'Đà Lạt', exact: true }).first().waitFor();
      await page
        .locator('img')
        .evaluateAll(async (imgs) =>
          Promise.all(
            imgs
              .filter((i) => i.getBoundingClientRect().top < innerHeight)
              .map((i) => i.decode().catch(() => {})),
          ),
        );
      const measurements = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        firstDestinations: [
          ...document.querySelectorAll('.discovery-collection-destination .discovery-card'),
        ]
          .slice(0, 2)
          .map((card) => {
            const image = card.querySelector('img');
            const box = card.getBoundingClientRect();
            return {
              title: card.querySelector('h3').textContent,
              photoLoaded: image?.complete && image.naturalWidth > 0,
              visible: box.left >= 0 && box.right <= innerWidth && box.bottom < innerHeight - 72,
            };
          }),
        largeCategoryCards: document.querySelectorAll('.discovery-card-category').length,
      }));
      assert.equal(measurements.overflow, false);
      assert.equal(measurements.largeCategoryCards, 0);
      if (screen === 'home') {
        assert.equal(await page.locator('.discovery-card-place').count(), 4);
        assert.equal(await page.locator('.discovery-card-article').count(), 2);
        assert.equal(
          await page.locator('.discovery-collection-food.discovery-collection-rail').count(),
          1,
        );
        const cover = await page.locator('.planning-banner img').getAttribute('src');
        assert(
          !(await page
            .locator('.discovery-card-destination img')
            .evaluateAll(
              (imgs, src) => imgs.some((img) => img.getAttribute('src') === src),
              cover,
            )),
        );
      }
      if (name === 'desktop')
        assert.equal(
          await page.getByRole('link', { name: 'GoEase — Trang chủ', exact: true }).count(),
          1,
        );
      if (viewport.width === 390)
        assert(measurements.firstDestinations.every((card) => card.photoLoaded && card.visible));
      for (const image of await page.locator('main img').all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((img) => img.decode().catch(() => {}));
      }
      await page.evaluate(() => {
        document.querySelectorAll('.discovery-collection').forEach((row) => (row.scrollLeft = 0));
        scrollTo(0, 0);
      });
      await page.screenshot({ path: `${folder}/${screen}-${name}.png`, animations: 'disabled' });
      await page.screenshot({
        path: `${folder}/${screen}-${name}-full.png`,
        fullPage: true,
        animations: 'disabled',
      });
      if (screen === 'home' && viewport.width < 640) {
        const food = page.locator('.discovery-collection-food');
        await food.focus();
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(
          () => document.querySelector('.discovery-collection-food')?.scrollLeft > 0,
        );
        await page.screenshot({
          path: `${folder}/food-scroll-${name}.png`,
          animations: 'disabled',
        });
        await food.evaluate((row) => (row.scrollLeft = 0));
      }
      evidence.push({ screen, viewport, ...measurements });
    }
    for (const selector of ['.discovery-collection-destination']) {
      const row = page.locator(selector);
      if (viewport.width < 640) {
        await row.focus();
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(
          () => document.querySelector('.discovery-collection-destination')?.scrollLeft > 0,
        );
        await row.evaluate((node) => (node.scrollLeft = 0));
      }
    }
    assert.equal(await page.locator('.photo-credit-trigger, figure figcaption').count(), 0);
    const attribution = page.locator('.page-photo-credits');
    await attribution.getByText('Thông tin ảnh', { exact: true }).click();
    await attribution.getByText('P. Hughes', { exact: false }).waitFor();
    assert(
      (await attribution.locator('a[href="https://creativecommons.org/licenses/by/4.0"]').count()) >
        0,
    );
    await page.screenshot({ path: `${folder}/attribution-${name}.png`, animations: 'disabled' });
    await attribution.getByText('Thông tin ảnh', { exact: true }).click();
    await page.getByLabel('Tìm nội dung du lịch').fill('Hằng Nga');
    await page.getByRole('button', { name: 'Tìm nội dung', exact: true }).click();
    await page.getByRole('heading', { name: 'Biệt thự Hằng Nga', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Điểm đến', exact: true }).click();
    await page.getByText('Chưa có nội dung phù hợp.', { exact: false }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('q'), 'Hằng Nga');
    await page.getByRole('link', { name: 'Địa điểm', exact: true }).click();
    await page.getByRole('heading', { name: 'Biệt thự Hằng Nga', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Biệt thự Hằng Nga', exact: true }).click();
    await page.getByRole('link', { name: /^Lên lịch tại /, exact: true }).waitFor();
    await page.locator('main article > a').first().click();
    await page.getByRole('heading', { name: 'Khám phá', exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('q'), 'Hằng Nga');
    await page.getByRole('link', { name: 'Xóa bộ lọc', exact: true }).click();
    await page.getByRole('heading', { name: 'Đà Lạt', exact: true }).waitFor();
    if (name === '390') {
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await loadImages(page);
      await page.screenshot({
        path: `${folder}/explore-390-text200.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await page.screenshot({
        path: `${folder}/explore-390-text200-viewport.png`,
        animations: 'disabled',
      });
      await page.goto('http://localhost:5174/');
      await page.getByRole('heading', { name: 'Đà Lạt', exact: true }).waitFor();
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await loadImages(page);
      await page.screenshot({
        path: `${folder}/home-390-text200.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await page.screenshot({
        path: `${folder}/home-390-text200-viewport.png`,
        animations: 'disabled',
      });
    }
    for (const kind of ['destination', 'place', 'food', 'article']) {
      const response = await page.request.get(
        'http://localhost:3000/v1/content?kind=' + kind + '&limit=1',
      );
      assert(response.ok());
      const record = (await response.json()).items[0];
      assert(record, 'Live CMS has content for ' + kind);
      await page.goto('http://localhost:5174/explore/' + record.entry.id);
      await page.getByRole('heading', { name: record.entry.title, exact: true }).waitFor();
      await loadImages(page);
      assert.equal(await page.locator('figure figcaption, .photo-credit-trigger').count(), 0);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await page.screenshot({
        path: `${folder}/detail-${kind}-${name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await page.screenshot({
        path: `${folder}/detail-${kind}-${name}-viewport.png`,
        animations: 'disabled',
      });
      evidence.push({ screen: 'detail-' + kind, viewport, id: record.entry.id, realCms: true });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(
    folder + '/evidence.json',
    JSON.stringify(
      {
        source: 'Live localhost:5174 + real local Nest/PostgreSQL, anonymous browser, no mocks',
        testedCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: root,
          encoding: 'utf8',
        }).trim(),
        checks: [
          'search',
          'kind change preserves query',
          'empty result',
          'detail',
          'browser Back restores filters',
          '200% text reflow',
        ],
        screens: evidence,
      },
      null,
      2,
    ),
  );
  console.log('Live UI checks passed; screenshots: ' + folder);
} finally {
  await browser.close();
}
