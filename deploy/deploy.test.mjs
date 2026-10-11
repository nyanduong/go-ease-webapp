/* global process */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { publicClientId, stagingHost } from './validate.mjs';
import { prepareArtifact, relocateArtifact } from './prepare-artifact.mjs';
import { verifyArtifact } from './verify-artifact.mjs';
import { immutableImage, privateFile, stagingPreflight } from './preflight.mjs';
import { redactedPnpmFailure } from './pnpm-error.mjs';
import { assertArtifactDependencies } from './dependency-graph.mjs';

test('deployed versions must belong to the reachable frozen API graph, including scoped workspace contracts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'goease-dependency-source-'));
  const api = path.join(root, 'apps/api'), apiModules = path.join(api, 'node_modules');
  const writePackage = async (directory, value) => { await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, 'package.json'), JSON.stringify(value)); };
  const apiManifest = { name: '@goease/api', version: '0.1.0', dependencies: { leaf: '1.0.0', '@goease/contracts': 'workspace:*' }, devDependencies: { tooling: '2.0.0' } };
  await writePackage(root, { name: 'goease', version: '0.1.0' });
  await writePackage(api, apiManifest); await mkdir(path.join(apiModules, '@goease'), { recursive: true });
  for (const [name, version] of [['leaf', '1.0.0'], ['tooling', '2.0.0'], ['unrelated', '9.0.0']]) {
    const directory = path.join(root, `node_modules/.pnpm/${name}@${version}/node_modules/${name}`);
    await writePackage(directory, { name, version });
    if (name !== 'unrelated') await symlink(directory, path.join(apiModules, name), process.platform === 'win32' ? 'junction' : 'dir');
  }
  const contracts = path.join(root, 'packages/contracts'); await writePackage(contracts, { name: '@goease/contracts', version: '0.1.0' });
  await symlink(contracts, path.join(apiModules, '@goease/contracts'), process.platform === 'win32' ? 'junction' : 'dir');
  const artifact = await mkdtemp(path.join(os.tmpdir(), 'goease-dependency-artifact-'));
  await writePackage(artifact, apiManifest);
  await writePackage(path.join(artifact, 'node_modules/leaf'), { name: 'leaf', version: '1.0.0' });
  await writePackage(path.join(artifact, 'node_modules/@goease/contracts'), { name: '@goease/contracts', version: '0.1.0' });
  assert.equal(await assertArtifactDependencies(root, artifact, 'production'), 3);
  await writePackage(path.join(artifact, 'node_modules/leaf'), { name: 'leaf', version: '1.0.1' });
  await assert.rejects(assertArtifactDependencies(root, artifact, 'production'), /outside the frozen API graph/);
  await writePackage(path.join(artifact, 'node_modules/leaf'), { name: 'leaf', version: '1.0.0' });
  await writePackage(path.join(artifact, 'node_modules/unrelated'), { name: 'unrelated', version: '9.0.0' });
  await assert.rejects(assertArtifactDependencies(root, artifact, 'operator'), /outside the frozen API graph/);
  const operator = await mkdtemp(path.join(os.tmpdir(), 'goease-dependency-operator-')); await writePackage(operator, apiManifest);
  await writePackage(path.join(operator, 'node_modules/tooling'), { name: 'tooling', version: '2.0.0' });
  assert.equal(await assertArtifactDependencies(root, operator, 'operator'), 2);
  await assert.rejects(assertArtifactDependencies(root, operator, 'production'), /outside the frozen API graph/);
});

