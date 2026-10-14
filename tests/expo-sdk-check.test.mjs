import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { incompatibilities } = createRequire(import.meta.url)('../.github/scripts/check-expo.cjs');
test('frozen SDK compatibility still rejects wrong React Native, missing module and wrong Expo major', () => {
  assert.deepEqual(incompatibilities({ expo: '~57.0.28', 'react-native': '0.86.3', 'expo-router': '~57.0.26' }, { expo: '58.0.0', 'react-native': '0.87.0' }).map(([name]) => name), ['expo', 'react-native', 'expo-router']);
});
test('frozen SDK compatibility honors shipped semver ranges without remote latest-patch dependency', () => {
  assert.deepEqual(incompatibilities({ expo: '~57.0.28', 'react-native': '0.86.3', 'expo-router': '~57.0.26' }, { expo: '57.0.28', 'react-native': '0.86.3', 'expo-router': '57.0.26' }), []);
});
