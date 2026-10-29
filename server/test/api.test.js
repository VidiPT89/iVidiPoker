import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { Tables } from '../worker.js';

let authFailure=0;
let deleteResponse=null;
let identityLookups=0;
globalThis.fetch=async (url,options)=>{
 if(options.method==='DELETE') return deleteResponse ? await deleteResponse : {ok:true};
 identityLookups++;
 if(authFailure) return {ok:false,status:authFailure};
 const id=options.headers.Authorization.replace('Bearer ','');
 return {status:401,ok:['alice','bob','carol','david','eva','frank','grace','henry'].includes(id),json:async()=>({id,user_metadata:{display_name:id}})};
};
// In-memory stand-in for Durable Object storage; values are copied as the real storage serializes them.
class Storage {
 data=new Map();
 async list({prefix}) {return new Map([...this.data].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key,structuredClone(value)]));}
 async put(entries) {for(const [key,value] of Object.entries(entries)) this.data.set(key,structuredClone(value));}
 async delete(keys) {for(const key of keys) this.data.delete(key);}
}
const env={SUPABASE_URL:'https://auth.test.invalid',SUPABASE_ANON_KEY:'test-public-key'};
async function boot(storage) {
 let ready;
 const tables=new Tables({storage,blockConcurrencyWhile(fn){ready=fn();}},env);
 await ready;
 return tables;
}
const storage=new Storage();
let tables=await boot(storage);
const namespace={idFromName:name=>name,get:()=>({fetch:request=>tables.fetch(request)})};
async function request(method,path,id,body,ip='test') {
 const headers={'CF-Connecting-IP':ip};
 if(id) headers.Authorization='Bearer '+id;
 const response=await worker.fetch(new Request('https://poker.test'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),{...env,TABLES:namespace});
 return {status:response.status,data:await response.json()};
}

test('authenticated API: create, join, privacy, authorization, stale actions and reconnect',async()=>{
 assert.equal((await request('GET','/health')).data.status,'ok');
 assert.equal((await request('GET','/me')).status,401);
 const created=await request('POST','/rooms','alice',{practice:false});assert.equal(created.status,201);
 const code=created.data.code;
 assert.equal((await request('GET','/rooms/'+code,'carol')).status,400);
 const joined=await request('POST','/rooms/'+code+'/join','bob',{});assert.equal(joined.data.players.length,2);
 assert.equal((await request('POST','/rooms/'+code+'/start','bob',{})).status,400);
 const started=await request('POST','/rooms/'+code+'/start','alice',{});assert.equal(started.data.phase,'preflop');
 assert.equal(started.data.players[1].cards.length,0);
 const bob=await request('GET','/rooms/'+code,'bob');assert.equal(bob.data.players[0].cards.length,0);assert.equal(bob.data.players[1].cards.length,2);
 assert.equal((await request('POST','/rooms/'+code+'/join','carol',{})).data.error,'hand_in_progress');
 const restored=await request('GET','/me','alice');assert.equal(restored.data.room.code,code);
 const version=started.data.version;
 const call=await request('POST','/rooms/'+code+'/action','alice',{action:'call',version});assert.equal(call.status,200);
 const duplicate=await request('POST','/rooms/'+code+'/action','alice',{action:'call',version});assert.equal(duplicate.data.error,'stale_state');
 const left=await request('POST','/rooms/'+code+'/leave','alice',{});assert.equal(left.data.error,'finish_hand_first');
 assert.equal((await request('POST','/account/delete','alice',{})).data.error,'deletion_unavailable');
});
test('upstream authentication outage is not reported as an expired account',async()=>{
 const originalError=console.error;console.error=()=>{};
 authFailure=503;
 try {assert.equal((await request('GET','/me','outage-a')).status,503);}
 finally {authFailure=0;console.error=originalError;}
 authFailure=401;
 try {assert.equal((await request('GET','/me','outage-b')).status,401);}
 finally {authFailure=0;}
});
test('verified tokens are reused while polling instead of querying Supabase every time',async()=>{
 await request('GET','/me','carol');
 const before=identityLookups;
 for(let i=0;i<5;i++) assert.equal((await request('GET','/me','carol')).status,200);
 assert.equal(identityLookups,before);
});
test('each client address has its own request limit',async()=>{
 for(let i=0;i<600;i++) await request('GET','/me','unknown-token',undefined,'10.0.0.9');
 assert.equal((await request('GET','/me','carol',undefined,'10.0.0.9')).status,429);
 assert.equal((await request('GET','/me','carol',undefined,'10.0.0.10')).status,200);
});
test('malformed body types are rejected before creating a table',async()=>{
 for(const value of [null,[],42,'text']) {
  const response=await request('POST','/rooms','carol',value);
  assert.equal(response.status,400);assert.equal(response.data.error,'invalid_json');
 }
 assert.equal((await request('GET','/me','carol')).data.room,null);
});
test('deletion locks the table and uses current state after unrelated rollback',async()=>{
 const r=await request('POST','/rooms','david',{});const code=r.data.code;
 await request('POST','/rooms/'+code+'/join','eva',{});
 tables.service.serviceKey='test-server-only-key';
 let resolveDelete;deleteResponse=new Promise(resolve=>{resolveDelete=resolve;});
 const pending=request('POST','/account/delete','david',{});
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal((await request('POST','/rooms/'+code+'/start','eva',{})).data.error,'table_busy');
 // A failed mutation on another table rolls back while deletion awaits its provider.
 const other=(await request('GET','/me','alice')).data.room;
 assert.equal((await request('POST','/rooms/'+other.code+'/action','alice',{action:'check',version:-1})).status,400);
 resolveDelete({ok:true});assert.equal((await pending).status,200);
 deleteResponse=null;tables.service.serviceKey=undefined;
 const survivor=(await request('GET','/me','eva')).data.room;
 assert.equal(survivor.host,'eva');assert.equal(survivor.players.length,1);
 assert.equal(survivor.players[0].id,'eva');assert.deepEqual(survivor.log,[]);
 assert.equal((await request('GET','/me','david')).data.room,null);
});
test('bots act when the table is polled, and a failing table rolls back alone',async()=>{
 const healthy=(await request('POST','/rooms','frank',{practice:true})).data.code;
 const broken=(await request('POST','/rooms','grace',{practice:true})).data.code;
 const before={};
 for(const [code,id] of [[healthy,'frank'],[broken,'grace']]) before[code]=(await request('POST','/rooms/'+code+'/start',id,{})).data.version;
 // A bot without cards makes its strategy throw.
 tables.service.rooms.get(broken).players.forEach(p=>{if(p.bot) p.cards=[];});
 for(const code of [healthy,broken]) tables.service.rooms.get(code).deadline=Date.now()-1;
 const originalError=console.error;console.error=()=>{};
 try {
  assert.ok((await request('GET','/rooms/'+healthy,'frank')).data.version>before[healthy]);
  const stuck=await request('GET','/rooms/'+broken,'grace');
  assert.equal(stuck.status,200);assert.equal(stuck.data.version,before[broken]);
 } finally {console.error=originalError;}
});
test('tables are saved, survive a restart and are removed from storage when empty',async()=>{
 const code=(await request('POST','/rooms','henry',{})).data.code;
 assert.ok(storage.data.has('room:'+code));
 tables=await boot(storage);
 assert.equal((await request('GET','/me','henry')).data.room.code,code);
 assert.equal((await request('POST','/rooms/'+code+'/leave','henry',{})).status,200);
 assert.equal(storage.data.has('room:'+code),false);
});
