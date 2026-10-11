/* global process, console */
import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
/** Materialize the platform engine during build, before read-only startup. */
export async function prepareOperator(directory) {
  const root = await realpath(directory);
  try {
    const cli = await realpath(path.join(root, 'node_modules/prisma/build/index.js'));
    await execute(process.execPath, [cli, '--version'], { cwd: root, timeout: 90_000, maxBuffer: 64 * 1024, windowsHide: true });
    const require = createRequire(cli), engineEntry = require.resolve('@prisma/engines');
    const engineRequire = createRequire(engineEntry);
    const platform = await engineRequire('@prisma/get-platform').getBinaryTargetForCurrentPlatform();
    if (!/^[a-z0-9._-]+$/.test(platform)) throw new Error('Invalid engine platform');
    const engine = await realpath(path.join(path.dirname(path.dirname(engineEntry)), `schema-engine-${platform}${platform === 'windows' ? '.exe' : ''}`));
    if (!engine.startsWith(root + path.sep)) throw new Error('Operator engine escapes artifact');
    await execute(engine, ['--version'], { cwd: root, timeout: 15_000, maxBuffer: 16 * 1024, windowsHide: true });
  } catch { throw new Error('Operator platform engine preparation failed; no child diagnostics are logged'); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await prepareOperator(process.argv[2]); console.info('Operator platform engine prepared and executable before read-only startup.'); }
  catch { console.error('Operator platform engine preparation failed.'); process.exitCode = 1; }
}
