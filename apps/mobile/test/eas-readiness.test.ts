import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildConfig } from '../app.config.ts';

const execute = promisify(execFile);
const repository = fileURLToPath(new URL('../../..', import.meta.url));
async function fixture(t: TestContext) {
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(join(parent, 'goease-eas-test-'));
  t.after(async () => {
    const target = await realpath(directory);
    assert.equal(dirname(target), parent);
    assert.ok(relative(parent, target).startsWith('goease-eas-test-'));
    await rm(target, { recursive: true, force: true });
  });
  return directory;
}

test('EAS profiles select separate cloud environments and pinned tools without changing internal variants', async () => {
  const profiles = JSON.parse(await readFile(join(repository, 'apps/mobile/eas.json'), 'utf8')).build;
  const root = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'));
  const node = (await readFile(join(repository, '.node-version'), 'utf8')).trim();
  for (const variant of ['development', 'preview']) {
    const profile = profiles[variant];
    assert.equal(profile.environment, variant);
    assert.equal(profile.env.GOEASE_APP_VARIANT, variant);
    assert.equal(profile.node, node);
    assert.equal(`pnpm@${profile.pnpm}`, root.packageManager);
    assert.equal(profile.distribution, 'internal');
    assert.equal(profile.android.buildType, 'apk');
    assert.equal(profile.developmentClient, variant === 'development');
  }
  assert.equal(profiles['development-simulator'].extends, 'development');
  assert.equal(profiles['development-simulator'].ios.simulator, true);
});

test('Each iOS variant generates its own OAuth scheme while preview retains HTTPS and native plugins', () => {
  const web = '123-test-only-web.apps.googleusercontent.com';
  for (const variant of ['development', 'preview']) {
    const ios = `456-test-only-ios-${variant}.apps.googleusercontent.com`;
    const config = buildConfig({ GOEASE_APP_VARIANT: variant, EXPO_PUBLIC_API_BASE_URL: 'https://api.goease.test/api',
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: web, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: ios });
    assert.equal(config.ios?.bundleIdentifier, `vn.goease.mobile.${variant === 'development' ? 'dev' : 'preview'}`);
    assert.ok(JSON.stringify(config.plugins).includes(`com.googleusercontent.apps.456-test-only-ios-${variant}`));
    assert.ok(JSON.stringify(config.plugins).includes('react-native-maps'));
    assert.ok(JSON.stringify(config.plugins).includes('expo-secure-store'));
    assert.deepEqual(config.extra?.nativeMapsConfigured, { android: false, ios: false });
    assert.equal(config.extra?.appVariant, variant);
    assert.equal(config.owner, 'nyan1126s-team');
    assert.equal(config.extra?.eas.projectId, '38b47740-0837-4b2c-a34e-95be5c4cffa6');
    assert.equal(config.ios?.infoPlist?.NSAppTransportSecurity.NSAllowsArbitraryLoads, variant === 'development');
  }
  assert.throws(() => buildConfig({ GOEASE_APP_VARIANT: 'preview' }));
  assert.throws(() => buildConfig({ GOEASE_APP_VARIANT: 'preview', EXPO_PUBLIC_API_BASE_URL: 'http://10.0.2.2:3000/api' }));
});

