/* global process, console */
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { stagingHost } from './validate.mjs';

export function immutableImage(value) {
  if (typeof value !== 'string' || !/^(?:[a-z0-9][a-z0-9./:_-]*@)?sha256:[a-f0-9]{64}$/.test(value)) throw new Error('Immutable image digest required');
  return value;
}
export async function privateFile(file, buildContext) {
  if (!file || !path.isAbsolute(file)) throw new Error('Absolute private file path required');
  const resolved = await realpath(file), context = await realpath(buildContext);
  if (resolved === context || resolved.startsWith(context + path.sep) || !(await stat(resolved)).isFile()) throw new Error('Secret must be a regular file outside build context');
  return resolved;
}
export async function stagingPreflight(env, context = process.cwd()) {
  const host = stagingHost(env.STAGING_HOST);
  for (const name of ['GOEASE_API_IMAGE', 'GOEASE_ADMIN_IMAGE', 'GOEASE_OPERATOR_IMAGE', 'GOEASE_PG_TOOLS_IMAGE']) immutableImage(env[name]);
  const files = {};
  for (const name of ['GOEASE_API_ENV_FILE', 'GOEASE_OPERATOR_ENV_FILE', 'GOEASE_PG_SERVICE_FILE', 'GOEASE_PG_PASS_FILE']) files[name] = await privateFile(env[name], context);
  if (new Set(Object.values(files)).size !== 4) throw new Error('Separate runtime, operator and PostgreSQL secret files required');
  const text = await readFile(files.GOEASE_API_ENV_FILE, 'utf8');
  if (text.length > 16_384) throw new Error('Runtime secret file too large');
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=([^\r\n]*)$/.exec(line);
    if (!match || values.has(match[1])) throw new Error('Runtime env must use unique plain NAME=value lines');
    values.set(match[1], match[2]);
  }
  const allowed = ['DATABASE_URL', 'WEB_ORIGINS', 'GOOGLE_WEB_CLIENT_ID', 'GOOGLE_MAPS_SERVER_API_KEY', 'MAPS_ROUTES_ENABLED', 'GEMINI_API_KEY', 'GEMINI_MODEL'];
  const parsed = parseEnv(text);
  if ([...values].some(([name, value]) => parsed[name] !== value)) throw new Error('Runtime env must use canonical unquoted values without inline comments');
  if (values.has('MAPS_ROUTES_ENABLED') && !['true', 'false'].includes(values.get('MAPS_ROUTES_ENABLED'))) throw new Error('Routes flag must be canonical true or false');
  if ([...values.keys()].some(key => !allowed.includes(key)) || values.get('WEB_ORIGINS') !== `https://${host}`
    || !/^postgres(?:ql)?:\/\//.test(values.get('DATABASE_URL') ?? '')) throw new Error('Runtime needs private DB and exact HTTPS origin, without migration/Node override variables');
  if (values.get('MAPS_ROUTES_ENABLED') === 'true' && env.GOEASE_ALLOW_PAID_PROVIDER !== 'owner-attested') throw new Error('Provider billing/quota/budget authorization must be separately attested');
  return { host, secretFiles: 4 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await stagingPreflight(process.env); console.info('Staging configuration preflight PASS; no deployment or external request performed.'); }
  catch { console.error('Staging preflight failed; verify private paths, immutable images and owner-approved configuration.'); process.exitCode = 1; }
}
