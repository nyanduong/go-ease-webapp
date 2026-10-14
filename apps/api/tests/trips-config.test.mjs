import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../dist/app.js';
import { readConfig } from '../dist/config.js';
test('trips disabled/missing database fail closed without a mock store or auth cloud call',async()=>{
 for(const [env,code] of [[{},'TRIPS_DISABLED'],[{TRIPS_ENABLED:'true',AUTH_ENABLED:'true',API_REQUEST_TIMEOUT_MS:'8000'},'TRIPS_NOT_CONFIGURED']]){
  const {app}=await createApi(env,undefined,{},undefined,{fetcher:async()=>assert.fail('no auth call')});
  try{await app.listen(0,'127.0.0.1');const r=await fetch(await app.getUrl()+'/v1/trips');assert.equal(r.status,503);assert.equal((await r.json()).error.code,code);}finally{await app.close();}
 }
});
test('database config refuses personal/public/admin URLs and auth/DB deadlines that can commit after HTTP deadline',()=>{
 const env={TRIPS_ENABLED:'true',AUTH_ENABLED:'true',API_REQUEST_TIMEOUT_MS:'8000'};
 const good='postgresql://goease_runtime:offline_fixture@127.0.0.1:55475/goease_dev_local';assert.equal(readConfig({...env,DATABASE_URL:good}).TRIPS_ENABLED,true);
 for(const url of [good.replace('127.0.0.1','public.example.test'),good.replace('goease_runtime:','postgres:'),good.replace('goease_dev_local','postgres'),good+'?options=unsafe',good.replace('postgresql:','http:')])assert.throws(()=>readConfig({...env,DATABASE_URL:url}),e=>e.message==='Invalid API config: DATABASE_URL');
 assert.throws(()=>readConfig({...env,AUTH_ENABLED:'false'}));assert.throws(()=>readConfig({...env,API_REQUEST_TIMEOUT_MS:'5000'}));
});
