import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { Pool } from 'pg';
import { createApi } from '../dist/app.js';
import { generateSampleTrip } from '@goease/itinerary';
import { getDalatCatalog } from '@goease/catalog';
import { tripMutationResponseSchema, serverTripResponseSchema, serverTripListResponseSchema } from '@goease/contracts';
import { isolatedUrl, pgControl } from '../scripts/db-tools.mjs';
import { callServerTripApi } from '../../mobile/.logic-tests/server-trip-controller.js';
import { createAccountTrips } from '../../mobile/.logic-tests/account-trip-controller.js';
import { createAuthPilot } from '../../mobile/.logic-tests/auth-pilot-controller.js';
import { ServerTripError } from '../../mobile/.logic-tests/server-trip-controller.js';
if(process.env.GOEASE_DB_TEST_ACK!=='isolated') throw Error('Real isolated database test harness required');
const adminUrl=process.env.GOEASE_DB_TEST_ADMIN_URL, runtimeUrl=process.env.GOEASE_DB_TEST_RUNTIME_URL;
isolatedUrl(adminUrl,'test');isolatedUrl(runtimeUrl,'test');
let admin=new Pool({connectionString:adminUrl,max:1});
after(async()=>{await admin.end();});
const project='https://abcdefghijklmnopqrst.supabase.co',issuer=project+'/auth/v1';
function trip(id='trip-'+randomUUID(),days=1){const r=generateSampleTrip({name:'DB fixture',destinationId:'da-lat',startDate:'2026-10-15',durationDays:days,people:2,budgetVnd:null},getDalatCatalog(),{tripId:id,today:'2026-10-15'});assert.equal(r.ok,true);return r.trip;}
function token(subject){const now=Math.floor(Date.now()/1000),enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');return enc({alg:'HS256'})+'.'+enc({sub:subject,iss:issuer,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600})+'.offline_fixture_signature';}
async function fixture(run){
  const A=randomUUID(),B=randomUUID(),tokens={A:token(A),B:token(B)};
  const env={TRIPS_ENABLED:'true',DATABASE_URL:runtimeUrl,AUTH_ENABLED:'true',AUTH_TIMEOUT_MS:'1000',API_REQUEST_TIMEOUT_MS:'8000',SUPABASE_AUTH_URL:project,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_offline_fixture_00000000'};
  let app,base;
  async function start(){({app}=await createApi(env,undefined,{provider:{generate:async()=>assert.fail('DB tests never call Gemini')}},undefined,{fetcher:async(_url,options)=>{const subject=options.headers.authorization==='Bearer '+tokens.A?A:options.headers.authorization==='Bearer '+tokens.B?B:null;return new Response(JSON.stringify(subject?{id:subject,aud:'authenticated',role:'authenticated'}:{}),{status:subject?200:401});}}));await app.listen(0,'127.0.0.1');base=await app.getUrl();}
  async function stop(){await app?.close();app=undefined;}
  async function request(who,method,path='',body,extra={}){return fetch(base+'/v1/trips'+path,{method,headers:{authorization:'Bearer '+tokens[who],...(body?{'content-type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});}
  await start();try{await run({A,B,request,start,stop,env,tokens,transport:async(target,options)=>fetch(target.replace('https://fixture-api.example.test',base),options)});}finally{await stop();}
}
async function ok(response,status=200){assert.equal(response.status,status);return response.json();}
async function error(response,status,code){assert.equal(response.status,status);const b=await response.json();assert.equal(b.error.code,code);const raw=JSON.stringify(b);for(const secret of [runtimeUrl,adminUrl,'offline_fixture_signature','DO_NOT_LEAK'])assert.equal(raw.includes(secret),false);}
test('real PostgreSQL CRUD preserves normalized ordering/null/zero/legacy source and scopes every endpoint by verified user',()=>fixture(async({A,B,request})=>{
 const t=trip('same-client-id',5);delete t.generationSource;t.days[0].activities[0].costVnd=0;t.days[0].activities[1].costVnd=null;
 const body={mutationId:randomUUID(),trip:t};const created=tripMutationResponseSchema.parse(await ok(await request('A','POST','',body),201));assert.equal(created.result.version,1);
 const read=serverTripResponseSchema.parse(await ok(await request('A','GET','/'+t.id)));assert.deepEqual(read.trip,t);assert.equal('generationSource'in read.trip,false);
 assert.equal(serverTripListResponseSchema.parse(await ok(await request('B','GET'))).items.length,0);
 await error(await request('B','GET','/'+t.id),404,'NOT_FOUND');await error(await request('B','PUT','/'+t.id,{mutationId:randomUUID(),expectedVersion:1,trip:t}),404,'NOT_FOUND');await error(await request('B','DELETE','/'+t.id,{mutationId:randomUUID(),expectedVersion:1}),404,'NOT_FOUND');
 await ok(await request('B','POST','',{mutationId:randomUUID(),trip:{...t,name:'Other owner'}}),201);assert.equal((await ok(await request('B','GET','/'+t.id))).trip.name,'Other owner');
 const update={mutationId:randomUUID(),expectedVersion:1,trip:{...t,name:'Updated',generationSource:'ai'}};const updated=await ok(await request('A','PUT','/'+t.id,update));assert.equal(updated.result.version,2);assert.equal(updated.result.trip.generationSource,'ai');
 const deletion={mutationId:randomUUID(),expectedVersion:2};const deleted=await ok(await request('A','DELETE','/'+t.id,deletion));assert.equal(deleted.result.kind,'deleted');assert.equal(deleted.result.version,3);
 await error(await request('A','GET','/'+t.id),404,'NOT_FOUND');assert.equal((await ok(await request('A','GET'))).items.length,0);assert.equal((await ok(await request('B','GET','/'+t.id))).trip.name,'Other owner');
 const rows=await admin.query('SELECT "ownerSubject",version,"deletedAt" FROM "Trip" WHERE id=$1 AND "ownerSubject" IN ($2::uuid,$3::uuid)',[t.id,A,B]);assert.equal(rows.rowCount,2);
}));
test('lost-response retries replay create/update/delete without duplicate rows or extra version; changed payload/key conflicts',()=>fixture(async({request,A})=>{
 const t=trip();const create={mutationId:randomUUID(),trip:t};const first=await ok(await request('A','POST','',create),201);const replay=await ok(await request('A','POST','',create),201);assert.equal(replay.replayed,true);assert.deepEqual(replay.result,first.result);
 await error(await request('A','POST','',{...create,trip:{...t,name:'different'}}),409,'IDEMPOTENCY_CONFLICT');await error(await request('A','POST','',{mutationId:randomUUID(),trip:t}),409,'TRIP_CONFLICT');
 const update={mutationId:randomUUID(),expectedVersion:1,trip:{...t,name:'new'}};await ok(await request('A','PUT','/'+t.id,update));const again=await ok(await request('A','PUT','/'+t.id,update));assert.equal(again.replayed,true);assert.equal(again.result.version,2);
 await error(await request('A','PUT','/'+t.id,{...update,mutationId:randomUUID()}),409,'TRIP_CONFLICT');await error(await request('A','DELETE','/'+t.id,{mutationId:create.mutationId,expectedVersion:2}),409,'IDEMPOTENCY_CONFLICT');
 const del={mutationId:randomUUID(),expectedVersion:2};await ok(await request('A','DELETE','/'+t.id,del));assert.equal((await ok(await request('A','DELETE','/'+t.id,del))).replayed,true);await error(await request('A','POST','',{mutationId:randomUUID(),trip:t}),409,'TRIP_CONFLICT');
 assert.equal((await admin.query('SELECT count(*)::int AS n FROM "Trip" WHERE "ownerSubject"=$1::uuid',[A])).rows[0].n,1);
}));
test('concurrent creates with same mutation serialize once; concurrent stale updates have one winner and one conflict',()=>fixture(async({request})=>{
 const t=trip(),create={mutationId:randomUUID(),trip:t};const a=await Promise.all([request('A','POST','',create),request('A','POST','',create)]);for(const r of a)assert.equal(r.status,201);const results=await Promise.all(a.map(r=>r.json()));assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);
 const updates=await Promise.all(['one','two'].map(name=>request('A','PUT','/'+t.id,{mutationId:randomUUID(),expectedVersion:1,trip:{...t,name}})));assert.deepEqual(updates.map(r=>r.status).sort(),[200,409]);assert.equal((await ok(await request('A','GET','/'+t.id))).version,2);
}));
test('unknown owner/role/catalog, invalid days/money/IDs, query and version are rejected without writes; full valid 60-activity payload fits',()=>fixture(async({request,A})=>{
 const t=trip();for(const body of [{mutationId:randomUUID(),trip:t,ownerId:A},{mutationId:randomUUID(),trip:{...t,ownerId:A}},{mutationId:randomUUID(),trip:{...t,people:99}},{mutationId:randomUUID(),trip:{...t,budgetVnd:-1}}])await error(await request('A','POST','',body),400,'BAD_REQUEST');
 const invalid=structuredClone(t);invalid.days[0].activities[0].location.placeId='missing';await error(await request('A','POST','',{mutationId:randomUUID(),trip:invalid}),400,'BAD_REQUEST');
 await error(await request('A','GET','?userId='+A),400,'BAD_REQUEST');await error(await request('A','PUT','/other',{mutationId:randomUUID(),expectedVersion:1,trip:t}),400,'BAD_REQUEST');
 assert.equal((await admin.query('SELECT count(*)::int AS n FROM "Trip" WHERE "ownerSubject"=$1::uuid',[A])).rows[0].n,0);
 const large=trip(undefined,5);large.days.forEach((day,d)=>{day.activities=Array.from({length:12},(_,i)=>({id:`a-${d}-${i}`,name:'Custom',location:{kind:'custom'},startTime:null,endTime:null,costVnd:i===0?0:null,notes:'ế'.repeat(500)}));});assert.ok(Buffer.byteLength(JSON.stringify(large))>8192);await ok(await request('A','POST','',{mutationId:randomUUID(),trip:large}),201);assert.deepEqual((await ok(await request('A','GET','/'+large.id))).trip,large);
}));
test('forced DB error after children/header update rolls back aggregate, version and mutation receipt together',()=>fixture(async({request,A})=>{
 const t=trip(),bad=randomUUID();await ok(await request('A','POST','',{mutationId:randomUUID(),trip:t}),201);
 await admin.query(`CREATE FUNCTION test_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."mutationId"='${bad}'::uuid THEN RAISE EXCEPTION 'DO_NOT_LEAK'; END IF; RETURN NEW; END $$`);await admin.query('CREATE TRIGGER test_fail_receipt BEFORE INSERT ON "TripMutation" FOR EACH ROW EXECUTE FUNCTION test_fail_receipt()');
 try{await error(await request('A','PUT','/'+t.id,{mutationId:bad,expectedVersion:1,trip:{...t,name:'must rollback',days:t.days.map(d=>({...d,activities:[]}))}}),503,'DB_UNAVAILABLE');const read=await ok(await request('A','GET','/'+t.id));assert.equal(read.version,1);assert.deepEqual(read.trip,t);assert.equal((await admin.query('SELECT 1 FROM "TripMutation" WHERE "ownerSubject"=$1::uuid AND "mutationId"=$2::uuid',[A,bad])).rowCount,0);}finally{await admin.query('DROP TRIGGER test_fail_receipt ON "TripMutation"');await admin.query('DROP FUNCTION test_fail_receipt()');}
}));
test('runtime role cannot DDL/seed/bypass RLS; missing or wrong tenant context cannot read other project/user data',()=>fixture(async({request,A,B})=>{
 const t=trip();await ok(await request('A','POST','',{mutationId:randomUUID(),trip:t}),201);const pool=new Pool({connectionString:runtimeUrl,max:1});const c=await pool.connect();
 try{assert.equal((await c.query('SELECT id FROM "Trip"')).rowCount,0);await assert.rejects(c.query('CREATE TABLE should_not_create(id int)'));await assert.rejects(c.query('DELETE FROM "Place"'));await assert.rejects(c.query('SET ROLE goease_admin'));await c.query('BEGIN');await c.query("SELECT set_config('goease.issuer',$1,true),set_config('goease.subject',$2,true)",[issuer,B]);assert.equal((await c.query('SELECT id FROM "Trip"')).rowCount,0);await c.query("SELECT set_config('goease.issuer',$1,true),set_config('goease.subject',$2,true)",['https://other-project.example/auth/v1',A]);assert.equal((await c.query('SELECT id FROM "Trip"')).rowCount,0);await c.query('ROLLBACK');}finally{c.release();await pool.end();}
}));
test('pagination is bounded and deterministic, ledger/quota expiry fails safely without silently overwriting',()=>fixture(async({request,A})=>{
 for(let i=0;i<21;i++)await ok(await request('A','POST','',{mutationId:randomUUID(),trip:trip('page-'+String(i).padStart(2,'0'))}),201);
 const page=serverTripListResponseSchema.parse(await ok(await request('A','GET')));assert.equal(page.items.length,20);assert.equal(page.nextCursor,'page-19');const last=await ok(await request('A','GET','?cursor='+page.nextCursor));assert.equal(last.items.length,1);assert.equal(last.nextCursor,null);
 const t=trip('page-00'),update={mutationId:randomUUID(),expectedVersion:1,trip:{...t,name:'once'}};await ok(await request('A','PUT','/'+t.id,update));await admin.query('UPDATE "TripMutation" SET "createdAt"=now()-interval \'25 hours\' WHERE "ownerSubject"=$1::uuid AND "mutationId"=$2::uuid',[A,update.mutationId]);await error(await request('A','PUT','/'+t.id,update),409,'TRIP_CONFLICT');
}));
test('data survives real API + PostgreSQL restart; migration is repeatable from isolated empty database',()=>fixture(async({request,stop,start})=>{
 const t=trip();await ok(await request('A','POST','',{mutationId:randomUUID(),trip:t}),201);await stop();await admin.end();admin=new Pool({connectionString:adminUrl,max:1});
 if(process.env.GOEASE_DB_TEST_META){const meta=JSON.parse(await readFile(process.env.GOEASE_DB_TEST_META,'utf8'));assert.ok(meta.database.startsWith('goease_test_'));pgControl(meta,'stop');pgControl(meta,'start');}
 else {const container=process.env.GOEASE_DB_TEST_CONTAINER_ID;assert.match(container??'',/^[a-f0-9]{64}$/);execFileSync('docker',['restart',container],{stdio:'ignore'});}
 let ready=false;for(let i=0;i<30;i++){const p=new Pool({connectionString:runtimeUrl,max:1,connectionTimeoutMillis:500});try{await p.query('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,300));}finally{await p.end();}}assert.equal(ready,true);await start();const read=await ok(await request('A','GET','/'+t.id));assert.deepEqual(read.trip,t);assert.equal(read.version,1);
}));
test('mobile consumer → real Nest HTTP → Prisma/Postgres saves/reads/conflicts/deletes (provider double + URL shim, not native TLS proof)',()=>fixture(async({transport,tokens})=>{
 const base='https://fixture-api.example.test',options={fetcher:transport},t=trip(),create={kind:'create',mutationId:randomUUID(),trip:t};
 const saved=await callServerTripApi(base,tokens.A,create,options);assert.equal(saved.data.result.version,1);assert.equal((await callServerTripApi(base,tokens.A,create,options)).data.replayed,true);
 assert.deepEqual((await callServerTripApi(base,tokens.A,{kind:'get',id:t.id},options)).data.trip,t);await assert.rejects(callServerTripApi(base,tokens.B,{kind:'get',id:t.id},options),e=>e.status===404);
 await callServerTripApi(base,tokens.A,{kind:'update',id:t.id,mutationId:randomUUID(),expectedVersion:1,trip:{...t,name:'Mobile update'}},options);await assert.rejects(callServerTripApi(base,tokens.A,{kind:'delete',id:t.id,mutationId:randomUUID(),expectedVersion:1},options),e=>e.code==='TRIP_CONFLICT');
 await callServerTripApi(base,tokens.A,{kind:'delete',id:t.id,mutationId:randomUUID(),expectedVersion:2},options);assert.equal((await callServerTripApi(base,tokens.A,{kind:'list'},options)).data.items.length,0);
}));
test('private backup restores into a NEW isolated database with owner/RLS/version intact; never overwrite original DB',()=>fixture(async({request,stop,start,env})=>{
 const t=trip();await ok(await request('A','POST','',{mutationId:randomUUID(),trip:t}),201);await stop();const destination='goease_test_restore_'+randomUUID().replaceAll('-','');const original=env.DATABASE_URL;
 try{
  const adminTarget=new URL(adminUrl);const args=['-U',decodeURIComponent(adminTarget.username),'-d',adminTarget.pathname.slice(1),'-Fc'];let dump,restore;
  if(process.env.GOEASE_DB_TEST_META){const meta=JSON.parse(await readFile(process.env.GOEASE_DB_TEST_META,'utf8'));const cliEnv={...process.env,PGPASSWORD:decodeURIComponent(adminTarget.password)};dump=execFileSync(join(meta.pgBin,process.platform==='win32'?'pg_dump.exe':'pg_dump'),['-h',adminTarget.hostname,'-p',adminTarget.port,...args],{env:cliEnv,stdio:['ignore','pipe','ignore']});restore=()=>execFileSync(join(meta.pgBin,process.platform==='win32'?'pg_restore.exe':'pg_restore'),['-h',adminTarget.hostname,'-p',adminTarget.port,'-U',adminTarget.username,'-d',destination,'--no-owner'],{env:cliEnv,input:dump,stdio:['pipe','ignore','ignore']});}
  else{const container=process.env.GOEASE_DB_TEST_CONTAINER_ID;assert.match(container??'',/^[a-f0-9]{64}$/);dump=execFileSync('docker',['exec',container,'pg_dump',...args],{stdio:['ignore','pipe','ignore']});restore=()=>execFileSync('docker',['exec','-i',container,'pg_restore','-U',adminTarget.username,'-d',destination,'--no-owner'],{input:dump,stdio:['pipe','ignore','ignore']});}
  await admin.query(`CREATE DATABASE "${destination}"`);restore();const target=new URL(original);target.pathname='/'+destination;env.DATABASE_URL=target.toString();await start();const read=await ok(await request('A','GET','/'+t.id));assert.deepEqual(read.trip,t);assert.equal(read.version,1);
 }catch{throw Error('Fixture backup/restore failed; no credential/dump content printed');}
 finally{await stop();env.DATABASE_URL=original;await admin.query(`DROP DATABASE IF EXISTS "${destination}"`);}
}));
test('product account login/restore/logout + workspace CRUD/conflict use real HTTP/Postgres; A/B remain isolated (Auth provider double)',()=>fixture(async({A,B,tokens,transport,request})=>{
 const bytes=new Map();let refresh=null,workspace;
 const auth=createAuthPilot({url:project,key:'sb_publishable_offline_fixture_00000000',storage:{get:async()=>refresh,set:async value=>{refresh=value;},remove:async()=>{refresh=null;}},onChange:state=>{if(state.phase!=='backend-verified')workspace?.lock();},fetcher:async(url,options)=>{
  if(url.startsWith(project)){
   if(url.includes('/token?')){const body=JSON.parse(options.body),who=(body.email==='b@example.test'||body.refresh_token==='fixture_refresh_B')?'B':'A';return new Response(JSON.stringify({access_token:tokens[who],refresh_token:'fixture_refresh_'+who,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600}));}
   if(url.endsWith('/user'))return new Response(JSON.stringify({id:options.headers.authorization==='Bearer '+tokens.A?A:B,aud:'authenticated',role:'authenticated'}));
   if(url.includes('/logout?'))return new Response(null,{status:204});assert.fail('Unexpected fixture Auth route');
  }return transport(url,options);
 }});
 workspace=createAccountTrips({storage:{get:async key=>bytes.get(key)??null,set:async(key,value)=>{bytes.set(key,value);}},request:op=>auth.serverTrips(op),newId:randomUUID});
 async function login(who){await auth.login(who.toLowerCase()+'@example.test','offline_fixture_password');await auth.verifyBackend('https://fixture-api.example.test');assert.equal(auth.snapshot().phase,'backend-verified');await workspace.activate('abcdefghijklmnopqrst.'+(who==='A'?A:B));}
 await login('A');const t=trip();await workspace.begin(t);assert.equal(await workspace.save(),true);await workspace.read(t.id);assert.equal(workspace.getSnapshot().selected.version,1);
 await workspace.begin({...t,name:'My account draft'},1);
 await ok(await request('A','PUT','/'+t.id,{mutationId:randomUUID(),expectedVersion:1,trip:{...t,name:'Other device'}}));
 assert.equal(await workspace.save(),false);assert.equal(workspace.getSnapshot().conflict,true);assert.equal(workspace.getSnapshot().draft.trip.name,'My account draft');await workspace.read(t.id);assert.equal(workspace.getSnapshot().latest.trip.name,'Other device');await workspace.rebase();await workspace.save();assert.equal(workspace.getSnapshot().selected.version,3);
 await auth.logout();assert.equal(workspace.getSnapshot().selected,null);await login('B');await workspace.list();assert.equal(workspace.getSnapshot().items.length,0);assert.equal(await workspace.read(t.id),false);assert.equal(workspace.getSnapshot().selected,null);
 await auth.logout();await login('A');workspace.lock();auth.cancel();await auth.restore();await auth.verifyBackend('https://fixture-api.example.test');await workspace.activate('abcdefghijklmnopqrst.'+A);await workspace.read(t.id);assert.equal(workspace.getSnapshot().selected.trip.name,'My account draft');await workspace.remove(workspace.getSnapshot().selected);await error(await request('A','GET','/'+t.id),404,'NOT_FOUND');
 const raw=JSON.stringify([...bytes]);assert.equal(raw.includes(tokens.A),false);assert.equal(raw.includes('offline_fixture_password'),false);assert.equal(raw.includes('fixture_refresh_A'),false);
}));
test('product workspace lost response survives app recreation and same-owner replay does not create duplicate Postgres trips',()=>fixture(async({A,B,tokens,transport,request})=>{
 const bytes=new Map(),storage={get:async key=>bytes.get(key)??null,set:async(key,value)=>{bytes.set(key,value);}},t=trip();let lose=true;
 const options={storage,newId:randomUUID,request:async op=>{const result=await callServerTripApi('https://fixture-api.example.test',tokens.A,op,{fetcher:transport});if(lose&&op.kind==='create'){lose=false;throw new ServerTripError('NETWORK','lost response');}return result;}};
 const first=createAccountTrips(options);await first.activate('abcdefghijklmnopqrst.'+A);await first.begin(t);assert.equal(await first.save(),false);const pending=first.getSnapshot().pending;first.lock();
 const restored=createAccountTrips(options);await restored.activate('abcdefghijklmnopqrst.'+B);assert.equal(restored.getSnapshot().pending,null);await restored.activate('abcdefghijklmnopqrst.'+A);assert.deepEqual(restored.getSnapshot().pending,pending);assert.equal(await restored.retry(),true);assert.equal(restored.getSnapshot().selected,null);await restored.read(t.id);assert.equal(restored.getSnapshot().selected.version,1);assert.equal((await ok(await request('A','GET'))).items.length,1);
}));
