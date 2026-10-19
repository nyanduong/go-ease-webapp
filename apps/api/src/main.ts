import { createApi } from './bootstrap.js';

try {
  const { app, config } = await createApi();
  await app.listen(config.API_PORT, config.API_HOST);
  console.info(
    `GoEase API v1 listening on ${config.API_HOST}:${config.API_PORT}; health checks process only.`,
  );
} catch {
  console.error(
    'API không khởi động được. Kiểm tra cấu hình API_* và port; không gửi giá trị secret vào log/chat.',
  );
  process.exitCode = 1;
}
