import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createApi } from '../dist/bootstrap.js';
import { getDalatCatalog } from '@goease/catalog';

test('independent Nest applications keep config, catalog providers and lifecycle isolated', async () => {
  const entries = getDalatCatalog();
  let firstCalls = 0,
    secondCalls = 0;
  const first = await createApi({ API_CORS_ORIGINS: 'https://first.example.test' }, () => {
    firstCalls++;
    return entries;
  });
  const second = await createApi({ API_CORS_ORIGINS: 'https://second.example.test' }, () => {
    secondCalls++;
    return entries.slice().reverse();
  });
  try {
    await first.app.listen(0, '127.0.0.1');
    await second.app.listen(0, '127.0.0.1');
    const a = await first.app.getUrl(),
      b = await second.app.getUrl();
    assert.deepEqual((await (await fetch(a + '/v1/catalog')).json()).catalog.entries, entries);
    assert.deepEqual(
      (await (await fetch(b + '/v1/catalog')).json()).catalog.entries,
      entries.slice().reverse(),
    );
    assert.equal(
      (await fetch(a + '/v1/health', { headers: { origin: 'https://second.example.test' } }))
        .status,
      403,
    );
    assert.equal(
      (await fetch(b + '/v1/health', { headers: { origin: 'https://second.example.test' } }))
        .status,
      200,
    );
    await first.app.close();
    assert.equal((await fetch(b + '/v1/catalog')).status, 200);
    assert.equal(firstCalls, 1);
    assert.equal(secondCalls, 2);
  } finally {
    await first.app.close();
    await second.app.close();
  }
});

test('production build contains no demo sessions or imports of the separate demo artifact', async () => {
  const root = new URL('../dist/', import.meta.url);
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) await inspect(url);
      else if (entry.name.endsWith('.js')) {
        assert.doesNotMatch(
          entry.name,
          /^(?:(?:auth-|trips-)?demo(?:-session)?|create-demo-api)\.js$/,
        );
        const source = await readFile(url, 'utf8');
        assert.doesNotMatch(source, /(?:from|import)\s*['"][^'"]*(?:dist-demos|\/dev\/|\/demos\/)/);
      }
    }
  }
  await inspect(root);
});
