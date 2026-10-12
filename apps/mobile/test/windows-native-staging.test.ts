import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import type { ExportedConfig } from 'expo/config-plugins';

const require = createRequire(import.meta.url);
const plugin = require('../plugins/with-windows-native-staging.cjs') as (config: ExportedConfig) => ExportedConfig;
const begin = '// @generated begin goease-windows-native-staging';
const end = '// @generated end goease-windows-native-staging';
const legacyMarker = '// GoEase: short Windows Nitro build directories';

async function generate(contents: string, language: 'groovy' | 'kt' = 'groovy') {
  const config = plugin({ name: 'GoEase test', slug: 'goease-test' });
  const mod = config.mods?.android?.projectBuildGradle;
  assert.ok(mod, 'Register the actual Expo projectBuildGradle mod.');
  const result = await mod({ ...config, modResults: { path: '/test/android/build.gradle', contents, language },
    modRequest: { projectRoot: '/test', platformProjectRoot: '/test/android', modName: 'projectBuildGradle', platform: 'android', introspect: false },
    modRawConfig: config });
  return result.modResults.contents;
}

test('Fresh Android Gradle generation defers Windows selection and targets only Expo/Nitro libraries', async () => {
  const config = plugin({ name: 'GoEase test', slug: 'goease-test', ios: { bundleIdentifier: 'test.untouched' } });
  assert.deepEqual(Object.keys(config.mods ?? {}), ['android']);
  assert.deepEqual(Object.keys(config.mods?.android ?? {}), ['projectBuildGradle']);
  assert.deepEqual(config.ios, { bundleIdentifier: 'test.untouched' });
  const source = "buildscript { ext.example = 'untouched' }\n";
  const result = await generate(source);
  assert.ok(result.startsWith(source));
  assert.match(result, /if \(System\.getProperty\('os\.name'\)\.toLowerCase\(java\.util\.Locale\.ROOT\)\.contains\('windows'\)\) \{/);
  assert.deepEqual([...result.matchAll(/'([^']+)': '([^']+)'/g)].map(match => match.slice(1)), [
    ['expo-modules-core', 'expo'], ['react-native-nitro-modules', 'nitro'], ['react-native-nitro-google-signin', 'google-signin'],
  ]);
  assert.match(result, /plugins\.withId\('com\.android\.library'\)[\s\S]*getByName\('androidComponents'\)\.finalizeDsl/);
  assert.match(result, /rootProject\.file\('\.cxx\/' \+ stageName\)/);
  assert.equal((result.match(/buildStagingDirectory/g) ?? []).length, 1);
  assert.equal(await generate(result), result);
});

test('Legacy prebuild output upgrades uniform/mixed LF/CRLF without changing adjacent Gradle bytes', async () => {
  const fixture = (await readFile(new URL('./fixtures/windows-native-staging-legacy.gradle', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
  const start = fixture.indexOf(legacyMarker);
  const finish = fixture.indexOf('\n\n// Sentinel configuration after');
  for (const newline of ['\n', '\r\n']) {
    for (const blockNewline of ['\n', '\r\n']) {
      const before = fixture.slice(0, start).replaceAll('\n', newline);
      const after = fixture.slice(finish).replaceAll('\n', newline);
      const source = before + fixture.slice(start, finish).replaceAll('\n', blockNewline) + after;
      const result = await generate(source);
      assert.ok(result.startsWith(before + begin));
      assert.ok(result.endsWith(end + after));
      assert.ok(result.includes("'expo-modules-core': 'expo'"));
      assert.equal(result.includes(legacyMarker), false);
      assert.equal(await generate(result), result);
    }
  }
});

test('A later plugin revision replaces its owned block rather than skipping an existing marker', async () => {
  const original = await generate('// unrelated before\n');
  const stale = original.replace("        'expo-modules-core': 'expo',\n", '') + '// unrelated after\n';
  assert.equal(await generate(stale), original + '// unrelated after\n');
  assert.equal(await generate(await generate(stale)), original + '// unrelated after\n');
});

test('Ambiguous or edited legacy markers fail before changing Gradle', async () => {
  const original = await generate('');
  const legacy = (await readFile(new URL('./fixtures/windows-native-staging-legacy.gradle', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
  for (const source of [original + original, original.replace(end, ''), original.replace(begin, ''),
    original + legacy, legacy.replace("'nitro'", "'custom'"), `${end}\n${begin}\n`, `prefix ${original}`,
    original.replace(begin, `${begin} trailing configuration`), original.replace(end, `prefix ${end}`),
    original.replace(end, `${end} trailing configuration`), legacy.replace(legacyMarker, `prefix ${legacyMarker}`),
    legacy.replace('\n}\n\n// Sentinel configuration after', '\n} trailing configuration\n\n// Sentinel configuration after')]) {
    await assert.rejects(generate(source), /GoEase Windows staging:/);
  }
});

test('Kotlin root Gradle is rejected instead of appending Groovy', async () => {
  await assert.rejects(generate('plugins {}', 'kt'), /phải dùng Groovy/);
});
