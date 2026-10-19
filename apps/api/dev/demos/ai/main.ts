import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDemoApi as createApi } from '../create-demo-api.js';

let running: Awaited<ReturnType<typeof createApi>>['app'] | undefined;

try {
  const session = {
    token: randomBytes(16).toString('base64url'),
    expiresAt: Date.now() + 30 * 60000,
  };
  const { app } = await createApi(
    { ...process.env, API_HOST: '127.0.0.1', API_PORT: '3100', API_CORS_ORIGINS: '' },
    undefined,
    {},
    session,
  );
  running = app;
  await app.listen(3100, '127.0.0.1');
  const directory = resolve('.demo-runtime');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = resolve(directory, `session-${randomUUID()}.json`);
  await writeFile(
    path,
    JSON.stringify({ token: session.token, expiresAt: new Date(session.expiresAt).toISOString() }),
    { flag: 'wx', mode: 0o600 },
  );
  console.info(
    `Demo API listening on 127.0.0.1:3100; session expires ${new Date(session.expiresAt).toISOString()}. Private code file: ${path}`,
  );
  const expiry = setTimeout(
    () => {
      void app.close();
    },
    Math.max(1, session.expiresAt - Date.now()),
  );
  app.getHttpServer().once('close', () => {
    clearTimeout(expiry);
    void writeFile(
      path,
      JSON.stringify({ expired: true, expiresAt: new Date(session.expiresAt).toISOString() }),
    ).catch(() => {});
  });
} catch {
  if (running) await running.close();
  console.error(
    'Demo API chưa khởi động. Kiểm tra config/port/private file; không gửi secret vào log/chat.',
  );
  process.exitCode = 1;
}
