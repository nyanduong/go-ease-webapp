import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const apiSuite = fileURLToPath(new URL('./api.test.js', import.meta.url));
const tempRoot = resolve(tmpdir());
const cases = [
  { name: 'không có env file', file: undefined, runtime: {} },
  { name: 'env file local hợp lệ khác mặc định', file: 'NODE_ENV=development\nPORT=3019\nWEB_ORIGINS=http://127.0.0.1:5173\n', runtime: {} },
  { name: 'runtime env hợp lệ khác mặc định', file: undefined, runtime: { NODE_ENV: 'production', PORT: '3018', WEB_ORIGINS: 'https://local.example',
    DATABASE_URL: 'TEST-ONLY-invalid-personal-env', GOOGLE_WEB_CLIENT_ID: 'TEST-ONLY-invalid-client' } },
  { name: 'file và runtime env không hợp lệ', file: 'NODE_ENV=preview\nPORT=invalid\nWEB_ORIGINS=*\n', runtime: { NODE_ENV: 'preview', PORT: 'invalid', WEB_ORIGINS: '*' } },
];

function cleanEnvironment() {
  const env = { ...process.env };
  for (const key of ['NODE_ENV', 'PORT', 'WEB_ORIGINS', 'DATABASE_URL', 'GOOGLE_WEB_CLIENT_ID']) delete env[key];
  // A fresh Node test runner must not inherit the parent's child-runner marker.
  delete env.NODE_TEST_CONTEXT;
  return env;
}

async function withFixture(work: (cwd: string) => Promise<void>) {
  const cwd = await mkdtemp(join(tempRoot, 'goease-api-env-'));
  try { await work(cwd); } finally {
    const location = relative(tempRoot, resolve(cwd));
    assert.ok(location.startsWith('goease-api-env-') && !location.includes('..'));
    await rm(cwd, { recursive: true, force: true });
  }
}

for (const fixture of cases) {
  test(`suite HTTP thật độc lập với ${fixture.name}`, async () => {
    await withFixture(async (cwd) => {
      if (fixture.file) await writeFile(join(cwd, '.env'), fixture.file);
      const { stdout } = await run(process.execPath, ['--test', '--test-reporter=tap', apiSuite], {
        cwd, env: { ...cleanEnvironment(), ...fixture.runtime }, timeout: 30000,
      });
      assert.match(stdout, /# tests 4\b/);
      assert.match(stdout, /# pass 4\b/);
      assert.match(stdout, /# fail 0\b/);
    });
  });
}

test('bootstrap mặc định vẫn từ chối production thiếu WEB_ORIGINS', async () => {
  await withFixture(async (cwd) => {
    const appUrl = new URL('../src/app.js', import.meta.url).href;
    const source = `import assert from 'node:assert/strict';
      const { createApp } = await import(${JSON.stringify(appUrl)});
      await assert.rejects(createApp({ logging: false }), /WEB_ORIGINS/);`;
    await run(process.execPath, ['--input-type=module', '-e', source], {
      cwd, env: { ...cleanEnvironment(), NODE_ENV: 'production' }, timeout: 30000,
    });
  });
});
