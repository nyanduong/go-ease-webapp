import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvironment } from '../src/config.js';

test('cấu hình local dùng origin rõ ràng và port mặc định', () => {
  assert.deepEqual(validateEnvironment({}), {
    NODE_ENV: 'development', PORT: 3000, WEB_ORIGINS: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  });
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
