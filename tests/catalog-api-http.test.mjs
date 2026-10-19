import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createApi } from '../apps/api/dist/bootstrap.js';

// Execute the same compiled pure client used by the Expo screen against a real TCP server.
// This verifies HTTP interoperability in Node, not Android/iPhone native networking.
const { fetchApiCatalog } = createRequire(import.meta.url)(
  '../apps/mobile/.logic-tests/catalog-api-controller.js',
);
async function withApi(run, env = {}, load) {
  const { app } = await createApi(env, load);
  try {
    await app.listen(0, '127.0.0.1');
    await run(await app.getUrl());
  } finally {
    await app.close();
  }
}
test('mobile client fetches and validates all 15 places from the real Nest HTTP server', () =>
  withApi(async (base) => {
    const dto = await fetchApiCatalog(base);
    assert.equal(dto.apiVersion, '1');
    assert.equal(dto.catalog.entries.length, 15);
    assert.equal(dto.catalog.destinationId, 'da-lat');
    assert.ok(dto.catalog.entries.every((entry) => entry.sources.length > 0));
  }));
test('mobile client surfaces real server 504 without accepting a catalog', () =>
  withApi(
    async (base) => {
      await assert.rejects(
        fetchApiCatalog(base),
        (error) =>
          error.code === 'HTTP' &&
          error.message.includes('504') &&
          error.message.includes('REQUEST_TIMEOUT'),
      );
    },
    { API_REQUEST_TIMEOUT_MS: '100' },
    () => new Promise(() => {}),
  ));
test('mobile client surfaces actual connection refusal after API stops', async () => {
  const { app } = await createApi({});
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  try {
    assert.equal((await fetchApiCatalog(base)).catalog.entries.length, 15);
  } finally {
    await app.close();
  }
  await assert.rejects(fetchApiCatalog(base), { code: 'NETWORK' });
});
test('mobile client receives response validation failure through real HTTP (fault provider)', () =>
  withApi(
    async (base) => {
      await assert.rejects(
        fetchApiCatalog(base),
        (error) => error.code === 'HTTP' && error.message.includes('RESPONSE_INVALID'),
      );
    },
    {},
    () => [],
  ));
