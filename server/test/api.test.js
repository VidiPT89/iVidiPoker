import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.SUPABASE_URL='https://auth.test.invalid';
process.env.SUPABASE_ANON_KEY='test-public-key';
process.env.DATA_FILE=join(mkdtempSync(join(tmpdir(),'poker-tests-')),'rooms.json');
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let authFailure=0;
let deleteResponse=null;
let identityLookups=0;
globalThis.fetch=async (url,options)=>{
 if(options.method==='DELETE') return deleteResponse ? await deleteResponse : {ok:true};
 identityLookups++;
 if(authFailure) return {ok:false,status:authFailure};
 const id=options.headers.Authorization.replace('Bearer ','');
 return {status:401,ok:['alice','bob','carol','david','eva','frank','grace'].includes(id),json:async()=>({id,user_metadata:{display_name:id}})};
};
const api=await import('../src.js');
const {server,advanceTables}=api;
async function request(method,path,id,body,headers={}) {
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
 req.url=path;req.method=method;req.headers={authorization:id?'Bearer '+id:'',...headers};req.socket={remoteAddress:'test'};
 return await new Promise(resolve=>{
  const res={writeHead(status){this.status=status},end(data){resolve({status:this.status,data:JSON.parse(data)})}};
  server.emit('request',req,res);
 });
}
test('authenticated API: create, join, privacy, authorization, stale actions and reconnect',async()=>{
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
 authFailure=503;
 try {assert.equal((await request('GET','/me','outage-a')).status,503);}
 finally {authFailure=0;}
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
test('forwarded client addresses are only trusted when configured',async()=>{
 process.env.TRUST_PROXY='1';
 try {
  for(let i=0;i<600;i++) await request('GET','/me','unknown-token',undefined,{'x-forwarded-for':'10.0.0.9'});
  // Prepending a made-up address does not escape the limit; the proxy-appended address counts.
  assert.equal((await request('GET','/me','carol',undefined,{'x-forwarded-for':'2.2.2.2, 10.0.0.9'})).status,429);
  assert.equal((await request('GET','/me','carol',undefined,{'x-forwarded-for':'10.0.0.9, 3.3.3.3'})).status,200);
 } finally {delete process.env.TRUST_PROXY;}
 assert.equal((await request('GET','/me','carol',undefined,{'x-forwarded-for':'10.0.0.9'})).status,200);
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
 process.env.SUPABASE_SERVICE_ROLE_KEY='test-server-only-key';
 let resolveDelete;deleteResponse=new Promise(resolve=>{resolveDelete=resolve;});
 const pending=request('POST','/account/delete','david',{});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal((await request('POST','/rooms/'+code+'/start','eva',{})).data.error,'table_busy');
 // A failed mutation on another table restores a cloned map while deletion awaits its provider.
 const other=(await request('GET','/me','alice')).data.room;
 assert.equal((await request('POST','/rooms/'+other.code+'/action','alice',{action:'check',version:-1})).status,400);
 resolveDelete({ok:true});assert.equal((await pending).status,200);
 deleteResponse=null;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 const survivor=(await request('GET','/me','eva')).data.room;
 assert.equal(survivor.host,'eva');assert.equal(survivor.players.length,1);
 assert.equal(survivor.players[0].id,'eva');assert.deepEqual(survivor.log,[]);
 assert.equal((await request('GET','/me','david')).data.room,null);
});

test('real HTTP transport enforces authentication and serializes private snapshots',async t=>{
 try {
  await new Promise((resolve,reject)=>{
   const failed=error=>reject(error);
   server.once('error',failed);
   server.listen(0,'127.0.0.1',()=>{server.off('error',failed);resolve();});
  });
 } catch(error) {
  if(error.code==='EPERM' || error.code==='EACCES') {t.skip('Local sockets are not available');return;}
  throw error;
 }
 const get=(path,token)=>new Promise((resolve,reject)=>{
  const req=http.get({hostname:'127.0.0.1',port:server.address().port,path,headers:token?{Authorization:'Bearer '+token}:{}},response=>{
   let data='';response.on('data',chunk=>{data+=chunk});response.on('end',()=>resolve({status:response.statusCode,data:JSON.parse(data)}));
  });req.on('error',reject);
 });
 try {
  assert.equal((await get('/health')).data.status,'ok');
  assert.equal((await get('/me')).status,401);
  const response=await get('/me','alice');assert.equal(response.status,200);
  assert.equal(response.data.room.players[1].cards.length,0);
 } finally {await new Promise(resolve=>server.close(resolve));}
});

test('a failing table rolls back alone and does not stop the other tables',async()=>{
 const healthy=await request('POST','/rooms','frank',{practice:true});
 const broken=await request('POST','/rooms','grace',{practice:true});
 await request('POST','/rooms/'+healthy.data.code+'/start','frank',{});
 await request('POST','/rooms/'+broken.data.code+'/start','grace',{});
 const healthyBefore=(await request('GET','/rooms/'+healthy.data.code,'frank')).data;
 const brokenBefore=(await request('GET','/rooms/'+broken.data.code,'grace')).data;
 const originalError=console.error;console.error=()=>{};
 try {
  // A bot without cards makes its strategy throw; the healthy table must still advance.
  api.rooms.get(broken.data.code).players.forEach(p=>{if(p.bot) p.cards=[];});
  advanceTables(Date.now()+60000);
 } finally {console.error=originalError;}
 assert.ok((await request('GET','/rooms/'+healthy.data.code,'frank')).data.version>healthyBefore.version);
 assert.equal((await request('GET','/rooms/'+broken.data.code,'grace')).data.version,brokenBefore.version);
});
