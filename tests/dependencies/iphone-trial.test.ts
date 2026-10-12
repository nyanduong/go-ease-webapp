import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
// Operational archive verification is deliberately outside mobile runtime imports.
// @ts-expect-error Standalone Node packaging utility has no application declaration file.
import { inspectApp, receiptForIpa, trialConfig, verifyIpaEntries, MAX_IPA_BYTES } from '../../apps/mobile/scripts/iphone-trial.mjs';

const env = { GOEASE_APP_VARIANT: 'preview', GOEASE_FREE_STORAGE_VERIFIED: 'true', GOEASE_SOURCE_HEAD: 'a'.repeat(40),
  EXPO_PUBLIC_API_BASE_URL: 'https://fixture.example.org/api', EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: '123-fixtureweb.apps.googleusercontent.com',
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: '123-fixtureios.apps.googleusercontent.com' };
const info = { CFBundleIdentifier: 'vn.goease.mobile.preview', CFBundleExecutable: 'GoEasePreview',
  CFBundleSupportedPlatforms: ['iPhoneOS'], UIDeviceFamily: [1], MinimumOSVersion: '16.4',
  NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
  CFBundleURLTypes: [{ CFBundleURLSchemes: ['goease-preview', 'com.googleusercontent.apps.123-fixtureios'] }] };

test('IPA layout rejects missing Payload, second app, traversal, private files and duplicate entries', () => {
  const entries = ['Payload/', ...['Info.plist', 'GoEasePreview', 'main.jsbundle'].map(name => 'Payload/GoEasePreview.app/' + name)];
  verifyIpaEntries(entries);
  assert.throws(() => verifyIpaEntries(entries.map(entry => entry.replace('Payload/', ''))));
  assert.throws(() => verifyIpaEntries(entries.slice(0, -1)));
  for (const entry of ['Payload/Other.app/Info.plist', 'Payload/GoEasePreview.app/../secret',
    'Payload/GoEasePreview.app/.env.local', 'Payload/GoEasePreview.app/private.p12', entries[1]]) {
    assert.throws(() => verifyIpaEntries([...entries, entry]));
  }
});

test('iPhone trial rejects missing configuration, unsafe URLs and unverified free storage', () => {
  for (const url of ['http://fixture.example.org/api', 'https://127.0.0.1/api', 'https://[::1]/api',
    'https://localhost/api', 'https://fixture.local/api', 'https://user:password@fixture.example.org/api',
    'https://fixture.example.org/api?token=x', 'https://fixture.example.org/api#x', 'https://fixture.example.org/']) {
    assert.throws(() => trialConfig({ ...env, EXPO_PUBLIC_API_BASE_URL: url }));
  }
  assert.throws(() => trialConfig({ ...env, GOEASE_FREE_STORAGE_VERIFIED: 'false' }));
  assert.throws(() => trialConfig({ ...env, GOEASE_APP_VARIANT: 'development' }));
  assert.throws(() => trialConfig({ ...env, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: '' }));
  assert.equal(trialConfig(env).api, env.EXPO_PUBLIC_API_BASE_URL);
});

test('archive inspection catches wrong identity, unbundled config and private material', () => {
  const directory = mkdtempSync(join(tmpdir(), 'goease-iphone-test-'));
  try {
    const app = join(directory, 'GoEasePreview.app'); mkdirSync(app);
    const js = join(app, 'main.jsbundle');
    writeFileSync(js, 'fixture only: ' + Object.values(env).join(' '));
    const receipt = inspectApp(app, info, env);
    assert.equal(receipt.source, env.GOEASE_SOURCE_HEAD);
    assert.equal(inspectApp(app, { ...info, MinimumOSVersion: '18.7.10' }, env).minimumOS, '18.7.10');
    assert.throws(() => inspectApp(app, { ...info, MinimumOSVersion: '18.7.11' }, env));
    assert.throws(() => inspectApp(app, { ...info, MinimumOSVersion: '18.8' }, env));
    assert.throws(() => inspectApp(app, { ...info, CFBundleIdentifier: 'vn.other.app' }, env));
    assert.throws(() => inspectApp(app, { ...info, MinimumOSVersion: '27.0' }, env));
    assert.throws(() => inspectApp(app, { ...info, NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } }, env));
    assert.throws(() => inspectApp(app, { ...info, CFBundleURLTypes: [] }, env));
    writeFileSync(join(app, '.env.local'), 'fixture private material');
    assert.throws(() => inspectApp(app, info, env));
    rmSync(join(app, '.env.local'));
    writeFileSync(js, 'wrong configuration fixture');
    assert.throws(() => inspectApp(app, info, env));
    const ipa = join(directory, 'fixture.ipa'); writeFileSync(ipa, 'fixture only');
    assert.equal(receiptForIpa(ipa, receipt).ipaBytes, 12);
    truncateSync(ipa, MAX_IPA_BYTES + 1);
    assert.throws(() => receiptForIpa(ipa, receipt));
  } finally {
    assert.ok(directory.startsWith(join(tmpdir(), 'goease-iphone-test-')));
    rmSync(directory, { recursive: true, force: true });
  }
});
