import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, homedir } from 'node:os';
import { Pool } from 'pg';
import { getDalatCatalog } from '@goease/catalog';
export const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const devRoot = join(process.env.LOCALAPPDATA ?? join(homedir(),'.local','share'),'GoEase','postgres-dev');
export function isolatedUrl(value, kind) {
  const u = new URL(value);
  if (u.protocol !== 'postgresql:' || !['127.0.0.1','localhost','[::1]'].includes(u.hostname) || !new RegExp(`^/goease_${kind}_[a-z0-9_]+$`).test(u.pathname) || !u.password || u.search || u.hash) throw Error('Dedicated loopback database required');
  return u;
}
export async function seedCatalog(url) {
  const pool = new Pool({ connectionString: url, max: 1 }); const client = await pool.connect();
  try { await client.query('BEGIN'); for (const place of getDalatCatalog()) await client.query('INSERT INTO "Place" (id,name,snapshot) VALUES ($1,$2,$3::jsonb) ON CONFLICT(id) DO NOTHING', [place.id,place.name,JSON.stringify(place)]); await client.query('INSERT INTO "PlaceRevision" ("placeId",version,snapshot,enabled) SELECT id,version,snapshot,enabled FROM "Place" ON CONFLICT DO NOTHING'); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); await pool.end(); }
}
export async function prepareDatabase(adminUrl) {
  const parsed = new URL(adminUrl); isolatedUrl(adminUrl, parsed.pathname.startsWith('/goease_test_') ? 'test' : 'dev');
  execFileSync(process.execPath, [join(apiRoot,'node_modules/prisma/build/index.js'),'migrate','deploy'], { cwd: apiRoot, env: { ...process.env, MIGRATION_DATABASE_URL: adminUrl }, stdio: 'pipe' });
  await seedCatalog(adminUrl);
  const password = randomBytes(32).toString('base64url'), pool = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    // This helper is only for newly created dedicated local/test databases.
    // Existing runtime passwords are never changed; persisted dev metadata is reused.
    await pool.query(`CREATE ROLE goease_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
    await pool.query('GRANT goease_app TO goease_runtime');
    await pool.query(`REVOKE ALL ON DATABASE "${parsed.pathname.slice(1)}" FROM PUBLIC`);
    await pool.query(`GRANT CONNECT ON DATABASE "${parsed.pathname.slice(1)}" TO goease_app`);
  } finally { await pool.end(); }
  parsed.username='goease_runtime'; parsed.password=password;
  return parsed.toString();
}
export function migrateDatabase(adminUrl) {
  const u=new URL(adminUrl);isolatedUrl(adminUrl,u.pathname.startsWith('/goease_test_')?'test':'dev');
  execFileSync(process.execPath,[join(apiRoot,'node_modules/prisma/build/index.js'),'migrate','deploy'],{cwd:apiRoot,env:{...process.env,MIGRATION_DATABASE_URL:adminUrl},stdio:'pipe'});
}
export function pgControl(meta, operation) {
  if (!/^goease_(dev|test)_[a-z0-9_]+$/.test(meta.database)) throw Error('Dedicated DB required');
  const args = ['-D',meta.dataDir,'-l',join(meta.root,'postgres.log'),'-w','-t','20'];
  if (operation === 'start') args.push('-o',`-h 127.0.0.1 -p ${meta.port}`,'start');
  else if (operation === 'stop') args.push('-m','fast','stop'); else throw Error('Invalid PG control operation');
  // Windows postgres can inherit pipe handles after pg_ctl exits; no captured pipes.
  execFileSync(join(meta.pgBin,process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'),args,{stdio:'ignore'});
}
export async function localCluster(kind) {
  const pgBin=process.env.GOEASE_PG_BIN ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/lib/postgresql/18/bin');
  const database=kind === 'dev' ? 'goease_dev_local' : 'goease_test_'+randomUUID().replaceAll('-','');
  const root=kind === 'dev' ? devRoot : join(tmpdir(),'goease-pg-test-'+randomUUID());
  await mkdir(root,{recursive:true,mode:0o700});
  if (kind === 'dev') { try { const existing=JSON.parse(await readFile(join(root,'metadata.json'),'utf8')); if(existing.database!==database || existing.root!==root) throw Error(); return existing; } catch (error) { if(error.code!=='ENOENT') throw Error('Existing dev metadata invalid; no reset'); } }
  const adminPassword=randomBytes(32).toString('base64url'), pwFile=join(root,'init-password'), dataDir=join(root,'data'), port=kind==='dev'?55475:55476;
  await writeFile(pwFile,adminPassword,{flag:'wx',mode:0o600});
  execFileSync(join(pgBin,process.platform==='win32'?'initdb.exe':'initdb'),['-D',dataDir,'-U','goease_admin','--auth=scram-sha-256','--pwfile='+pwFile,'-E','UTF8','--locale=C'],{stdio:'pipe'});
  const adminUrl=`postgresql://goease_admin:${adminPassword}@127.0.0.1:${port}/${database}`;
  const meta={database,root,dataDir,port,pgBin,adminUrl}; pgControl(meta,'start');
  try {
    const bootstrap=new URL(adminUrl);bootstrap.pathname='/postgres';const pool=new Pool({connectionString:bootstrap.toString(),max:1});
    try { await pool.query(`CREATE DATABASE "${database}"`); } finally { await pool.end(); }
    meta.runtimeUrl=await prepareDatabase(adminUrl);
    await writeFile(join(root,'metadata.json'),JSON.stringify(meta),{flag:'wx',mode:0o600});
    return meta;
  } catch (error) { pgControl(meta,'stop'); throw error; }
}
