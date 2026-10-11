/* global process, fetch, AbortSignal, setTimeout */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, cp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { prepareArtifact, relocateArtifact } from './prepare-artifact.mjs';
import { verifyArtifact } from './verify-artifact.mjs';
import { deployFromFrozenGraph } from './locked-deploy.mjs';
import { prepareOperator } from './prepare-operator.mjs';

const execute = promisify(execFile), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('pruned, moved production artifact uses PostgreSQL WASM and its own runtime dependencies (real private PG)', { timeout: 300_000 }, async () => {
  const { LocalPostgres, fixtureDirectory, createIsolatedDatabase } = await import(pathToFileURL(path.join(root, 'apps/api/dist/test/helpers/postgres.js')).href);
  const parent = await mkdtemp(path.join(os.tmpdir(), 'goease-pruned-runtime-'));
  const initial = path.join(parent, 'initial'), deployed = path.join(parent, 'relocated');
  await deployFromFrozenGraph('production', initial, root);
  await prepareArtifact(initial); await relocateArtifact(initial, deployed); await verifyArtifact(deployed);
  // Separate operator bundle: contains explicit tools that runtime lacks.
  const operator = path.join(parent, 'operator');
  await deployFromFrozenGraph('operator', operator, root);
  await mkdir(path.join(operator, 'dist/scripts/lib'), { recursive: true });
  for (const file of ['dist/scripts/staging-operator.js', 'dist/scripts/lib/runtime-role.js', 'dist/src/database/seed.js', 'prisma7.config.ts']) {
    await cp(path.join(root, 'apps/api', file), path.join(operator, file));
  }
  await cp(path.join(root, 'apps/api/prisma'), path.join(operator, 'prisma'), { recursive: true });
  await prepareOperator(operator);
  const cluster = await LocalPostgres.initialize(await fixtureDirectory());
  try {
    await cluster.start(); const db = await createIsolatedDatabase(cluster, 'goease_artifact');
    const secretFile = path.join(parent, 'operator.env');
    await writeFile(secretFile, `DATABASE_MIGRATION_URL=${db.migrationUrl}\nDATABASE_URL=${db.runtimeUrl}\nRUNTIME_ROLE=${db.runtime}\n`, { mode: 0o600 });
    for (const command of ['migrate', 'grants', 'seed-sample', 'verify']) {
      try { await execute(process.execPath, [`--env-file=${secretFile}`, 'dist/scripts/staging-operator.js', command], { cwd: operator, timeout: 125_000, maxBuffer: 64 * 1024, windowsHide: true }); }
      catch { throw new Error(`Isolated operator ${command} failed; private fixture retained`); }
    }
    const runtimeEnv = { ...process.env, DATABASE_URL: db.runtimeUrl, RUNTIME_ROLE: db.runtime, NODE_PATH: '' };
    delete runtimeEnv.DATABASE_MIGRATION_URL;
    const proof = path.join(deployed, 'runtime-proof.mjs');
    await writeFile(proof, `import assert from 'node:assert/strict';
import { createDatabaseClient } from './dist/src/database/client.js';
const database = createDatabaseClient();
try { assert.equal(await database.place.count(), 3); assert.equal((await database.$queryRawUnsafe('SELECT current_user AS role'))[0].role, process.env.RUNTIME_ROLE); }
finally { await database.$disconnect(); }
console.info('Isolated PostgreSQL WASM query PASS');\n`);
    let result;
    try { result = await execute(process.execPath, [proof], { cwd: deployed, env: runtimeEnv, timeout: 15_000, maxBuffer: 64 * 1024, windowsHide: true }); }
    catch { throw new Error('Isolated runtime PostgreSQL query failed; private connection details are not logged'); }
    assert.match(result.stdout, /WASM query PASS/);
    // Actual deployed Nest API boots from its own runtime graph; no test provider.
    const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
    // TEST_ONLY config lets the actual guard reject anonymous requests before
    // any provider call. This is not a real OAuth client or authenticated user.
    const server = spawn(process.execPath, ['dist/src/main.js'], { cwd: deployed, env: { ...runtimeEnv, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), WEB_ORIGINS: 'https://admin.invalid', GOOGLE_WEB_CLIENT_ID: '123-test-only.apps.googleusercontent.com' }, stdio: 'ignore', windowsHide: true });
    const exit = new Promise(resolve => { server.once('exit', resolve); server.once('error', () => resolve(-1)); });
    try {
      let health;
      for (let attempt = 0; attempt < 100; attempt++) {
        try { health = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) }); if (health.ok) break; } catch { /* Bounded startup polling. */ }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(health?.status, 200, 'Deployed actual API health must become ready');
      const admin = await fetch(`http://127.0.0.1:${port}/api/admin/places`, { signal: AbortSignal.timeout(3000) });
      assert.equal(admin.status, 401); assert.match(admin.headers.get('cache-control') ?? '', /no-store/);
    } finally { server.kill(); await exit; }
  } finally { await cluster.stopIfRunning(); }
});
