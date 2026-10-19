import { createDemoApi as createApi } from '../create-demo-api.js';

let running: Awaited<ReturnType<typeof createApi>>['app'] | undefined;
try {
  const expiresAt = Date.now() + 30 * 60000;
  const { app } = await createApi(
    {
      ...process.env,
      API_HOST: '127.0.0.1',
      API_PORT: '3101',
      API_CORS_ORIGINS: '',
      GEMINI_ENABLED: 'false',
      GEMINI_API_KEY: '',
      AI_ACCESS_TOKEN: '',
      TRIPS_ENABLED: 'false',
      DATABASE_URL: '',
    },
    undefined,
    {},
    undefined,
    {},
    { expiresAt },
  );
  running = app;
  await app.listen(3101, '127.0.0.1');
  console.info(
    `Auth-only QA listening on 127.0.0.1:3101; GET /v1/auth/me only; expires ${new Date(expiresAt).toISOString()}.`,
  );
  const expiry = setTimeout(
    () => {
      void app.close();
    },
    Math.max(1, expiresAt - Date.now()),
  );
  app.getHttpServer().once('close', () => clearTimeout(expiry));
} catch {
  await running?.close();
  console.error('Auth-only QA chưa khởi động; kiểm tra config/port, không log credential.');
  process.exitCode = 1;
}
