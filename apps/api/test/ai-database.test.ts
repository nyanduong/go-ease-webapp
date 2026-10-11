import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../src/database/client.js';
import { samplePlaces, seedCatalog } from '../src/database/seed.js';
import { loadApprovedSampleCatalog } from '../src/modules/ai/catalog.js';
import { AiError } from '../src/modules/ai/errors.js';
import { runAiProbe } from '../src/modules/ai/probe.js';
import { createIsolatedDatabase, fixtureDirectory, grantRuntime, LocalPostgres, runTool } from './helpers/postgres.js';

// PostgreSQL is real and private to this test. Gemini is never called: injected
// fetch observers and a child-process guard reject any accidental provider call.
async function sanitized(work: () => Promise<void>) {
  let caught: unknown;
  try { await work(); return; }
  catch (error) { caught = error; }
  if (caught instanceof assert.AssertionError) throw caught;
  throw new Error('Owned AI database fixture failed; private driver details are not printed.');
}

test('AI catalog and actual dry-run CLI use approved PostgreSQL rows without provider requests', { timeout: 120_000 }, async t => sanitized(async () => {
  const cluster = await LocalPostgres.initialize(await fixtureDirectory());
  const close: Array<() => Promise<unknown>> = [];
  t.after(async () => {
    try {
      const results = await Promise.allSettled(close.map(work => work()));
      assert.ok(results.every(result => result.status === 'fulfilled'), 'Owned AI fixture clients close');
    } finally { await cluster.stopIfRunning(); }
  });
  await cluster.start();
  const env = await createIsolatedDatabase(cluster, 'goease_ai_catalog');
  const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
  await runTool(process.execPath, [path.join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy',
    '--config', path.join(apiRoot, 'prisma7.config.ts')], { ...process.env, DATABASE_MIGRATION_URL: env.migrationUrl });
  await grantRuntime(env.migrationUrl, env.runtime);
  const operator = createDatabaseClient(env.migrationUrl);
  close.push(() => operator.$disconnect());
  await seedCatalog(operator);

  await t.test('loader returns the three actual seeded UUIDs and canonical public fields through the runtime role', () => sanitized(async () => {
    const rows = await operator.place.findMany({ orderBy: { code: 'asc' } });
    const catalog = await loadApprovedSampleCatalog(env.runtimeUrl);
    assert.equal(rows.length, 3);
    assert.deepEqual(catalog.map(place => place.id), rows.map(row => row.id));
    assert.deepEqual(catalog.map(place => place.name), rows.map(row => row.name));
    assert.ok(catalog.every(place => place.active && place.isSample && place.destinationCode === 'VN-HANOI-SAMPLE'));
    assert.deepEqual(catalog.map(place => [place.latitude, place.longitude]), rows.map(row => [row.latitude.toNumber(), row.longitude.toNumber()]));
    assert.deepEqual(catalog.map(place => [place.sourceUrl, place.attribution]), rows.map(row => [row.sourceUrl, row.attribution]));
    assert.equal(await operator.user.count(), 0, 'Catalog seed creates no login identities');
  }));

  await t.test('edited name/provenance/coordinates or inactive/non-sample rows fail before any provider request', () => sanitized(async () => {
    const privateMarker = 'TEST_ONLY_PRIVATE_LABEL_NOT_APPROVED';
    const mutations = [{ name: privateMarker }, { sourceUrl: 'https://www.wikidata.org/w/index.php?title=Q1202019&oldid=1' },
      { attribution: 'TEST_ONLY_UNAPPROVED_PROVENANCE' }, { latitude: '21.028612' }, { longitude: '105.835557' },
      { active: false }, { isSample: false }];
    let fetches = 0;
    const forbiddenFetch: typeof fetch = async () => { fetches++; throw new Error('Provider requests are forbidden in this test'); };
    for (const data of mutations) {
      await operator.place.update({ where: { code: samplePlaces[0].code }, data });
      try {
        let failureCode: string | undefined;
        try { await loadApprovedSampleCatalog(env.runtimeUrl); }
        catch (error) { failureCode = error instanceof AiError ? error.code : 'UNEXPECTED_PRIVATE_DRIVER_ERROR'; }
        assert.equal(failureCode, 'AI_INVALID_INPUT');
        const result = await runAiProbe(['--dry-run'], { DATABASE_URL: env.runtimeUrl }, { fetch: forbiddenFetch });
        assert.equal(result.exitCode, 1); assert.equal(result.receipt.status, 'failed');
        assert.equal('code' in result.receipt ? result.receipt.code : undefined, 'AI_INVALID_INPUT');
        assert.equal(JSON.stringify(result.receipt).includes(privateMarker), false);
        assert.equal(JSON.stringify(result.receipt).includes(env.runtimeUrl), false);
        assert.equal(fetches, 0);
      } finally { await seedCatalog(operator); }
    }
    assert.equal((await loadApprovedSampleCatalog(env.runtimeUrl)).length, 3, 'Canonical seed recovery restores the approved catalog');
  }));

  await t.test('actual CLI dry-run emits only controlled input/schema, with no credentials, model output or AI key', () => sanitized(async () => {
    const fetchGuard = 'globalThis.fetch = async () => { console.error("TEST_ONLY_UNEXPECTED_PROVIDER_FETCH"); throw new Error("Provider requests forbidden in dry-run"); };';
    const result = await runTool(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(fetchGuard)}`,
      path.join(apiRoot, 'dist/src/modules/ai/probe.js'), '--dry-run', '--days=5'], {
      ...process.env, DATABASE_URL: env.runtimeUrl, GEMINI_API_KEY: undefined, GEMINI_MODEL: undefined, DEBUG: undefined,
    });
    const receipt = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(receipt['mode'], 'dry-run'); assert.equal(receipt['status'], 'validated-input');
    assert.equal(receipt['outboundCalls'], 0); assert.equal(receipt['schedule'], undefined);
    assert.equal(receipt['usage'], undefined); assert.equal(receipt['requestedModel'], undefined);
    const catalog = await loadApprovedSampleCatalog(env.runtimeUrl);
    assert.deepEqual(receipt['input'], { durationDays: 5, candidates: catalog.map(place => ({ placeId: place.id, name: place.name })) });
    const output = result.stdout + result.stderr;
    const runtime = new URL(env.runtimeUrl), migration = new URL(env.migrationUrl);
    for (const secret of [env.runtimeUrl, env.migrationUrl, runtime.username, runtime.password, migration.username, migration.password]) {
      assert.equal(output.includes(secret), false, 'CLI output excludes private database credentials');
    }
    assert.equal(output.includes('TEST_ONLY_UNEXPECTED_PROVIDER_FETCH'), false);
    assert.equal(output.includes('TEST_ONLY_PRIVATE_LABEL_NOT_APPROVED'), false);
    assert.equal(result.stderr, '');
  }));
}));