test('pnpm failures disclose only bounded identifiers, never child output or cause', () => {
  const failure = redactedPnpmFailure('production', {
    stderr: 'ERR_PNPM_NO_OFFLINE_TARBALL failed https://TEST_ONLY_SECRET@private.invalid/package',
    stdout: 'DATABASE_URL=TEST_ONLY_PRIVATE_VALUE', code: 1,
  });
  assert.match(failure.message, /\(ERR_PNPM_NO_OFFLINE_TARBALL\)/);
  assert.doesNotMatch(failure.message + failure.stack, /TEST_ONLY|https|DATABASE_URL/);
  assert.equal(failure.cause, undefined);
  assert.match(redactedPnpmFailure('operator', { code: 'ETIMEDOUT' }).message, /\(ETIMEDOUT\)/);
  assert.match(redactedPnpmFailure('unsafe PRIVATE_STAGE', { stderr: 'secret only' }).message, /^Isolated operator deploy failed \(COMMAND_FAILED\)/);
});

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
  for (const flag of ['"true"', 'true # comment', "'true'", ' TRUE']) {
    await writeFile(env.GOEASE_API_ENV_FILE, valid + `MAPS_ROUTES_ENABLED=${flag}\n`);
    await assert.rejects(stagingPreflight(env, root));
  }
  await writeFile(env.GOEASE_API_ENV_FILE, valid + 'MAPS_ROUTES_ENABLED=true\n');
  await assert.rejects(stagingPreflight(env, root), /attested/);
  assert.deepEqual(await stagingPreflight({ ...env, GOEASE_ALLOW_PAID_PROVIDER: 'owner-attested' }, root), { host: 'admin.goease.vn', secretFiles: 4 });
  await writeFile(env.GOEASE_API_ENV_FILE, valid + 'MAPS_ROUTES_ENABLED=false\n');
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
test('artifact relocation rebases contained junctions and refuses occupied or escaping destinations', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'goease-artifact-move-'));
  const original = path.join(parent, 'original'), moved = path.join(parent, 'moved');
  await mkdir(path.join(original, 'actual'), { recursive: true });
  await writeFile(path.join(original, 'actual/keep.js'), 'TEST_ONLY');
  await symlink(path.join(original, 'actual'), path.join(original, 'dependency'), process.platform === 'win32' ? 'junction' : 'dir');
  await relocateArtifact(original, moved);
  assert.equal(await readFile(path.join(moved, 'dependency/keep.js'), 'utf8'), 'TEST_ONLY');
  await assert.rejects(readFile(path.join(original, 'actual/keep.js')), { code: 'ENOENT' });
  await assert.rejects(relocateArtifact(moved, path.join(parent, '../outside')), /sibling/);
  await mkdir(original); await assert.rejects(relocateArtifact(moved, original), /exists/);
});
test('pnpm redundant API self alias is removed, without following it into workspace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'goease-artifact-self-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'goease-artifact-workspace-'));
  await writeFile(path.join(root, 'package.json'), '{"name":"@goease/api"}');
  await writeFile(path.join(outside, 'keep.ts'), 'TEST_ONLY');
  const aliases = path.join(root, 'node_modules/.pnpm/node_modules/@goease'); await mkdir(aliases, { recursive: true });
  await symlink(outside, path.join(aliases, 'api'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(prepareArtifact(root), /Unexpected project self alias/);
  await prepareArtifact(root, outside);
  await assert.rejects(readFile(path.join(aliases, 'api/keep.ts')), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(outside, 'keep.ts'), 'utf8'), 'TEST_ONLY');
});
test('self alias under an escaping ancestor is refused before any outside unlink', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'goease-artifact-ancestor-'));
  const ancestor = await mkdtemp(path.join(os.tmpdir(), 'goease-artifact-external-ancestor-'));
  const source = await mkdtemp(path.join(os.tmpdir(), 'goease-artifact-external-source-'));
  await writeFile(path.join(root, 'package.json'), '{"name":"@goease/api"}');
  await writeFile(path.join(source, 'keep.ts'), 'TEST_ONLY');
  const aliases = path.join(ancestor, '.pnpm/node_modules/@goease'); await mkdir(aliases, { recursive: true });
  await symlink(source, path.join(aliases, 'api'), process.platform === 'win32' ? 'junction' : 'dir');
  await symlink(ancestor, path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(prepareArtifact(root, source), /parent escapes/);
  assert.equal(await readFile(path.join(aliases, 'api/keep.ts'), 'utf8'), 'TEST_ONLY');
  assert.equal(await readFile(path.join(source, 'keep.ts'), 'utf8'), 'TEST_ONLY');
});
