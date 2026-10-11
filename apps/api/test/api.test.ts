import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { isHealthResponse } from '@goease/contracts';
import { ConfigService } from '@nestjs/config';
import { createApp } from '../src/app.js';
import type { Environment } from '../src/config.js';

let app: Awaited<ReturnType<typeof createApp>>;
let baseUrl: string;
before(async () => {
  const previousEnv = { NODE_ENV: process.env.NODE_ENV, PORT: process.env.PORT, WEB_ORIGINS: process.env.WEB_ORIGINS };
  app = await createApp({ logging: false, environment: {
    NODE_ENV: 'test', PORT: '3000', WEB_ORIGINS: 'http://localhost:5173',
  } });
  assert.deepEqual({ NODE_ENV: process.env.NODE_ENV, PORT: process.env.PORT, WEB_ORIGINS: process.env.WEB_ORIGINS }, previousEnv);
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});
after(async () => { await app?.close(); });

test('app dùng cấu hình test rõ ràng, bỏ qua file và runtime env', () => {
  const config = app.get(ConfigService<Environment, true>);
  assert.equal(config.get('NODE_ENV', { infer: true }), 'test');
  assert.equal(config.get('PORT', { infer: true }), 3000);
  assert.deepEqual(config.get('WEB_ORIGINS', { infer: true }), ['http://localhost:5173']);
});

test('GET /api/health trả contract API-only và thời điểm hiện tại', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const body: unknown = await response.json();
  assert.ok(isHealthResponse(body));
  assert.ok(Math.abs(Date.now() - Date.parse(body.timestamp)) < 5000);
});

test('route lạ trả lỗi thống nhất, không lộ stack hoặc query', async () => {
  const response = await fetch(`${baseUrl}/api/missing?private=test`);
  assert.equal(response.status, 404);
  const body = await response.json() as { error: unknown; path: string; timestamp: string };
  assert.deepEqual({ ...body, timestamp: '<timestamp>' }, {
    error: { code: 'NOT_FOUND', message: 'Không tìm thấy đường dẫn API.', statusCode: 404 },
    path: '/api/missing', timestamp: '<timestamp>',
  });
  assert.ok(Number.isFinite(Date.parse(body.timestamp)));
});

test('CORS chưa bật credentials khi auth chưa cấu hình; auth fail closed', async () => {
  const allowed = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), null);
  const denied = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  const auth = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(auth.status, 503);
  assert.equal((await auth.json() as { error: { code: string } }).error.code, 'AUTH_NOT_CONFIGURED');
});
