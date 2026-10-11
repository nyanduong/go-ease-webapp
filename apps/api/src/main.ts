import { ConfigService } from '@nestjs/config';
import { createApp } from './app.js';
import type { Environment } from './config.js';

const app = await createApp({ closeWatchConnections: process.argv.includes('--dev-watch') });
const config = app.get(ConfigService<Environment, true>);
// Nền local/CI chỉ lắng nghe loopback; staging sẽ cấu hình riêng ở GE-M0-10.
await app.listen(config.get('PORT', { infer: true }), '127.0.0.1');
