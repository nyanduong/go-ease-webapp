const {test}=require('node:test'),assert=require('node:assert/strict');
const {fetchManagedCatalog}=require('../.logic-tests/catalog-api-controller.js');
const {getDalatCatalog}=require('@goease/catalog');
test('account consumes managed catalog with disabled history, rejects HTTP/duplicate data and does not send a JWT',async()=>{
 const places=getDalatCatalog().map((entry,i)=>({entry,version:1,enabled:i!==0}));let init;
 const result=await fetchManagedCatalog('https://api.example.test',async(_url,options)=>{init=options;return new Response(JSON.stringify({apiVersion:'1',places}));});assert.equal(result.places[0].enabled,false);assert.equal(init.headers,undefined);assert.equal(init.redirect,'error');
 await assert.rejects(fetchManagedCatalog('http://192.168.1.1:3000',async()=>assert.fail('HTTP not allowed')));
 await assert.rejects(fetchManagedCatalog('https://api.example.test',async()=>new Response(JSON.stringify({apiVersion:'1',places:[...places.slice(1),places[1]]}))));
});
