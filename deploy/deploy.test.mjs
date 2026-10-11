/* global process */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { publicClientId, stagingHost } from './validate.mjs';
import { prepareArtifact } from './prepare-artifact.mjs';
import { verifyArtifact } from './verify-artifact.mjs';
import { immutableImage, privateFile, stagingPreflight } from './preflight.mjs';

test('public configuration cannot inject proxy syntax or invent OAuth config', () => {
  assert.equal(stagingHost('admin.goease.vn'), 'admin.goease.vn');
  for (const host of ['localhost', '127.0.0.1', 'fake.example', 'admin.test', 'admin.goease.vn;return 200', 'admin.goease.vn\n', 'admin..goease.vn', 'https://admin.goease.vn', 'admin.goease.vn:443', 'Admin.goease.vn']) assert.throws(() => stagingHost(host));
  assert.equal(publicClientId(undefined), '');
  assert.equal(publicClientId('123-test.apps.googleusercontent.com'), '123-test.apps.googleusercontent.com');
  for (const id of ['autoDetect', 'private-key', '123-test.apps.googleusercontent.com\n']) assert.throws(() => publicClientId(id));
});
test('preflight rejects mutable images, source-context secrets and runtime migration privilege', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'goease-preflight-context-'));
  const secrets = await mkdtemp(path.join(os.tmpdir(), 'goease-preflight-private-'));
  const env = { STAGING_HOST: 'admin.goease.vn' };
  for (const name of ['GOEASE_API_IMAGE', 'GOEASE_ADMIN_IMAGE', 'GOEASE_OPERATOR_IMAGE', 'GOEASE_PG_TOOLS_IMAGE']) env[name] = 'sha256:' + 'a'.repeat(64);
  for (const name of ['GOEASE_API_ENV_FILE', 'GOEASE_OPERATOR_ENV_FILE', 'GOEASE_PG_SERVICE_FILE', 'GOEASE_PG_PASS_FILE']) {
    env[name] = path.join(secrets, name); await writeFile(env[name], 'TEST_ONLY');
  }
  const valid = 'DATABASE_URL=postgresql://TEST_ONLY@database/goease_test\nWEB_ORIGINS=https://admin.goease.vn\n';
  await writeFile(env.GOEASE_API_ENV_FILE, valid);
  assert.deepEqual(await stagingPreflight(env, root), { host: 'admin.goease.vn', secretFiles: 4 });
  await writeFile(env.GOEASE_API_ENV_FILE, valid + 'DATABASE_MIGRATION_URL=TEST_ONLY\n');
  await assert.rejects(stagingPreflight(env, root));
  const inside = path.join(root, 'private'); await writeFile(inside, 'TEST_ONLY');
  await assert.rejects(privateFile(inside, root), /outside/);
  assert.equal(immutableImage('registry.invalid/goease/api@sha256:' + 'b'.repeat(64)), 'registry.invalid/goease/api@sha256:' + 'b'.repeat(64));
  for (const image of ['goease/api:latest', 'goease/api:0.1', 'sha256:bad']) assert.throws(() => immutableImage(image));
});
test('artifact cleanup removes source/map/env and leaves executable JS/WASM', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'goease-artifact-unit-'));
  await mkdir(path.join(root, 'nested'));
  for (const file of ['main.js', 'query.wasm', 'nested/source.ts', 'nested/types.d.ts', '.env.local', 'main.js.map']) await writeFile(path.join(root, file), 'TEST_ONLY');
  await prepareArtifact(root);
  assert.equal(await readFile(path.join(root, 'main.js'), 'utf8'), 'TEST_ONLY');
  assert.equal(await readFile(path.join(root, 'query.wasm'), 'utf8'), 'TEST_ONLY');
  for (const file of ['nested/source.ts', 'nested/types.d.ts', '.env.local', 'main.js.map']) await assert.rejects(readFile(path.join(root, file)), { code: 'ENOENT' });
});
test('artifact preparation rejects workspace-escaping directory links', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'goease-artifact-link-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'goease-artifact-outside-'));
  await writeFile(path.join(outside, 'keep.ts'), 'TEST_ONLY');
  await symlink(outside, path.join(root, 'external'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(prepareArtifact(root), /escapes/);
  assert.equal(await readFile(path.join(outside, 'keep.ts'), 'utf8'), 'TEST_ONLY');
});
test('artifact verification refuses source before any runtime import', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'goease-artifact-refuse-'));
  await writeFile(path.join(root, '.env'), 'TEST_ONLY');
  await assert.rejects(verifyArtifact(root), /source, map or env/);
});
test('contained forbidden-name link is removed without deleting its target', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'goease-artifact-contained-'));
  const target = path.join(root, 'runtime'); await mkdir(target);
  await writeFile(path.join(target, 'keep.js'), 'TEST_ONLY');
  await symlink(target, path.join(root, '.env'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyArtifact(root), /env link/);
  await prepareArtifact(root);
  assert.equal(await readFile(path.join(target, 'keep.js'), 'utf8'), 'TEST_ONLY');
  await assert.rejects(readFile(path.join(root, '.env/keep.js')), { code: 'ENOENT' });
});
