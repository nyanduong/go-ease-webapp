import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createDatabaseClient } from '../src/database/client.js';
import { seedCatalog } from '../src/database/seed.js';
import { createIsolatedDatabase, grantRuntime, LocalPostgres, runTool } from '../test/helpers/postgres.js';

const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
const local = path.join(apiRoot, '.local');
const clusterDirectory = path.join(local, 'postgres');
const environmentFile = path.join(local, 'database.json');
const command = process.argv[2];
async function environment() {
  const data: unknown = JSON.parse(await readFile(environmentFile, 'utf8'));
  if (!data || typeof data !== 'object' || !('databaseName' in data) || data.databaseName !== 'goease_local' || !('migrationUrl' in data) || typeof data.migrationUrl !== 'string' || !('runtimeUrl' in data) || typeof data.runtimeUrl !== 'string' || !('runtime' in data) || data.runtime !== 'goease_local_app') throw new Error('Owned local database record is invalid');
  for (const connection of [data.migrationUrl, data.runtimeUrl]) {
    const url = new URL(connection);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/goease_local') throw new Error('Only the isolated local GoEase database is allowed');
  }
  return { migrationUrl: data.migrationUrl, runtimeUrl: data.runtimeUrl, runtime: data.runtime, databaseName: 'goease_local' };
}
try {
  if (command === 'init') {
    if (existsSync(environmentFile) || existsSync(path.join(apiRoot, '.env.local'))) throw new Error('Existing local config found; refusing overwrite');
    await mkdir(local, { recursive: true, mode: 0o700 });
    const cluster = await LocalPostgres.initialize(clusterDirectory);
    await cluster.start();
    const config = await createIsolatedDatabase(cluster, 'goease_local');
    await writeFile(environmentFile, JSON.stringify(config), { mode: 0o600 });
    await writeFile(path.join(apiRoot, '.env.local'), `DATABASE_URL=${config.runtimeUrl}\nDATABASE_MIGRATION_URL=${config.migrationUrl}\n`, { mode: 0o600 });
    console.info('Isolated GoEase PostgreSQL initialized on loopback; private config: apps/api/.env.local. No existing service/database changed.');
  } else if (command === 'start' || command === 'stop') {
    const cluster = await LocalPostgres.reopen(clusterDirectory);
    if (command === 'start') await cluster.start(); else await cluster.stop();
    console.info(`Owned GoEase cluster ${command} completed.`);
  } else if (command === 'migrate') {
    const config = await environment();
    await runTool(process.execPath, [path.join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', path.join(apiRoot, 'prisma7.config.ts')], { ...process.env, DATABASE_MIGRATION_URL: config.migrationUrl });
    await grantRuntime(config.migrationUrl, config.runtime);
    console.info('Migrations and minimum runtime grants applied to isolated GoEase local DB.');
  } else if (command === 'seed') {
    const config = await environment();
    const database = createDatabaseClient(config.migrationUrl);
    try { await seedCatalog(database); } finally { await database.$disconnect(); }
    console.info('Three labelled sample points seeded; no users/admin created.');
  } else if (command === 'backup') {
    const config = await environment();
    const cluster = await LocalPostgres.reopen(clusterDirectory);
    const connection = new URL(config.migrationUrl);
    const backup = path.join(local, 'goease-local.dump');
    if (existsSync(backup)) throw new Error('Existing backup found; preserve/rename it before making another');
    await runTool(path.join(cluster.bin, 'pg_dump'), ['-h', '127.0.0.1', '-p', `${cluster.port}`, '-U', decodeURIComponent(connection.username), '-d', config.databaseName, '-Fc', '-f', backup], { ...process.env, PGPASSWORD: decodeURIComponent(connection.password) });
    console.info('Backup saved privately at apps/api/.local/goease-local.dump (contains private data; never commit/upload).');
  } else if (command === 'restore-check') {
    const cluster = await LocalPostgres.reopen(clusterDirectory);
    const name = `goease_restore_${randomBytes(4).toString('hex')}`;
    const config = await createIsolatedDatabase(cluster, name);
    const target = new URL(config.migrationUrl);
    await runTool(path.join(cluster.bin, 'pg_restore'), ['-h', '127.0.0.1', '-p', `${cluster.port}`, '-U', decodeURIComponent(target.username), '-d', name, '--no-owner', '--no-privileges', '--exit-on-error', path.join(local, 'goease-local.dump')], { ...process.env, PGPASSWORD: decodeURIComponent(target.password) });
    await grantRuntime(config.migrationUrl, config.runtime);
    const db = createDatabaseClient(config.runtimeUrl);
    try { console.info(`Restore check into new isolated DB succeeded; sample places=${await db.place.count()}.`); }
    finally { await db.$disconnect(); }
    await writeFile(path.join(local, `${name}.json`), JSON.stringify(config), { mode: 0o600 });
  } else if (command === 'reset-test') {
    // A new disposable DB every time; never drop local/staging or another project.
    const cluster = await LocalPostgres.reopen(clusterDirectory);
    const name = `goease_manual_test_${randomBytes(4).toString('hex')}`;
    const config = await createIsolatedDatabase(cluster, name);
    await writeFile(path.join(local, 'manual-test.json'), JSON.stringify(config), { mode: 0o600 });
    console.info('Fresh isolated test DB created; private URLs in apps/api/.local/manual-test.json. Existing DBs untouched.');
  } else if (command === 'check') {
    const config = await environment();
    const client = new pg.Client({ connectionString: config.runtimeUrl });
    await client.connect();
    try {
      const result = await client.query('SELECT current_database() AS database, current_user AS role, (SELECT count(*)::int FROM "Place") AS places');
      console.info(result.rows[0]); // Names/count only; no URL, token or subject.
    } finally { await client.end(); }
  } else throw new Error('Use init|start|stop|migrate|seed|check|backup|restore-check|reset-test');
} catch {
  // Do not print driver/Prisma errors: metadata may contain URLs, SQL or binds.
  console.error('Local DB operation failed; inspect the private environment and documented prerequisites. No credential was printed.');
  process.exitCode = 1;
}
