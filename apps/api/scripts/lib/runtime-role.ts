import pg from 'pg';

const tables = ['User', 'Trip', 'TripDay', 'Activity', 'Place', 'Session', 'IdempotencyRecord', 'AuthChallenge'] as const;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
export function operatorConnection(url: string) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Private PostgreSQL configuration required'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('Private PostgreSQL configuration required');
  // Do not allow URL options to turn off process-local bounds.
  parsed.searchParams.set('statement_timeout', '5000'); parsed.searchParams.set('query_timeout', '5000');
  const options = `${parsed.searchParams.get('options') ?? ''} -c statement_timeout=5000 -c lock_timeout=3000 -c timezone=UTC`;
  parsed.searchParams.set('options', options);
  return new pg.Client({ connectionString: parsed.toString(), options, connectionTimeoutMillis: 3000, query_timeout: 5000, statement_timeout: 5000 });
}
function validRole(role: string) {
  if (role.length > 63 || !/^goease_[a-z0-9_]+_app$/.test(role)) throw new Error('Invalid runtime role');
}
async function safeRole(client: pg.Client, role: string, operator: boolean) {
  validRole(role);
  const { rows } = await client.query(`SELECT r.oid, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls,
    current_user = r.rolname AS same_role,
    EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid) AS memberships,
    EXISTS (SELECT 1 FROM pg_class c WHERE c.relowner = r.oid) OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspowner = r.oid)
      OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.proowner = r.oid) OR EXISTS (SELECT 1 FROM pg_type t WHERE t.typowner = r.oid)
      OR EXISTS (SELECT 1 FROM pg_database d WHERE d.datdba = r.oid) AS owns_objects,
    has_database_privilege(r.oid, current_database(), 'CREATE') OR has_database_privilege(r.oid, current_database(), 'TEMP') AS database_ddl,
    has_schema_privilege(r.oid, 'public', 'CREATE') AS schema_ddl
    FROM pg_roles r WHERE r.rolname = $1`, [role]);
  const row = rows[0];
  if (!row || row.rolsuper || row.rolcreatedb || row.rolcreaterole || row.rolreplication || row.rolbypassrls
    || row.memberships || row.owns_objects || row.database_ddl || row.schema_ddl || (operator && row.same_role)) throw new Error('Unsafe runtime role refused');
}
async function effectivePrivileges(client: pg.Client, role: string) {
  // PUBLIC and inherited grants cannot be removed by revoking this role alone.
  const forbidden = await client.query(`SELECT
    has_column_privilege($1, '"User"', 'role', 'INSERT') OR has_column_privilege($1, '"User"', 'role', 'UPDATE')
    OR has_column_privilege($1, '"User"', 'disabledAt', 'INSERT') OR has_column_privilege($1, '"User"', 'disabledAt', 'UPDATE')
    OR has_column_privilege($1, '"Session"', 'revokedAt', 'INSERT')
    OR has_column_privilege($1, '"Session"', 'tokenHash', 'UPDATE')
    OR has_column_privilege($1, '"Session"', 'userId', 'UPDATE')
    OR has_table_privilege($1, '"User"', 'DELETE') OR has_table_privilege($1, '"Session"', 'DELETE')
    OR has_table_privilege($1, '"Trip"', 'DELETE') OR has_table_privilege($1, '"Place"', 'DELETE')
    OR has_table_privilege($1, '"IdempotencyRecord"', 'DELETE')
    OR has_table_privilege($1, '"_prisma_migrations"', 'SELECT,INSERT,UPDATE,DELETE') AS forbidden`, [role]);
  if (forbidden.rows[0]?.forbidden) throw new Error('Excess effective runtime privileges refused');
  for (const table of tables) {
    const result = await client.query('SELECT has_table_privilege($1, $2, $3) AS allowed', [role, quote(table), 'SELECT']);
    if (!result.rows[0]?.allowed) throw new Error('Required runtime read grant missing');
    const forbiddenTable = await client.query('SELECT has_table_privilege($1, $2, $3) AS forbidden', [role, quote(table), 'TRUNCATE,REFERENCES,TRIGGER']);
    if (forbiddenTable.rows[0]?.forbidden) throw new Error('Excess effective runtime privileges refused');
    const columns = await client.query('SELECT attname FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped', [quote(table)]);
    const limited = table === 'User' ? { INSERT: ['id', 'googleSubject', 'displayName', 'createdAt', 'updatedAt'], UPDATE: ['displayName', 'updatedAt'] }
      : table === 'Session' ? { INSERT: ['id', 'userId', 'tokenHash', 'transport', 'csrfTokenHash', 'createdAt', 'expiresAt'], UPDATE: ['revokedAt'] }
        : table === 'AuthChallenge' ? { INSERT: ['id', 'transport', 'nonceHash', 'proofHash', 'createdAt', 'expiresAt'], UPDATE: ['consumedAt'] } : undefined;
    if (limited) for (const privilege of ['INSERT', 'UPDATE'] as const) for (const { attname } of columns.rows) {
      const check = await client.query('SELECT has_column_privilege($1, $2, $3, $4) AS forbidden', [role, quote(table), attname, privilege]);
      if (Boolean(check.rows[0]?.forbidden) !== limited[privilege].includes(String(attname))) throw new Error('Effective runtime column privileges do not match required matrix');
    }
    if (!limited) for (const privilege of ['INSERT', 'UPDATE']) {
      const check = await client.query('SELECT has_table_privilege($1, $2, $3) AS allowed', [role, quote(table), privilege]);
      if (!check.rows[0]?.allowed) throw new Error('Required runtime write grant missing');
    }
    if (['TripDay', 'Activity', 'AuthChallenge'].includes(table)) {
      const check = await client.query('SELECT has_table_privilege($1, $2, $3) AS allowed', [role, quote(table), 'DELETE']);
      if (!check.rows[0]?.allowed) throw new Error('Required runtime delete grant missing');
    }
  }
}
export async function grantRuntime(migrationUrl: string, role: string) {
  validRole(role);
  const client = operatorConnection(migrationUrl);
  try {
    await client.connect(); await client.query('BEGIN');
    await safeRole(client, role, true);
    for (const table of tables) {
      await client.query(`REVOKE ALL PRIVILEGES ON ${quote(table)} FROM ${role}`);
      const columns = await client.query('SELECT attname FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped', [quote(table)]);
      await client.query(`REVOKE ALL PRIVILEGES (${columns.rows.map(row => quote(String(row.attname))).join(',')}) ON ${quote(table)} FROM ${role}`);
    }
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await client.query(`GRANT SELECT ON ${tables.map(quote).join(',')} TO ${role}`);
    await client.query(`GRANT INSERT (id, transport, "nonceHash", "proofHash", "createdAt", "expiresAt"), UPDATE ("consumedAt"), DELETE ON "AuthChallenge" TO ${role}`);
    await client.query(`GRANT INSERT (id, "googleSubject", "displayName", "createdAt", "updatedAt"), UPDATE ("displayName", "updatedAt") ON "User" TO ${role}`);
    // Place UPDATE is needed for SELECT FOR SHARE when Trips validates a place.
    await client.query(`GRANT INSERT, UPDATE ON "Trip", "Place", "IdempotencyRecord" TO ${role}`);
    await client.query(`GRANT INSERT, UPDATE, DELETE ON "TripDay", "Activity" TO ${role}`);
    await client.query(`GRANT INSERT (id, "userId", "tokenHash", transport, "csrfTokenHash", "createdAt", "expiresAt"), UPDATE ("revokedAt") ON "Session" TO ${role}`);
    await effectivePrivileges(client, role); await client.query('COMMIT');
  } catch { await client.query('ROLLBACK').catch(() => {}); throw new Error('Runtime grant failed; inspect private PostgreSQL configuration'); }
  finally { await client.end().catch(() => {}); }
}
export async function verifyRuntime(runtimeUrl: string, role: string) {
  const client = operatorConnection(runtimeUrl);
  try {
    await client.connect();
    const result = await client.query('SELECT current_user AS role');
    if (result.rows[0]?.role !== role) throw new Error('Runtime role mismatch');
    await safeRole(client, role, false); await effectivePrivileges(client, role);
    await client.query('SELECT id FROM "Place" LIMIT 1');
  } catch { throw new Error('Runtime verification failed; no credential values are logged'); }
  finally { await client.end().catch(() => {}); }
}
