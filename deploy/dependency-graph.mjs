import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

const inside = (root, file) => file === root || file.startsWith(root + path.sep);
const packageName = /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/;
async function manifest(directory) {
  const value = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  if (!packageName.test(value.name ?? '') || typeof value.version !== 'string' || value.version.length > 128) throw new Error('Invalid installed package identity');
  return value;
}
async function resolveInstalled(directory, name, root) {
  if (!packageName.test(name)) throw new Error('Invalid installed dependency name');
  for (let parent = directory; inside(root, parent); parent = path.dirname(parent)) {
    try {
      const found = await realpath(path.join(parent, 'node_modules', name));
      if (!inside(root, found)) throw new Error('Frozen source dependency escapes workspace');
      return found;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (parent === root) break;
  }
  return undefined;
}
async function sourceClosure(root, stage) {
  const allowed = new Set(), seen = new Set();
  async function visit(directory, includeDev = false) {
    const actual = await realpath(directory);
    if (!inside(root, actual)) throw new Error('Frozen source dependency escapes workspace');
    if (seen.has(actual)) return;
    seen.add(actual);
    const value = await manifest(actual); allowed.add(`${value.name}@${value.version}`);
    const required = { ...value.dependencies, ...(includeDev ? value.devDependencies : {}) };
    const peers = value.peerDependencies ?? {};
    for (const name of new Set([...Object.keys(required), ...Object.keys(peers)])) {
      const dependency = await resolveInstalled(actual, name, root);
      if (!dependency) {
        if (!(name in required) && value.peerDependenciesMeta?.[name]?.optional) continue;
        throw new Error('Frozen API dependency closure is incomplete');
      }
      await visit(dependency);
    }
  }
  await visit(path.join(root, 'apps/api'), stage === 'operator');
  // Legacy full-tool deployment also includes the workspace root dev tools.
  // Admit their reachable installed closure only in the operator bundle.
  if (stage === 'operator') await visit(root, true);
  return allowed;
}
/** Inventory the installed API closure, not unrelated web/mobile versions. */
export async function assertArtifactDependencies(sourceDirectory, artifactDirectory, stage) {
  if (!['production', 'operator'].includes(stage)) throw new Error('Invalid deployment stage');
  const source = await realpath(sourceDirectory), artifact = await realpath(artifactDirectory);
  const allowed = await sourceClosure(source, stage), seen = new Set();
  let checked = 0;
  async function packageEntry(directory) {
    const actual = await realpath(directory);
    if (!inside(artifact, actual)) throw new Error('Deployed dependency escapes artifact');
    if (seen.has(actual)) return;
    seen.add(actual);
    const value = await manifest(actual);
    if (!allowed.has(`${value.name}@${value.version}`)) throw new Error('Deployed dependency version is outside the frozen API graph');
    checked++;
    await modules(path.join(actual, 'node_modules'));
  }
  async function modules(directory) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const file = path.join(directory, entry.name);
      if (entry.name.startsWith('@')) {
        for (const scoped of await readdir(file)) await packageEntry(path.join(file, scoped));
      } else await packageEntry(file);
    }
    // pnpm's physical package entries include transitive packages not exposed
    // by root aliases. All must satisfy the same frozen source closure.
    const store = path.join(directory, '.pnpm');
    let packages;
    try { packages = await readdir(store, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of packages) if (entry.isDirectory()) await modules(path.join(store, entry.name, 'node_modules'));
  }
  await packageEntry(artifact);
  return checked;
}
