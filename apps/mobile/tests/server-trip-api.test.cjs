const {test}=require('node:test');const assert=require('node:assert/strict');
const {callServerTripApi}=require('../.logic-tests/server-trip-controller.js');const {createAuthPilot}=require('../.logic-tests/auth-pilot-controller.js');
const {generateSampleTrip}=require('@goease/itinerary');const {getDalatCatalog}=require('@goease/catalog');
const t=generateSampleTrip({name:'Client fixture',destinationId:'da-lat',startDate:'2026-10-15',durationDays:1,people:2,budgetVnd:null},getDalatCatalog(),{tripId:'client-trip',today:'2026-10-15'}).trip;
const mutationId='12345678-1234-4234-8234-123456789abc',token='offline.fixture.signature',base='https://api.example.test',date='2026-10-14T18:00:00.000Z';
const receipt=()=>({apiVersion:'1',mutationId,replayed:false,result:{kind:'saved',trip:t,version:1,updatedAt:date}});
test('server client sends HTTPS user JWT, stable mutationId/body and validates producer response without exposing credentials',async()=>{
 let supplied;const op={kind:'create',mutationId,trip:t};const result=await callServerTripApi(base,token,op,{fetcher:async(url,options)=>{supplied={url,options};return new Response(JSON.stringify(receipt()),{status:201});}});
 assert.equal(result.data.result.trip.id,t.id);assert.equal(supplied.url,base+'/v1/trips');assert.equal(supplied.options.headers.authorization,'Bearer '+token);assert.equal(supplied.options.redirect,'error');assert.deepEqual(JSON.parse(supplied.options.body),{mutationId,trip:t});assert.equal(JSON.stringify(result).includes(token),false);
});
test('conflict/auth/network/timeout/cancel are explicit, raw remote errors redacted and no automatic retry',async()=>{
 let calls=0;await assert.rejects(callServerTripApi(base,token,{kind:'get',id:t.id},{fetcher:async()=>{calls++;return new Response(JSON.stringify({apiVersion:'1',statusCode:409,error:{code:'TRIP_CONFLICT',message:'DO_NOT_LEAK',requestId:mutationId}}),{status:409});}}),e=>e.code==='TRIP_CONFLICT'&&e.status===409&&!e.message.includes('DO_NOT_LEAK'));assert.equal(calls,1);
 await assert.rejects(callServerTripApi(base,token,{kind:'get',id:t.id},{timeoutMs:100,fetcher:async()=>new Promise(()=>{})}),{code:'TIMEOUT'});
 const c=new AbortController();c.abort();await assert.rejects(callServerTripApi(base,token,{kind:'get',id:t.id},{signal:c.signal,fetcher:async()=>assert.fail('cancelled')}),{code:'CANCELLED'});
});
test('HTTP LAN, invalid mutation, owner injection and forged/mismatched wire result cannot be accepted',async()=>{
 await assert.rejects(callServerTripApi('http://192.168.1.5:3000',token,{kind:'get',id:t.id}),{code:'CONFIG'});
 await assert.rejects(callServerTripApi(base,token,{kind:'create',mutationId,trip:{...t,ownerId:'other'}},{fetcher:async()=>assert.fail('invalid')}),{code:'INVALID'});
 for(const bad of [{...receipt(),mutationId:'b5aa7f8a-1711-4c09-b432-bcf075c57b5f'},{...receipt(),result:{...receipt().result,version:2}},{...receipt(),result:{...receipt().result,trip:{...t,id:'other'}}}])await assert.rejects(callServerTripApi(base,token,{kind:'create',mutationId,trip:t},{fetcher:async()=>new Response(JSON.stringify(bad))}),{code:'INVALID_RESPONSE'});
});
test('auth pilot only delegates trip requests for current backend-verified identity and clears authority after cancel/logout',async()=>{
 const id='b5aa7f8a-1711-4c09-b432-bcf075c57b5f';let saved=null,calls=0;
 const pilot=createAuthPilot({url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_publishable_offline_fixture_00000000',storage:{get:async()=>saved,set:async v=>{saved=v;},remove:async()=>{saved=null;}},fetcher:async target=>{calls++;if(target.includes('/token?'))return new Response(JSON.stringify({access_token:token,refresh_token:'fixture_refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600}));if(target.endsWith('/user'))return new Response(JSON.stringify({id,aud:'authenticated',role:'authenticated'}));if(target.endsWith('/auth/me'))return new Response(JSON.stringify({apiVersion:'1',identity:{id,provider:'supabase'}}));return new Response(JSON.stringify({apiVersion:'1',items:[],nextCursor:null}));}});
 await assert.rejects(pilot.serverTrips({kind:'list'}),{code:'AUTH_REQUIRED'});await pilot.login('u@example.test','p');await assert.rejects(pilot.serverTrips({kind:'list'}),{code:'AUTH_REQUIRED'});await pilot.verifyBackend(base);assert.equal((await pilot.serverTrips({kind:'list'})).kind,'list');assert.equal(calls,4);pilot.cancel();await assert.rejects(pilot.serverTrips({kind:'list'}),{code:'AUTH_REQUIRED'});assert.equal(calls,4);
});
