import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectMvpConfig } from '../.github/scripts/mvp-readiness.mjs';

test('missing setup is reported without pretending any acceptance ran', () => {
  const result = inspectMvpConfig();
  assert.equal(result.acceptance, 'NOT_RUN');
  assert.equal(result.checks.filter(item => item.state === 'missing-or-invalid').length, 4);
  assert.ok(result.pendingEvidence.includes('iPhone native acceptance'));
});
test('readiness output never prints credential, URL, database or arbitrary env values', () => {
  const secret = 'private-fixture-value';
  const result = inspectMvpConfig({ api: { GEMINI_API_KEY: secret, AI_ACCESS_TOKEN: secret, DATABASE_URL: secret, GEMINI_ENABLED: 'true' }, mobile: { EXPO_PUBLIC_API_BASE_URL: 'https://private-fixture.example', EXPO_PUBLIC_GEMINI_API_KEY: secret, OTHER: secret } });
  const output = JSON.stringify(result);
  assert.doesNotMatch(output, /private-fixture/);
  assert.deepEqual(result.checks.find(item => item.id === 'public-env-boundary').invalid, ['EXPO_PUBLIC_GEMINI_API_KEY']);
  assert.equal(result.acceptance, 'NOT_RUN');
});
test('HTTP, URL credentials, paths, query and copied placeholders do not count as configuration', () => {
  for (const value of ['http://localhost:3100', 'https://user:password@example.com', 'https://example.com/path', 'https://example.com?key=private', 'your-api-url']) {
    assert.equal(inspectMvpConfig({ mobile: { EXPO_PUBLIC_API_BASE_URL: value } }).checks[0].state, 'missing-or-invalid');
  }
  assert.equal(inspectMvpConfig({ mobile: { EXPO_PUBLIC_API_BASE_URL: 'https://api.example.com' } }).checks[0].state, 'configured-not-verified');
});
