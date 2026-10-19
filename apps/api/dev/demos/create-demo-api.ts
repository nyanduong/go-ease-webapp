import { createApi } from '../../src/bootstrap.js';
import { readConfig } from '../../src/config/env.js';
import type { CatalogLoader } from '../../src/modules/catalog/catalog.service.js';
import type { AiOptions } from '../../src/modules/ai/ai.service.js';
import type { AuthOptions } from '../../src/modules/auth/auth-verifier.service.js';
import { demoGuard, type DemoSession } from './ai/session.js';
import { authDemoGuard, type AuthDemoSession } from './auth/session.js';
import { tripsDemoGuard, type TripsDemoSession } from './trips/session.js';
export async function createDemoApi(
  env: Record<string, string | undefined> = process.env,
  load?: CatalogLoader,
  aiOptions: AiOptions = {},
  demo?: DemoSession,
  authOptions: AuthOptions = {},
  authSession?: AuthDemoSession,
  tripsSession?: TripsDemoSession,
) {
  const config = readConfig(env);
  if ([demo, authSession, tripsSession].filter(Boolean).length > 1)
    throw new Error('Cannot combine QA sessions');
  const guard = tripsSession
    ? tripsDemoGuard(tripsSession, config)
    : authSession
      ? authDemoGuard(authSession, config)
      : demo
        ? demoGuard(demo, config.AI_ACCESS_TOKEN, config.API_HOST)
        : undefined;
  return createApi(env, load, aiOptions, authOptions, guard ? { guard } : {});
}
