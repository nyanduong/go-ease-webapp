import { ConfigService } from '@nestjs/config';
import { createApp } from './app.js';
import type { Environment } from './config.js';
import { verifyTrialDatabase } from './private-state.js';

const app = await createApp({ closeWatchConnections: process.argv.includes('--dev-watch') });
const config = app.get(ConfigService<Environment, true>);
if (config.get('GOEASE_NATIVE_TRIAL_EMAILS', { infer: true })) {
  try {
    if (config.get('NODE_ENV', { infer: true }) !== 'production') throw new Error('Native trial runtime requires production');
    await verifyTrialDatabase(config.get('GOEASE_LOCAL_STATE_DIR', { infer: true })!, config.get('DATABASE_URL', { infer: true })!);
  }
  catch { await app.close(); throw new Error('Native trial private-state preflight failed; no connection details logged.'); }
}
// Local stays loopback; private container networking requires explicit HOST.
await app.listen(config.get('PORT', { infer: true }), config.get('HOST', { infer: true }));
