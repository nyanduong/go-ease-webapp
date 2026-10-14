import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { apiRoot, isolatedUrl, localCluster, prepareDatabase, pgControl } from './db-tools.mjs';
let meta;
try {
  let adminUrl=process.env.GOEASE_DB_TEST_ADMIN_URL, runtimeUrl;
  if(adminUrl){isolatedUrl(adminUrl,'test');runtimeUrl=await prepareDatabase(adminUrl);}
  else {meta=await localCluster('test');adminUrl=meta.adminUrl;runtimeUrl=meta.runtimeUrl;}
  execFileSync(process.execPath,['--test','tests-db/trips.test.mjs'],{cwd:apiRoot,env:{...process.env,GOEASE_DB_TEST_ACK:'isolated',GOEASE_DB_TEST_ADMIN_URL:adminUrl,GOEASE_DB_TEST_RUNTIME_URL:runtimeUrl,...(meta?{GOEASE_DB_TEST_META:join(meta.root,'metadata.json')}:{})},stdio:'inherit'});
}catch{console.error('Isolated real-Postgres tests failed. No production/personal database fallback and no credential output.');process.exitCode=1;}
finally{if(meta)try{pgControl(meta,'stop');console.info('Isolated Postgres stopped; private test files retained in OS temp for inspection.');}catch{console.error('Could not confirm isolated Postgres shutdown.');process.exitCode=1;}}
