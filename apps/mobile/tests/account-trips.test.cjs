const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createAccountTrips}=require('../.logic-tests/account-trip-controller.js');
const {ServerTripError}=require('../.logic-tests/server-trip-controller.js');
const {generateSampleTrip}=require('@goease/itinerary'),{getDalatCatalog}=require('@goease/catalog');
const A='abcdefghijklmnopqrst.12345678-1234-4234-8234-123456789abc',B='abcdefghijklmnopqrst.b5aa7f8a-1711-4c09-b432-bcf075c57b5f';
const trip=()=>generateSampleTrip({name:'Account fixture',destinationId:'da-lat',startDate:'2026-10-15',durationDays:1,people:2,budgetVnd:null},getDalatCatalog(),{tripId:randomUUID(),today:'2026-10-15'}).trip;
const stamp='2026-10-15T00:00:00.000Z';
function setup(patch={}){
 const disk=new Map(),calls=[];
 const storage={get:async key=>disk.get(key)??null,set:async(key,value)=>{disk.set(key,value);}};
 const reply=async operation=>{calls.push(structuredClone(operation));if(operation.kind==='list')return {kind:'list',data:{apiVersion:'1',items:[],nextCursor:null}};if(operation.kind==='get')return {kind:'get',data:{trip:{...trip(),id:operation.id},version:2,updatedAt:stamp}};return {kind:'mutation',data:{apiVersion:'1',mutationId:operation.mutationId,replayed:false,result:operation.kind==='delete'?{kind:'deleted',id:operation.id,version:operation.expectedVersion+1,deletedAt:stamp}:{kind:'saved',trip:operation.trip,version:operation.kind==='create'?1:operation.expectedVersion+1,updatedAt:stamp}}};};
 const opts={storage,request:reply,newId:randomUUID,...patch};return {store:createAccountTrips(opts),disk,calls,opts};
}
test('owner-bound drafts survive reload, remain hidden while locked and cannot appear under user B',async()=>{
 const f=setup(),t=trip();await f.store.activate(A);await f.store.begin(t);await f.store.change({...t,name:'Applied draft'});f.store.lock();assert.equal(f.store.getSnapshot().draft,null);
 await f.store.activate(B);assert.equal(f.store.getSnapshot().draft,null);await f.store.begin({...trip(),name:'B private'});f.store.lock();await f.store.activate(A);assert.equal(f.store.getSnapshot().draft.trip.name,'Applied draft');
 assert.equal(f.disk.size,2);for(const key of f.disk.keys())assert.ok(key.startsWith('goease.account-workspace.v1.'));assert.equal(f.calls.length,0);
});
test('unknown result keeps exact payload/key across app recreation; retry sends once and never writes guest data',async()=>{
 const f=setup(),t=trip();f.opts.request=async()=>{throw new ServerTripError('NETWORK','offline');};const first=createAccountTrips(f.opts);await first.activate(A);await first.begin(t);await first.save();const pending=first.getSnapshot().pending;assert.equal(pending.trip.id,t.id);assert.equal(first.getSnapshot().draft.trip.id,t.id);
 const next=setup();f.opts.request=next.opts.request;const reopened=createAccountTrips(f.opts);await reopened.activate(B);assert.equal(reopened.getSnapshot().pending,null);await reopened.activate(A);assert.deepEqual(reopened.getSnapshot().pending,pending);await reopened.retry();assert.deepEqual(next.calls,[pending]);assert.equal(reopened.getSnapshot().draft,null);assert.equal(reopened.getSnapshot().selected.version,1);
});
test('a late account-A response after lock/account-B activation cannot populate B cache or remove A pending bytes',async()=>{
 let resolve;const f=setup({request:()=>new Promise(r=>{resolve=r;})}),t=trip();await f.store.activate(A);await f.store.begin(t);const saving=f.store.save();await new Promise(r=>setImmediate(r));const pending=f.store.getSnapshot().pending;f.store.lock();await f.store.activate(B);
 resolve({kind:'mutation',data:{mutationId:pending.mutationId,replayed:false,result:{kind:'saved',trip:t,version:1,updatedAt:stamp}}});await saving;assert.equal(f.store.getSnapshot().owner,B);assert.equal(f.store.getSnapshot().selected,null);await f.store.activate(A);assert.deepEqual(f.store.getSnapshot().pending,pending);
});
test('double tap, storage failure and malformed persisted workspace fail safely before outbound',async()=>{
 const f=setup({storage:{get:async()=>null,set:async()=>{throw Error('disk');}}});await f.store.activate(A);await f.store.begin(trip());await Promise.allSettled([f.store.save(),f.store.save()]);assert.equal(f.calls.length,0);assert.ok(f.store.getSnapshot().draft);assert.equal(f.store.getSnapshot().durable,false);
 const broken=setup();broken.disk.set('goease.account-workspace.v1.'+B,JSON.stringify({schemaVersion:1,owner:A,draft:null,pending:null}));assert.equal(await broken.store.activate(B),false);assert.equal(broken.store.getSnapshot().ready,false);assert.equal(broken.disk.size,1);
});
test('conflict preserves draft; reading current server does not overwrite it; rebase is explicit and allocates a new mutation key',async()=>{
 let conflict=true;const f=setup(),original=f.opts.request,t=trip();f.opts.request=async op=>{if(op.kind==='update'&&conflict)throw new ServerTripError('TRIP_CONFLICT','409',409);return original(op);};const s=createAccountTrips(f.opts);
 await s.activate(A);await s.begin(t,1);await s.change({...t,name:'My change'});await s.save();const failed=s.getSnapshot();assert.equal(failed.conflict,true);assert.equal(failed.pending,null);assert.equal(failed.draft.baseVersion,1);assert.equal(await s.save(),false);
 await s.read(t.id);assert.equal(s.getSnapshot().draft.trip.name,'My change');assert.equal(s.getSnapshot().latest.version,2);await s.rebase();assert.equal(s.getSnapshot().draft.baseVersion,2);conflict=false;await s.save();assert.equal(s.getSnapshot().selected.version,3);
});
test('discard/use-server/delete and replayed receipts never report stale snapshots as current server data',async()=>{
 const f=setup(),t=trip();await f.store.activate(A);await f.store.begin(t,1);await f.store.read(t.id);await f.store.useLatest();assert.equal(f.store.getSnapshot().draft,null);assert.equal(f.store.getSnapshot().selected.version,2);await f.store.remove(f.store.getSnapshot().selected);assert.equal(f.store.getSnapshot().selected,null);
 const replay=setup({request:async op=>({kind:'mutation',data:{mutationId:op.mutationId,replayed:true,result:{kind:'saved',trip:op.trip,version:1,updatedAt:stamp}}})});await replay.store.activate(A);await replay.store.begin(t);await replay.store.save();assert.equal(replay.store.getSnapshot().selected,null);assert.match(replay.store.getSnapshot().message,/biên nhận cũ/);
});
test('double save sends one mutation; late list responses are ignored after account switch',async()=>{
 let resolve,calls=0;const f=setup({request:op=>{calls++;return new Promise(r=>{resolve=()=>r(op.kind==='list'?{kind:'list',data:{items:[{id:'private-a',name:'Private A'}],nextCursor:null}}:{kind:'mutation',data:{mutationId:op.mutationId,replayed:false,result:{kind:'saved',trip:op.trip,version:1,updatedAt:stamp}}});});}});
 await f.store.activate(A);await f.store.begin(trip());const saving=f.store.save();await new Promise(r=>setImmediate(r));await assert.rejects(f.store.save());assert.equal(calls,1);resolve();await saving;
 const listing=f.store.list();f.store.lock();await f.store.activate(B);resolve();await listing;assert.deepEqual(f.store.getSnapshot().items,[]);assert.equal(f.store.getSnapshot().owner,B);
});
