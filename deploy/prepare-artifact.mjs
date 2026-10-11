/* global process, console */
import { lstat, stat, readdir, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export async function prepareArtifact(directory) {
  const root = await realpath(directory), visited = new Set();
  async function walk(directory) {
    const actual = await realpath(directory);
    if (actual !== root && !actual.startsWith(root + path.sep)) throw new Error('Artifact link escapes package');
    if (visited.has(actual)) return;
    visited.add(actual);
    for (const name of await readdir(directory)) {
      const file = path.join(directory, name), info = await lstat(file);
      if (info.isSymbolicLink()) {
        const target = await realpath(file);
        if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Artifact link escapes package');
        if (/\.(?:map|tsx?|mts|cts)$/.test(name) || /^\.env(?:\.|$)/.test(name)) { await unlink(file); continue; }
        if ((await stat(file)).isDirectory()) await walk(file);
        continue;
      }
      if (info.isDirectory()) await walk(file);
      else if (/\.(?:map|tsx?|mts|cts)$/.test(name) || /^\.env(?:\.|$)/.test(name)) await unlink(file);
    }
  }
  await walk(root);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await prepareArtifact(process.argv[2]); console.info('Runtime debug/type/env files removed.'); }
  catch { console.error('Runtime artifact preparation failed.'); process.exitCode = 1; }
}
