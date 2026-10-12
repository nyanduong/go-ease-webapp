import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvironment } from '../src/config.js';

test('cấu hình local dùng origin rõ ràng và port mặc định', () => {
  assert.deepEqual(validateEnvironment({}), {
    NODE_ENV: 'development', PORT: 3000, HOST: '127.0.0.1', WEB_ORIGINS: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  });
});

test('container binding requires the explicit allowlisted HOST; no DNS or injected bind values', () => {
  assert.equal(validateEnvironment({ HOST: '0.0.0.0' }).HOST, '0.0.0.0');
  for (const HOST of ['localhost', '::', '192.168.1.1', '', '0.0.0.0\n', 0, '0.0.0.0;echo test']) {
    assert.throws(() => validateEnvironment({ HOST }), /HOST/);
  }
});

test('từ chối port, mode, wildcard, credentials và path sai', () => {
  for (const input of [{ PORT: 'abc' }, { PORT: '0' }, { PORT: '65536' }, { NODE_ENV: 'preview' },
    { WEB_ORIGINS: '*' }, { WEB_ORIGINS: 'https://site.example/path' },
    { WEB_ORIGINS: 'https://user:password@site.example' }, { DATABASE_URL: 'https://not-postgres.example' },
    { GOOGLE_WEB_CLIENT_ID: '*' }, { GOOGLE_WEB_CLIENT_ID: '' }]) {
    assert.throws(() => validateEnvironment(input));
  }
});

test('production bắt buộc khai báo WEB_ORIGINS', () => {
  assert.throws(() => validateEnvironment({ NODE_ENV: 'production' }), /WEB_ORIGINS/);
  assert.deepEqual(validateEnvironment({ NODE_ENV: 'production', WEB_ORIGINS: 'https://goease.example', PORT: '3020' }).WEB_ORIGINS, ['https://goease.example']);
});
test('native trial configuration is explicit and fail-closed, while omitted mode preserves normal runtime', () => {
  const valid = { NODE_ENV: 'production', WEB_ORIGINS: 'https://trial.test.example', DATABASE_URL: 'postgresql://TEST_ONLY@127.0.0.1/test',
    GOOGLE_WEB_CLIENT_ID: 'test-client.apps.googleusercontent.com', GOEASE_NATIVE_TRIAL_EMAILS: ' APPROVED@test.example ', GOEASE_LOCAL_STATE_DIR: 'TEST_ONLY_PRIVATE' };
  assert.deepEqual(validateEnvironment(valid).GOEASE_NATIVE_TRIAL_EMAILS, ['approved@test.example']);
  for (const bad of [{ GOEASE_NATIVE_TRIAL_EMAILS: '' }, { GOEASE_NATIVE_TRIAL_EMAILS: 'a@test.example,' }, { GOEASE_NATIVE_TRIAL_EMAILS: '*' },
    { GOEASE_LOCAL_STATE_DIR: '' }, { DATABASE_URL: undefined }, { GOOGLE_WEB_CLIENT_ID: undefined }, { HOST: '0.0.0.0' },
    { MAPS_ROUTES_ENABLED: 'true' }, { NODE_ENV: 'development' }]) assert.throws(() => validateEnvironment({ ...valid, ...bad }));
  assert.equal(validateEnvironment({}).GOEASE_NATIVE_TRIAL_EMAILS, undefined);
});
