/* global process, console, URL */
import { lstat, stat, readdir, realpath, unlink, rename, symlink, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
/** pnpm Windows junctions are absolute. Relocate only contained artifact links. */
export async function relocateArtifact(directory, destination) {
  const root = await realpath(directory), target = path.resolve(destination), links = [];
  if (path.dirname(root) !== path.dirname(target) || root === target) throw new Error('Artifact relocation requires a fresh sibling target');
  try { await lstat(target); throw new Error('Artifact relocation target exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  async function inspect(directory) {
    for (const name of await readdir(directory)) {
      const file = path.join(directory, name), info = await lstat(file);
      if (info.isSymbolicLink()) {
        const actual = await realpath(file);
        if (!actual.startsWith(root + path.sep)) throw new Error('Artifact link escapes package');
        links.push({ file: path.relative(root, file), target: path.relative(root, actual), directory: (await stat(file)).isDirectory() });
      } else if (info.isDirectory()) await inspect(file);
    }
  }
  // No mutation until both absolute paths and every source link have been checked.
  await inspect(root); await rename(root, target);
  for (const link of links) {
    const file = path.join(target, link.file), actual = path.join(target, link.target);
    await unlink(file);
    await symlink(process.platform === 'win32' ? actual : path.relative(path.dirname(file), actual), file,
      link.directory ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file');
  }
}
export async function isolateProjectLinks(directory, sourceApi = fileURLToPath(new URL('../apps/api/', import.meta.url))) {
  const root = await realpath(directory);
  // pnpm legacy deploy includes a redundant root-project self alias back to the
  // workspace. This private package imports itself by relative paths; remove
  // this one named alias, then reject every other external link below.
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (manifest?.name === '@goease/api') {
    const alias = path.join(root, 'node_modules/.pnpm/node_modules/@goease/api');
    try {
      // Validate the physical parent before unlinking: a redirected ancestor
      // must never turn this narrow cleanup into an outside-file mutation.
      if (!(await realpath(path.dirname(alias))).startsWith(root + path.sep)) throw new Error('Artifact self alias parent escapes package');
      if (!(await lstat(alias)).isSymbolicLink() || await realpath(alias) !== await realpath(sourceApi)) throw new Error('Unexpected project self alias');
      await unlink(alias);
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async function inspect(directory) {
    for (const name of await readdir(directory)) {
      const file = path.join(directory, name), info = await lstat(file);
      if (info.isSymbolicLink()) {
        if (!(await realpath(file)).startsWith(root + path.sep)) throw new Error('Artifact link escapes package');
      } else if (info.isDirectory()) await inspect(file);
    }
  }
  await inspect(root); return root;
}
export async function prepareArtifact(directory, sourceApi) {
  const root = await isolateProjectLinks(directory, sourceApi), visited = new Set();
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
