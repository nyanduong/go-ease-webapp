import { createApi } from './app.js';
let running: Awaited<ReturnType<typeof createApi>>['app'] | undefined;
try {
  const expiresAt = Date.now() + 1800000;
  const { app } = await createApi({ ...process.env, API_HOST: '127.0.0.1', API_PORT: '3102', API_CORS_ORIGINS: '', GEMINI_ENABLED: 'false', GEMINI_API_KEY: '', AI_ACCESS_TOKEN: '' }, undefined, {}, undefined, {}, undefined, { expiresAt });
  running = app; await app.listen(3102, '127.0.0.1');
  console.info(`Private-trip QA on 127.0.0.1:3102; auth/me + owned trips only; expires ${new Date(expiresAt).toISOString()}. DB remains private.`);
  const expiry = setTimeout(() => { void app.close(); }, Math.max(1, expiresAt - Date.now())); app.getHttpServer().once('close', () => clearTimeout(expiry));
} catch { await running?.close(); console.error('Private-trip QA failed to start; check dedicated DB/Auth/config/port, no secrets logged.'); process.exitCode = 1; }
