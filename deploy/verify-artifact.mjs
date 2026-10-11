/* global process, console */
import assert from 'node:assert/strict';
import { lstat, stat, readdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export async function verifyArtifact(directory) {
  const root = await realpath(directory), visited = new Set();
  async function walk(directory) {
    const actual = await realpath(directory);
    assert.ok(actual === root || actual.startsWith(root + path.sep), 'Runtime symlink escapes deployed directory');
    if (visited.has(actual)) return;
    visited.add(actual);
    for (const name of await readdir(directory)) {
      const file = path.join(directory, name), info = await lstat(file);
      if (info.isSymbolicLink()) {
        const target = await realpath(file);
        assert.ok(target.startsWith(root + path.sep), 'Runtime symlink escapes deployed directory');
        assert.ok(!/\.(?:map|tsx?|mts|cts)$/.test(name) && !/^\.env(?:\.|$)/.test(name), 'Runtime contains source, map or env link');
        if ((await stat(file)).isDirectory()) await walk(file);
      }
      else if (info.isDirectory()) await walk(file);
      else assert.ok(!/\.(?:map|tsx?|mts|cts)$/.test(name) && !/^\.env(?:\.|$)/.test(name), 'Runtime contains source, map or env file');
    }
  }
  await walk(root);
  const require = createRequire(path.join(root, 'package.json'));
  for (const module of ['@nestjs/testing', 'prisma']) assert.throws(() => require.resolve(module), 'Runtime must exclude development/operator modules');
  for (const forbidden of ['test', 'scripts', 'prisma', 'prisma7.config.ts', 'dist/test', 'dist/scripts', 'dist/src/database/seed.js', 'dist/src/modules/ai/probe.js', 'dist/src/modules/maps/probe.js']) {
    await assert.rejects(lstat(path.join(root, forbidden)), { code: 'ENOENT' });
  }
  // Contracts deliberately expose only ESM import/types, no CommonJS condition.
  const contracts = await realpath(path.join(root, 'node_modules/@goease/contracts/dist/index.js'));
  assert.ok(contracts.startsWith(root + path.sep), 'Contracts resolve outside artifact');
  assert.equal(typeof (await import(pathToFileURL(contracts).href)).isHealthResponse, 'function');
  for (const module of ['@prisma/client/runtime/client', '@prisma/client/runtime/query_compiler_fast_bg.postgresql.mjs', '@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs']) {
    const resolved = await realpath(require.resolve(module));
    assert.ok(resolved.startsWith(root + path.sep), 'Runtime module resolves outside artifact');
  }
  const generated = await import(pathToFileURL(path.join(root, 'dist/src/generated/prisma/client.js')).href);
  assert.equal(typeof generated.PrismaClient, 'function');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await verifyArtifact(process.argv[2]); console.info('Isolated runtime artifact verified (including PostgreSQL WASM).'); }
  catch { console.error('Runtime artifact verification failed.'); process.exitCode = 1; }
}
