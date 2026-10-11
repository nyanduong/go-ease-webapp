import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../src/database/client.js';
import { samplePlaces, seedCatalog } from '../src/database/seed.js';
import { loadMapCatalog, validateMapCatalog } from '../src/modules/maps/catalog.js';
import { MapsError } from '../src/modules/maps/errors.js';
import { runMapsProbe } from '../src/modules/maps/probe.js';
import { sampleRoutesBody } from '../src/modules/maps/routes.js';
import { createIsolatedDatabase, fixtureDirectory, grantRuntime, LocalPostgres, runTool } from './helpers/postgres.js';

// Real private PostgreSQL + real child-process CLI. Google is forbidden throughout.
async function sanitized(work: () => Promise<void>) {
  let caught: unknown;
  try { await work(); return; } catch (error) { caught = error; }
  if (caught instanceof assert.AssertionError) throw caught;
  throw new Error('Owned Maps database fixture failed; private driver details are not printed.');
}

test('Maps catalog and actual dry-run CLI use only approved real PostgreSQL rows without Google calls', { timeout: 120_000 }, async t => sanitized(async () => {
  const cluster = await LocalPostgres.initialize(await fixtureDirectory());
  const close: Array<() => Promise<unknown>> = [];
  t.after(async () => {
    try {
      const results = await Promise.allSettled(close.map(work => work()));
      assert.ok(results.every(result => result.status === 'fulfilled'), 'Owned Maps fixture clients close');
    } finally { await cluster.stopIfRunning(); }
  });
  await cluster.start();
  const env = await createIsolatedDatabase(cluster, 'goease_maps_catalog');
  const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
  await runTool(process.execPath, [path.join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy',
    '--config', path.join(apiRoot, 'prisma7.config.ts')], { ...process.env, DATABASE_MIGRATION_URL: env.migrationUrl });
  await grantRuntime(env.migrationUrl, env.runtime);
  const operator = createDatabaseClient(env.migrationUrl); close.push(() => operator.$disconnect());
  await seedCatalog(operator);

  await t.test('runtime catalog returns actual seeded IDs and exact approved public fields', () => sanitized(async () => {
    const rows = await operator.place.findMany(), catalog = await loadMapCatalog(env.runtimeUrl);
    assert.equal(catalog.places.length, 3); assert.equal(await operator.user.count(), 0);
    for (const place of catalog.places) {
      const row = rows.find(row => row.id === place.id); assert.ok(row);
      assert.equal(place.name, row.name); assert.equal(place.latitude, row.latitude.toNumber()); assert.equal(place.longitude, row.longitude.toNumber());
      assert.equal(place.sourceUrl, row.sourceUrl); assert.equal(place.attribution, row.attribution);
    }
    assert.deepEqual(validateMapCatalog(catalog), catalog);
  }));

  await t.test('private labels, edited provenance/coordinates and inactive/non-sample/destination/code changes are refused', () => sanitized(async () => {
    const mutations = [{ name: 'TEST_ONLY_PRIVATE_MAP_LABEL' }, { latitude: '21.028612' }, { longitude: '105.835557' },
      { sourceUrl: 'https://www.wikidata.org/w/index.php?title=Q1202019&oldid=1' }, { attribution: 'TEST_ONLY_UNAPPROVED_SOURCE' },
      { active: false }, { isSample: false }, { destinationCode: 'TEST_ONLY_OTHER_DESTINATION' }, { code: 'test-only-edited-seed-code' }];
    let calls = 0;
    for (const data of mutations) {
      const row = await operator.place.findUniqueOrThrow({ where: { code: samplePlaces[0].code } });
      await operator.place.update({ where: { id: row.id }, data });
      try {
        await assert.rejects(loadMapCatalog(env.runtimeUrl), error => error instanceof MapsError && error.code === 'MAPS_INVALID_INPUT');
        const result = await runMapsProbe(['--dry-run'], { DATABASE_URL: env.runtimeUrl }, {
          fetch: async () => { calls++; throw new Error('Forbidden Google call'); },
        });
        assert.equal(result.exitCode, 1); assert.equal('code' in result.receipt ? result.receipt.code : undefined, 'MAPS_INVALID_INPUT');
        const receipt = JSON.stringify(result.receipt);
        assert.equal(receipt.includes('TEST_ONLY_PRIVATE_MAP_LABEL'), false); assert.equal(receipt.includes(env.runtimeUrl), false);
      } finally {
        // Restore the same row first if its unique code changed; do not leave an extra seed.
        await operator.place.update({ where: { id: row.id }, data: { code: samplePlaces[0].code } });
        await seedCatalog(operator);
      }
    }
    assert.equal(calls, 0); assert.equal((await loadMapCatalog(env.runtimeUrl)).places.length, 3);
  }));

  await t.test('actual CLI dry-run has no key/network, uses actual DB UUID pair and excludes private credentials', () => sanitized(async () => {
    const guard = 'globalThis.fetch = async () => { console.error("TEST_ONLY_UNEXPECTED_GOOGLE_FETCH"); throw new Error("Google forbidden in dry-run"); };';
    const result = await runTool(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(guard)}`,
      path.join(apiRoot, 'dist/src/modules/maps/probe.js'), '--dry-run'], {
      ...process.env, DATABASE_URL: env.runtimeUrl, GOOGLE_MAPS_SERVER_API_KEY: undefined, DEBUG: undefined,
    });
    const receipt = JSON.parse(result.stdout) as Record<string, unknown>, catalog = await loadMapCatalog(env.runtimeUrl);
    const request = { originPlaceId: catalog.places[0]!.id, destinationPlaceId: catalog.places[1]!.id };
    assert.equal(receipt['mode'], 'dry-run'); assert.equal(receipt['status'], 'validated-input'); assert.equal(receipt['outboundCalls'], 0);
    assert.deepEqual(receipt['request'], request); assert.deepEqual(receipt['body'], sampleRoutesBody(request, catalog));
    assert.equal(receipt['routeKind'], undefined); assert.equal(receipt['chargedCostUsd'], undefined);
    assert.equal(receipt['coordinates'], undefined); assert.equal(receipt['authorization'], undefined);
    const output = result.stdout + result.stderr, runtime = new URL(env.runtimeUrl), migration = new URL(env.migrationUrl);
    for (const secret of [env.runtimeUrl, env.migrationUrl, runtime.username, runtime.password, migration.username, migration.password]) {
      assert.equal(output.includes(secret), false, 'CLI excludes private database credentials');
    }
    assert.equal(output.includes('TEST_ONLY_UNEXPECTED_GOOGLE_FETCH'), false); assert.equal(output.includes('TEST_ONLY_PRIVATE_MAP_LABEL'), false);
    assert.equal(result.stderr, '');
  }));
}));
