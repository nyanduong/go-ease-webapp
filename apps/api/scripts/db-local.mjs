import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { join } from 'node:path';
import { apiRoot, devRoot, localCluster, pgControl, seedCatalog, migrateDatabase } from './db-tools.mjs';
import { Pool } from 'pg';
try {
  const operation=process.argv[2];
  if (!['start','stop','seed','backup'].includes(operation)) throw Error();
  const meta=operation==='start'?await localCluster('dev'):JSON.parse(await readFile(join(devRoot,'metadata.json'),'utf8'));
  if(meta.database!=='goease_dev_local')throw Error();
  if (operation==='stop') { pgControl(meta,'stop'); console.info('Dedicated GoEase dev Postgres stopped; data retained.'); }
  else {
    let alive=false;const pool=new Pool({connectionString:meta.runtimeUrl,connectionTimeoutMillis:1000,max:1});
    try {await pool.query('SELECT 1');alive=true;}catch{}finally{await pool.end();}
    if(!alive)pgControl(meta,'start');
    if(operation==='start') { migrateDatabase(meta.adminUrl); await seedCatalog(meta.adminUrl); }
    if(operation==='seed'){await seedCatalog(meta.adminUrl);console.info('Catalog seed applied from the committed sourced catalog; no private trips seeded.');}
    else if(operation==='backup'){
      const u=new URL(meta.adminUrl), directory=join(meta.root,'backups');await mkdir(directory,{recursive:true,mode:0o700});const path=join(directory,'goease-'+new Date().toISOString().replaceAll(':','-')+'.dump');
      execFileSync(join(meta.pgBin,process.platform==='win32'?'pg_dump.exe':'pg_dump'),['-h',u.hostname,'-p',u.port,'-U',u.username,'-d',u.pathname.slice(1),'-Fc','-f',path],{env:{...process.env,PGPASSWORD:decodeURIComponent(u.password)},stdio:'ignore'});console.info('Private local backup created outside the repository. See the dedicated dev cluster backups directory; no upload or billing.');
    } else {
    const path=join(apiRoot,'.env');let content='';try{content=await readFile(path,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
    const existing=parseEnv(content);const deadline=String(Math.max(20000,Number(existing.API_REQUEST_TIMEOUT_MS??20000)));
    for(const [key,value] of Object.entries({DATABASE_URL:meta.runtimeUrl,TRIPS_ENABLED:'true',AUTH_ENABLED:'true',API_REQUEST_TIMEOUT_MS:deadline})) {const re=new RegExp('^'+key+'=.*$','m');content=re.test(content)?content.replace(re,key+'='+value):content.trimEnd()+'\n'+key+'='+value+'\n';}
    await writeFile(path,content,{mode:0o600});console.info('Dedicated GoEase dev Postgres ready on loopback:55475; backend runtime .env configured; existing Gemini/Supabase values preserved. Private DB/admin metadata stays outside the repository.');
    }
  }
} catch { console.error('Local DB operation failed; no reset/fallback or credential output. Check dedicated cluster, PostgreSQL tools and port.');process.exitCode=1; }
