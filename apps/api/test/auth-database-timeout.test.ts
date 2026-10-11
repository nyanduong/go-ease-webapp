import assert from 'node:assert/strict';
import net from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { opaque } from '../src/modules/auth/crypto.js';

test('runtime DB handshake stall is bounded; HTTP fails closed without exposing connection or credential', { timeout: 20_000 }, async t => {
  const sockets = new Set<net.Socket>();
  const stalled = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.resume();
    // TEST ONLY: accepts TCP, deliberately never answers the PostgreSQL handshake.
  });
  await new Promise<void>(resolve => stalled.listen(0, '127.0.0.1', resolve));
  const address = stalled.address(); assert.ok(address && typeof address !== 'string');
  const password = opaque();
  const running: { app?: Awaited<ReturnType<typeof createApp>> } = {};
  t.after(async () => {
    try { await running.app?.close(); } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => stalled.close(error => error ? reject(error) : resolve()));
    }
  });
  const app = await createApp({ logging: false, environment: { NODE_ENV: 'test', WEB_ORIGINS: 'https://admin.test.example',
    GOOGLE_WEB_CLIENT_ID: 'test-client.apps.googleusercontent.com', DATABASE_URL: `postgresql://TEST_ONLY:${password}@127.0.0.1:${address.port}/TEST_ONLY` } });
  running.app = app;
  await app.listen(0, '127.0.0.1');
  const started = performance.now();
  const response = await fetch(`${await app.getUrl()}/api/auth/me`, { headers: { Authorization: `Bearer ${opaque()}` }, signal: AbortSignal.timeout(10_000) });
  const elapsed = performance.now() - started;
  assert.equal(response.status, 500);
  assert.ok(elapsed >= 2000 && elapsed < 8000, `bounded handshake elapsed=${Math.round(elapsed)}ms`);
  const body = await response.text();
  assert.equal(JSON.parse(body).error.code, 'INTERNAL_ERROR');
  assert.ok(!body.includes(password)); assert.ok(!body.includes('postgresql://')); assert.ok(!body.includes('Prisma'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${await app.getUrl()}/api/health`)).status, 200);
});