test('Git and EAS upload rules reject local credentials and outputs but retain workspace source/manifests', async t => {
  const cwd = await fixture(t);
  await execute('git', ['init', '--quiet', cwd], { windowsHide: true });
  const denied = ['apps/api/.env', 'apps/mobile/.env.local', 'apps/web/.env.local', 'apps/mobile/credentials.json',
    'apps/mobile/keystore.properties', 'signer/release.jks', 'signer/release.keystore', 'signer/private.key',
    'signer/private.pem', 'signer/AuthKey.p8', 'signer/profile.mobileprovision', 'signer/certificate.p12',
    'signer/certificate.pfx', 'apps/mobile/android/app/build/app.apk', 'packages/contracts/dist/index.js'];
  const allowed = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', '.npmrc', 'apps/mobile/package.json',
    'apps/api/package.json', 'apps/web/package.json', 'packages/contracts/package.json', 'packages/contracts/src/index.ts',
    'apps/mobile/src/features/auth/google.ts', 'apps/mobile/app.config.ts', 'apps/mobile/assets/splash.png', 'apps/mobile/.env.example'];
  // EAS replaces Git rules when .easignore exists. Exercise both complete rulesets against synthetic paths.
  // This does not invoke EAS or claim an actual archive was inspected.
  for (const rules of ['.gitignore', '.easignore']) {
    await cp(join(repository, rules), join(cwd, '.gitignore'));
    for (const path of [...denied, ...(rules === '.easignore' ? ['.git/config', '.git/objects/pack/history.pack'] : [])]) {
      const result = await execute('git', ['check-ignore', '--no-index', '--', path], { cwd, windowsHide: true });
      assert.equal(result.stdout.trim(), path);
    }
    for (const path of allowed) {
      await assert.rejects(execute('git', ['check-ignore', '--no-index', '--', path], { cwd, windowsHide: true }), { code: 1 });
    }
  }
});

test('Fresh EAS config loads before prebuild; post-install builds contracts for the mobile runtime', { timeout: 30_000 }, async t => {
  const cwd = await fixture(t);
  const mobile = join(cwd, 'apps/mobile');
  await mkdir(join(cwd, 'packages/contracts'), { recursive: true });
  await mkdir(join(mobile, 'node_modules/@goease'), { recursive: true });
  for (const file of ['package.json', 'pnpm-workspace.yaml', 'tsconfig.base.json', '.npmrc']) await cp(join(repository, file), join(cwd, file));
  for (const file of ['package.json', 'tsconfig.json', 'src']) await cp(join(repository, 'packages/contracts', file), join(cwd, 'packages/contracts', file), { recursive: true });
  await cp(join(repository, 'apps/mobile/package.json'), join(mobile, 'package.json'));
  await cp(join(repository, 'apps/mobile/app.config.ts'), join(mobile, 'app.config.ts'));
  await mkdir(join(mobile, 'src/lib'), { recursive: true });
  for (const file of ['config.ts', 'google-client-id.ts']) await cp(join(repository, 'apps/mobile/src/lib', file), join(mobile, 'src/lib', file));
  await symlink(join(repository, 'node_modules'), join(cwd, 'node_modules'), 'junction');
  await symlink(join(cwd, 'packages/contracts'), join(mobile, 'node_modules/@goease/contracts'), 'junction');
  const probe = join(mobile, 'probe.mjs');
  await writeFile(probe, "import { API_SERVICE } from '@goease/contracts'; if (API_SERVICE !== 'goease-api') throw Error('Invalid contracts'); console.log(API_SERVICE);\n");
  await assert.rejects(execute(process.execPath, [probe], { cwd: mobile, windowsHide: true }),
    (error: unknown) => error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.includes('ERR_MODULE_NOT_FOUND'));
  const configProbe = join(mobile, 'config-probe.mjs');
  await writeFile(configProbe, "import { buildConfig } from './app.config.ts'; for (const variant of ['development', 'preview']) { const config = buildConfig({ GOEASE_APP_VARIANT: variant, EXPO_PUBLIC_API_BASE_URL: 'https://api.goease.test/api', EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: '123-test-only-ios.apps.googleusercontent.com' }); if (!JSON.stringify(config.plugins).includes('com.googleusercontent.apps.123-test-only-ios')) throw Error('Missing native OAuth scheme'); } console.log('fresh-config-ok');\n");
  const configured = await execute(process.execPath, [configProbe], { cwd: mobile, windowsHide: true });
  assert.equal(configured.stdout.trim(), 'fresh-config-ok');
  const pnpm = process.env.npm_execpath;
  assert.ok(pnpm && /pnpm\.(?:c?js)$/.test(pnpm), 'Run this suite through pnpm so the pinned CLI is available.');
  await execute(process.execPath, [resolve(pnpm), 'run', 'eas-build-post-install'], { cwd: mobile, windowsHide: true, timeout: 20_000 });
  const loaded = await execute(process.execPath, [probe], { cwd: mobile, windowsHide: true });
  assert.equal(loaded.stdout.trim(), 'goease-api');
});
