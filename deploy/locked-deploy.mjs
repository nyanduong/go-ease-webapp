/* global process, console */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { assertArtifactDependencies } from './dependency-graph.mjs';
import { isolateProjectLinks } from './prepare-artifact.mjs';
import { redactedPnpmFailure } from './pnpm-error.mjs';

const execute = promisify(execFile), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function deployFromFrozenGraph(stage, target, source = root) {
  if (!['production', 'operator'].includes(stage)) throw new Error('Invalid deployment stage');
  const cli = process.env.npm_execpath;
  if (!cli || !/\.(?:c?js)$/.test(cli)) throw new Error('Run deployment through pinned pnpm exec');
  const lockfile = path.join(source, 'pnpm-lock.yaml'), before = await readFile(lockfile);
  let failure;
  try {
    const args = [cli, '--filter', '@goease/api', 'deploy', '--legacy', ...(stage === 'production' ? ['--prod'] : []), '--no-optional', target];
    // Frozen root installation remains mandatory. Legacy deployment needs
    // registry metadata on a fresh runner, so it cannot promise offline mode.
    try { await execute(process.execPath, args, { cwd: source, timeout: 90_000, maxBuffer: 1024 * 1024, windowsHide: true }); }
    catch (error) { throw redactedPnpmFailure(stage, error); }
    await isolateProjectLinks(target, path.join(source, 'apps/api'));
    await assertArtifactDependencies(source, target, stage);
  } catch (error) { failure = error; }
  if (!before.equals(await readFile(lockfile))) throw new Error('Root lockfile changed during isolated deployment');
  if (failure) throw failure;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await deployFromFrozenGraph(process.argv[2], process.argv[3]); console.info('Isolated dependency graph matches frozen API installation; root lockfile unchanged.'); }
  catch (error) {
    const safe = /^Isolated (?:production|operator) deploy failed \((?:ERR_PNPM_[A-Z0-9_]{1,64}|ETIMEDOUT|COMMAND_FAILED)\); raw child output is not logged$/.test(error.message);
    console.error(safe ? error.message : 'Isolated dependency graph verification failed; raw details are not logged.'); process.exitCode = 1;
  }
}
