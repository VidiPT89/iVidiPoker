import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../edge.js';

const users=['alice','bob','carol','david','eva','frank','grace','henry'];
let authFailure=0;
let deleteResponse=null;
let identityLookups=0;
let beforeSave=null;
// In-memory stand-in for the PostgREST rooms table; values are copied as Postgres stores them.
const table=new Map();
const reply=(status,value)=>({status,ok:status<300,json:async()=>structuredClone(value)});
function rooms(url,options) {
  const query=new URL(url).searchParams;
  const matches=row=>{
    const or=query.get('or');
    if(or) return or.slice(1,-1).split(',').some(f=>f.startsWith('players.cs.') ? row.players.includes(JSON.parse(f.slice(11).replace('{','[').replace('}',']'))[0]) : row.code===f.slice(8));
    if(query.get('code') && row.code!==query.get('code').slice(3)) return false;
    if(query.get('rev') && row.rev!==Number(query.get('rev').slice(3))) return false;
    if(query.get('updated_at') && !(row.updated_at<query.get('updated_at').slice(3))) return false;
    return true;
  };
  if(!options.method) return reply(200,[...table.values()].filter(matches));
  if(options.method==='POST') {
    const row=JSON.parse(options.body);
    if(table.has(row.code)) return reply(409,{});
    table.set(row.code,row); return reply(201,[row]);
  }
  beforeSave?.();
  const found=[...table.values()].filter(matches);
  for(const row of found) {
    if(options.method==='DELETE') table.delete(row.code);
    else table.set(row.code,{...row,...JSON.parse(options.body)});
  }
  return reply(200,found);
}
const fetch=async (url,options)=>{
  if(url.includes('/rest/v1/rooms')) return rooms(url,options);
  if(options.method==='DELETE') return deleteResponse ? await deleteResponse : {ok:true};
  identityLookups++;
  if(authFailure) return {ok:false,status:authFailure};
  const id=options.headers.Authorization.replace('Bearer ','');
  return {status:401,ok:users.includes(id),json:async()=>({id,user_metadata:{display_name:id}})};
};
const options={url:'https://auth.test.invalid',anonKey:'test-public-key',fetch};
let handler=createHandler(options);
async function request(method,path,id,body,ip='test') {
  const headers={'CF-Connecting-IP':ip};
  if(id) headers.Authorization='Bearer '+id;
  const response=await handler(new Request('https://poker.test/functions/v1/poker'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}));
  return {status:response.status,data:await response.json()};
}
const stored=code=>table.get(code).data;

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
test('the player session can travel beside the gateway key',async()=>{
  const response=await handler(new Request('https://poker.test/functions/v1/poker/me',{headers:{Authorization:'Bearer test-public-key','X-Player-Authorization':'Bearer carol'}}));
  assert.equal(response.status,200);
  assert.equal((await request('GET','/me','test-public-key')).status,401);
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
test('a save that loses a race runs again on the newer table',async()=>{
  const code=(await request('POST','/rooms','david',{})).data.code;
  // Eva joins while David's request is in flight: David's save is refused and retried.
  beforeSave=()=>{beforeSave=null;const row=table.get(code);row.rev++;row.data.players.push({...row.data.players[0],id:'eva',name:'eva'});row.players.push('eva');};
  const rejoin=await request('POST','/rooms/'+code+'/join','henry',{});
  assert.equal(rejoin.status,200);
  assert.deepEqual(stored(code).players.map(p=>p.id),['david','eva','henry']);
});
test('account deletion removes the player and hands the table to the next host',async()=>{
  handler=createHandler({...options,serviceKey:'test-server-only-key'});
  const code=(await request('GET','/me','david')).data.room.code;
  deleteResponse=Promise.resolve({ok:true});
  assert.equal((await request('POST','/account/delete','david',{})).status,200);
  deleteResponse=null;handler=createHandler(options);
  const survivor=(await request('GET','/me','eva')).data.room;
  assert.equal(survivor.code,code);assert.equal(survivor.host,'eva');
  assert.deepEqual(survivor.players.map(p=>p.id),['eva','henry']);
});
test('bots act when the table is polled, and a failing table rolls back alone',async()=>{
  const healthy=(await request('POST','/rooms','frank',{practice:true})).data.code;
  const broken=(await request('POST','/rooms','grace',{practice:true})).data.code;
  const before={};
  for(const [code,id] of [[healthy,'frank'],[broken,'grace']]) before[code]=(await request('POST','/rooms/'+code+'/start',id,{})).data.version;
  // A bot without cards makes its strategy throw.
  stored(broken).players.forEach(p=>{if(p.bot) p.cards=[];});
  for(const code of [healthy,broken]) stored(code).deadline=Date.now()-1;
  const originalError=console.error;console.error=()=>{};
  try {
    assert.ok((await request('GET','/rooms/'+healthy,'frank')).data.version>before[healthy]);
    const stuck=await request('GET','/rooms/'+broken,'grace');
    assert.equal(stuck.status,200);assert.equal(stuck.data.version,before[broken]);
  } finally {console.error=originalError;}
});
test('tables are removed from storage when the last player leaves',async()=>{
  const code=(await request('POST','/rooms','carol',{})).data.code;
  assert.ok(table.has(code));
  assert.equal((await request('POST','/rooms/'+code+'/leave','carol',{})).status,200);
  assert.equal(table.has(code),false);
});
