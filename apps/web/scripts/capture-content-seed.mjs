import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
import { createApi } from '../../api/dist/bootstrap.js';
import { localCluster, pgControl } from '../../api/scripts/db-tools.mjs';
import { seedContent } from '../../api/scripts/content-seed.mjs';

// Review-only screenshots: a NEW isolated database, sourced committed seed,
// anonymous browser, no external provider or personal development DB access.
const root = fileURLToPath(new URL('..', import.meta.url));
const output = fileURLToPath(new URL('../../../docs/qa/v2-core/sourced-seed/', import.meta.url));
const origin = 'http://127.0.0.1:4198';
let meta, app, server, browser;
try {
  meta = await localCluster('test');
  await seedContent(meta.adminUrl);
  ({ app } = await createApi(
    {
      TRIPS_ENABLED: 'true',
      DATABASE_URL: meta.runtimeUrl,
      AUTH_ENABLED: 'true',
      SUPABASE_AUTH_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_offline_fixture_00000000',
      API_CORS_ORIGINS: origin,
      API_REQUEST_TIMEOUT_MS: '20000',
    },
    undefined,
    {},
    {
      fetcher: async () => {
        throw Error('No provider calls permitted for public seed screenshots');
      },
    },
  ));
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const config = {
    root,
    configFile: root + '/vite.config.ts',
    envDir: root + '/tests/fixtures/no-personal-env',
    build: { outDir: 'dist-seed-test' },
    preview: { host: '127.0.0.1', port: 4198, strictPort: true, open: false },
    define: Object.fromEntries(
      Object.entries({
        VITE_API_BASE_URL: base,
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_PUBLISHABLE_KEY: '',
        VITE_GOOGLE_MAPS_API_KEY: '',
        VITE_CLOUDINARY_DALAT_URL: '',
        VITE_DEV_OFFLINE: 'false',
      }).map(([key, value]) => ['import.meta.env.' + key, JSON.stringify(value)]),
    ),
  };
  await build(config);
  server = await preview(config);
  browser = await chromium.launch();
  await mkdir(output, { recursive: true });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await context.route('**/*', (route) =>
      route
        .request()
        .url()
        .startsWith(origin + '/') ||
      route
        .request()
        .url()
        .startsWith(base + '/')
        ? route.continue()
        : route.abort(),
    );
    const mode = viewport.width < 500 ? 'mobile' : 'desktop';
    await page.goto(origin);
    for (const name of [
      'Điểm đến nổi bật',
      'Địa điểm đáng ghé',
      'Ẩm thực & đặc sản',
      'Cẩm nang du lịch',
    ])
      await page.getByRole('region', { name, exact: true }).waitFor();
    await page.locator('main img').evaluateAll(async (images) => {
      await Promise.all(
        images.map((image) => {
          image.loading = 'eager';
          return image.decode().catch(() => {});
        }),
      );
    });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw Error('Seed home overflows viewport');
    await page.screenshot({
      path: output + mode + '-home.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.goto(origin + '/explore/dalat-bietthuhangnga');
    await page.getByRole('heading', { name: 'Biệt thự Hằng Nga', exact: true }).waitFor();
    await page.locator('main img').evaluateAll(async (images) => {
      await Promise.all(images.map((image) => image.decode().catch(() => {})));
    });
    await page.screenshot({
      path: output + mode + '-place.png',
      fullPage: true,
      animations: 'disabled',
    });
    await context.close();
  }
  console.info(
    'Sourced editorial seed captured through real isolated Nest/PostgreSQL; no provider calls.',
  );
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
  await app?.close();
  if (meta) pgControl(meta, 'stop');
}
