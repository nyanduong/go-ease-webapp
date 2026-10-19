import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const root = fileURLToPath(new URL('../../', import.meta.url));
const present = value => typeof value === 'string' && !!value.trim() && !/^(your[-_ ]|replace[-_ ]|example|change[-_ ]|<)/i.test(value.trim());
function httpsOrigin(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && !url.username && !url.password; }
  catch { return false; }
}
export function inspectMvpConfig({ api = {}, mobile = {} } = {}) {
  function check(id, env, required, invalid = []) {
    const missing = required.filter(name => !present(env[name]));
    return { id, state: missing.length || invalid.length ? 'missing-or-invalid' : 'configured-not-verified', missing, invalid };
  }
  const publicSecrets = Object.keys(mobile).filter(name => name.startsWith('EXPO_PUBLIC_') && /GEMINI.*KEY|ACCESS_TOKEN|SESSION_CODE|SECRET|SERVICE_ROLE/.test(name) && present(mobile[name]));
  return {
    scope: 'Local configuration only; no network, AI calls, quota changes or credentials in output.',
    checks: [
      check('73-74-mobile-https', mobile, ['EXPO_PUBLIC_API_BASE_URL'], present(mobile.EXPO_PUBLIC_API_BASE_URL) && !httpsOrigin(mobile.EXPO_PUBLIC_API_BASE_URL) ? ['EXPO_PUBLIC_API_BASE_URL'] : []),
      check('73-74-gemini-backend', api, ['GEMINI_API_KEY', 'AI_ACCESS_TOKEN'], api.GEMINI_ENABLED !== 'true' ? ['GEMINI_ENABLED'] : []),
      check('77-mobile-account', mobile, ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_AUTH_API_BASE_URL'], ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_AUTH_API_BASE_URL'].filter(name => present(mobile[name]) && !httpsOrigin(mobile[name]))),
      check('77-backend-account', api, ['SUPABASE_AUTH_URL', 'SUPABASE_PUBLISHABLE_KEY'], ['AUTH_ENABLED', 'TRIPS_ENABLED'].filter(name => api[name] !== 'true')),
      { id: 'public-env-boundary', state: publicSecrets.length ? 'unsafe-public-config' : 'no-known-secret-names', invalid: publicSecrets },
    ],
    pendingEvidence: ['PostgreSQL availability and migrations', 'Authorized HTTPS runtime and access control', 'Gemini Free tier availability and remaining persistent quota', 'Android native acceptance', 'iPhone native acceptance', 'Product owner acceptance scope', 'CI on final pushed HEAD'],
    acceptance: 'NOT_RUN',
  };
}

function readLocal(name) {
  try { return { state: 'read', env: parseEnv(readFileSync(resolve(root, name), 'utf8')) }; }
  catch (error) { return { state: error?.code === 'ENOENT' ? 'missing' : 'unreadable', env: {} }; }
}
export function localReadiness() {
  const api = readLocal('apps/api/.env'), mobile = readLocal('apps/mobile/.env');
  return { files: { api: api.state, mobile: mobile.state }, ...inspectMvpConfig({ api: api.env, mobile: mobile.env }) };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.stdout.write(JSON.stringify(localReadiness(), null, 2) + '\n');
}
