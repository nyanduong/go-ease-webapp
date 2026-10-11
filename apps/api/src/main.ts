import { ConfigService } from '@nestjs/config';
import { createApp } from './app.js';
import type { Environment } from './config.js';

const app = await createApp({ closeWatchConnections: process.argv.includes('--dev-watch') });
const config = app.get(ConfigService<Environment, true>);
// Local stays loopback; private container networking requires explicit HOST.
await app.listen(config.get('PORT', { infer: true }), config.get('HOST', { infer: true }));
