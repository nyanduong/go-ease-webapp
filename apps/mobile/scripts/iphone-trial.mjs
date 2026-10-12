import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

export const MAX_IPA_BYTES = 100 * 1024 * 1024;

export function trialConfig(env) {
  assert.equal(env.GOEASE_APP_VARIANT, 'preview', 'Only the existing preview identity is allowed.');
  assert.equal(env.GOEASE_FREE_STORAGE_VERIFIED, 'true', 'Recheck account storage and zero-dollar stop budgets before dispatch.');
  assert.match(env.GOEASE_SOURCE_HEAD ?? '', /^[a-f0-9]{40}$/);
  const api = new URL(env.EXPO_PUBLIC_API_BASE_URL);
  assert.ok(api.protocol === 'https:' && api.pathname === '/api' && !api.port
    && !api.username && !api.password && !api.search && !api.hash
    && !isIP(api.hostname) && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(api.hostname)
    && !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(api.hostname), 'An approved public HTTPS API origin is required.');
  for (const name of ['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID']) {
    assert.match(env[name] ?? '', /^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/);
  }
  return { api: api.href, webId: env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosId: env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, source: env.GOEASE_SOURCE_HEAD };
}

export function inspectApp(app, info, env) {
  const config = trialConfig(env);
  assert.equal(info.CFBundleIdentifier, 'vn.goease.mobile.preview');
  assert.equal(info.CFBundleExecutable, 'GoEasePreview');
  assert.ok(info.CFBundleSupportedPlatforms?.includes('iPhoneOS'));
  assert.ok(info.UIDeviceFamily?.includes(1));
  assert.equal(info.NSAppTransportSecurity?.NSAllowsArbitraryLoads, false);
  assert.match(info.MinimumOSVersion ?? '', /^\d+(?:\.\d+){0,2}$/);
  const minimum = info.MinimumOSVersion.split('.').map(Number);
  const target = [18, 7, 10];
  const firstDifference = target.findIndex((part, index) => part !== (minimum[index] ?? 0));
  assert.ok(firstDifference === -1 || (minimum[firstDifference] ?? 0) < target[firstDifference], 'XS Max requires a compatible minimum OS.');
  const schemes = info.CFBundleURLTypes?.flatMap(value => value.CFBundleURLSchemes ?? []) ?? [];
  assert.ok(schemes.includes('goease-preview'));
  assert.ok(schemes.includes('com.googleusercontent.apps.' + config.iosId.replace('.apps.googleusercontent.com', '')));
  const bundle = readFileSync(join(app, 'main.jsbundle'));
  assert.ok(bundle.length > 0);
  for (const value of [config.api, config.webId, config.iosId]) {
    assert.ok(bundle.includes(Buffer.from(value)), 'Release bundle is missing the selected live public configuration.');
  }
  function walk(directory) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      assert.ok(!lstatSync(path).isSymbolicLink(), 'Unexpected archive symlink.');
      assert.ok(!/^(?:\.env(?:\..*)?|\.git|_CodeSignature|embedded\.mobileprovision)$/i.test(name)
        && !/\.(?:pem|key|p12|pfx|jks|keystore|dump|sql|map)$/i.test(name), 'Unexpected private/debug material in unsigned app.');
      if (statSync(path).isDirectory()) walk(path);
    }
  }
  walk(app);
  return { source: config.source, bundleId: info.CFBundleIdentifier, minimumOS: info.MinimumOSVersion,
    jsSha256: createHash('sha256').update(bundle).digest('hex'),
    status: 'UNSIGNED_RELEASE_REQUIRES_OWNER_SIGNING_INSTALL_AND_LIVE_TEST' };
}

export function receiptForIpa(path, inspected) {
  const bytes = statSync(path).size;
  assert.ok(bytes > 0 && bytes <= MAX_IPA_BYTES, 'IPA exceeds the reviewed free storage cap.');
  return { ...inspected, ipaBytes: bytes, ipaSha256: createHash('sha256').update(readFileSync(path)).digest('hex') };
}

export function verifyIpaEntries(entries) {
  assert.ok(entries.length > 0 && entries.length < 20000);
  assert.equal(new Set(entries).size, entries.length, 'Duplicate IPA entries.');
  for (const entry of entries) {
    assert.ok(entry === 'Payload/' || entry.startsWith('Payload/GoEasePreview.app/'), 'Unexpected IPA root/application.');
    assert.ok(!entry.includes('\\') && !entry.split('/').includes('..'), 'Unsafe IPA path.');
    assert.ok(!entry.split('/').some(name => /^(?:\.env(?:\..*)?|\.git|_CodeSignature|embedded\.mobileprovision)$/i.test(name))
      && !/\.(?:pem|key|p12|pfx|jks|keystore|dump|sql|map)$/i.test(entry), 'Unexpected IPA private/debug material.');
  }
  for (const name of ['Info.plist', 'GoEasePreview', 'main.jsbundle']) {
    assert.ok(entries.includes('Payload/GoEasePreview.app/' + name), 'Missing required IPA entry.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, app, infoPath, receiptPath, ipa] = process.argv.slice(2);
  if (action === 'preflight') trialConfig(process.env);
  else if (action === 'inspect') {
    const receipt = inspectApp(app, JSON.parse(readFileSync(infoPath, 'utf8')), process.env);
    const packaged = receiptForIpa(ipa, receipt);
    execFileSync('unzip', ['-tqq', ipa], { stdio: 'pipe', timeout: 30000, maxBuffer: 1024 * 1024 });
    verifyIpaEntries(execFileSync('unzip', ['-Z1', ipa], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 }).trimEnd().split('\n'));
    writeFileSync(receiptPath, JSON.stringify(packaged, null, 2) + '\n', { flag: 'wx' });
  } else throw new Error('Expected preflight or inspect.');
}
