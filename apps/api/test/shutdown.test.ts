import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../src/app.js';

test('dev watch đóng preconnect thật và nhả port khi shutdown', { timeout: 5000 }, async () => {
  const app = await createApp({ logging: false, environment: { NODE_ENV: 'test' }, closeWatchConnections: true });
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert.ok(address && typeof address !== 'string');
  const socket = createConnection({ host: '127.0.0.1', port: address.port });
  socket.resume();
  try {
    await once(socket, 'connect');
    const disconnected = once(socket, 'close');
    await Promise.race([
      app.close(),
      delay(2000, undefined, { ref: false }).then(() => { throw new Error('Shutdown bị giữ bởi preconnect.'); }),
    ]);
    await disconnected;
    assert.equal(socket.destroyed, true);
    assert.equal(app.getHttpServer().listening, false);
  } finally {
    socket.destroy();
    await app.close();
  }
});
