import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDatabaseClient } from '../src/database/client.js';
import { seedCatalog } from '../src/database/seed.js';
import { grantRuntime, verifyRuntime } from './lib/runtime-role.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function runStagingOperator(command: string, env = process.env) {
  const migration = env['DATABASE_MIGRATION_URL'], runtime = env['DATABASE_URL'], role = env['RUNTIME_ROLE'];
  if (command === 'verify') {
    if (!runtime || !role) throw new Error('Runtime verification configuration required');
    await verifyRuntime(runtime, role); return;
  }
  if (!migration) throw new Error('Explicit migration configuration required');
  if (command === 'migrate') {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', path.join(root, 'prisma7.config.ts')], {
        cwd: root, env, stdio: 'ignore', windowsHide: true,
      });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Migration timed out; verify status before retry')); }, 120_000);
      child.once('error', () => { clearTimeout(timer); reject(new Error('Migration could not start')); });
      child.once('exit', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error('Migration failed; inspect private database configuration')); });
    }); return;
  }
  if (command === 'grants') {
    if (!role) throw new Error('Explicit runtime role required');
    await grantRuntime(migration, role); return;
  }
  if (command === 'seed-sample') {
    // No fallback to API credentials; explicit command may reactivate sample rows.
    const database = createDatabaseClient(migration);
    try { await seedCatalog(database); } finally { await database.$disconnect(); }
    return;
  }
  throw new Error('Expected migrate, grants, seed-sample or verify');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runStagingOperator(process.argv[2] ?? ''); console.info('Staging operator completed.'); }
  catch { console.error('Staging operator failed; credentials and database details are not logged.'); process.exitCode = 1; }
}
