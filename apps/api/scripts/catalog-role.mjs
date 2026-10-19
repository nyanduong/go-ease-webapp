import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { Pool } from 'pg';
import { apiRoot, devRoot, isolatedUrl } from './db-tools.mjs';
try {
  const [operation, subject] = process.argv.slice(2);
  if (
    !['grant', 'revoke'].includes(operation) ||
    !subject ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subject)
  )
    throw Error();
  const config = parseEnv(await readFile(join(apiRoot, '.env'), 'utf8'));
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(config.SUPABASE_AUTH_URL ?? '')) throw Error();
  const meta = JSON.parse(await readFile(join(devRoot, 'metadata.json'), 'utf8'));
  isolatedUrl(meta.adminUrl, 'dev');
  if (meta.database !== 'goease_dev_local') throw Error();
  const pool = new Pool({ connectionString: meta.adminUrl, max: 1 });
  try {
    await pool.query(
      'INSERT INTO "CatalogAdmin" (issuer,subject,enabled) VALUES ($1,$2::uuid,$3) ON CONFLICT(issuer,subject) DO UPDATE SET enabled=EXCLUDED.enabled',
      [config.SUPABASE_AUTH_URL + '/auth/v1', subject, operation === 'grant'],
    );
  } finally {
    await pool.end();
  }
  console.info(
    'Catalog role updated in dedicated local DB only. No private-trip admin access or billing.',
  );
} catch {
  console.error(
    'Catalog role operation failed; use grant/revoke + verified user UUID and dedicated local DB. No credential output.',
  );
  process.exitCode = 1;
}
