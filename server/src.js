import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { room, player, join, start, act, snapshot, tick, due, GameError } from './poker.js';

const port=Number(process.env.PORT||8080);
const authURL=process.env.SUPABASE_URL;
const publicKey=process.env.SUPABASE_ANON_KEY;
if(!authURL || !publicKey) throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY in server/.env');
if(!authURL.startsWith('https://')) throw new Error('SUPABASE_URL must use HTTPS');
const path=resolve(process.env.DATA_FILE||'data/rooms.json');
mkdirSync(dirname(path),{recursive:true});
export let rooms=new Map();
try { rooms=new Map(JSON.parse(readFileSync(path,'utf8')).map(r=>[r.code,r])); }
catch(e) { if(e.code!=='ENOENT') throw e; }
const limits=new Map();
// Clients poll every 1.5 seconds; verified tokens are reused briefly instead of asking Supabase each time.
const identities=new Map();
const deletingUsers=new Set();
const deletingRooms=new Set();
function persist() {
  writeFileSync(path+'.tmp',JSON.stringify([...rooms.values()]),{mode:0o600});
  renameSync(path+'.tmp',path);
}
function transaction(fn) {
  const before=structuredClone(rooms);
  try { const result=fn(); persist(); return result; } catch(e) { rooms=before; throw e; }
}
function send(res,status,data) { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
async function body(req) {
  let data='';
  for await(const chunk of req) { data+=chunk; if(data.length>8192) throw new GameError('request_too_large'); }
  try {
    const value=data ? JSON.parse(data) : {};
    if(value===null || typeof value!=='object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new GameError('invalid_json'); }
}
function limit(key,max) {
  const now=Date.now(); let value=limits.get(key);
  if(!value || value.reset<now) { value={count:0,reset:now+60000}; limits.set(key,value); }
  if(++value.count>max) throw new GameError('too_many_requests');
}
async function identity(req) {
  const bearer=req.headers.authorization||'';
  if(!bearer.startsWith('Bearer ') || bearer.length>8192) return null;
  const cached=identities.get(bearer);
  if(cached && cached.expires>Date.now()) return cached.user;
  const response=await fetch(authURL+'/auth/v1/user',{headers:{apikey:publicKey,Authorization:bearer},signal:AbortSignal.timeout(8000)});
  if(!response.ok) {
    if(response.status===401 || response.status===403) return null;
    throw new Error('Identity service unavailable');
  }
  const u=await response.json();
  if(!u.id) return null;
  const user={id:u.id,name:u.user_metadata?.display_name||u.user_metadata?.full_name||'Player'};
  if(identities.size>=5000) identities.clear();
  identities.set(bearer,{user,expires:Date.now()+30000});
  return user;
}
function forget(id) { for(const [token,entry] of identities) if(entry.user.id===id) identities.delete(token); }
// Behind a hosting proxy every request shares the proxy address; TRUST_PROXY=1 uses the address that proxy appended.
function client(req) {
  const forwarded=process.env.TRUST_PROXY==='1' && String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();
  return forwarded || req.socket.remoteAddress;
}
function current(id) { return [...rooms.values()].find(r=>r.players.some(p=>p.id===id)); }
export const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET' && url.pathname==='/health') return send(res,200,{status:'ok'});
    limit(client(req),600);
    const user=await identity(req);
    if(!user) return send(res,401,{error:'authentication_required'});
    limit(user.id,180);
    if(deletingUsers.has(user.id)) throw new GameError('account_busy');
    const data=req.method==='POST' ? await body(req) : {};
    if(req.method==='GET' && url.pathname==='/me') {
      const r=current(user.id); return send(res,200,{room:r?snapshot(r,user.id):null});
    }
    if(req.method==='POST' && url.pathname==='/account/delete') {
      if(!process.env.SUPABASE_SERVICE_ROLE_KEY) return send(res,503,{error:'deletion_unavailable'});
      const r=current(user.id);
      if(r && !['waiting','showdown'].includes(r.phase)) throw new GameError('finish_hand_first');
      deletingUsers.add(user.id); if(r) deletingRooms.add(r.code);
      try {
        const response=await fetch(authURL+'/auth/v1/admin/users/'+encodeURIComponent(user.id),{method:'DELETE',
          headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY},signal:AbortSignal.timeout(10000)});
        if(!response.ok) return send(res,502,{error:'deletion_failed'});
        forget(user.id);
        transaction(()=>{const latest=current(user.id);if(latest) remove(latest,user.id);});
        return send(res,200,{ok:true});
      } finally {deletingUsers.delete(user.id);if(r) deletingRooms.delete(r.code);}
    }
    if(req.method==='POST' && url.pathname==='/rooms') {
      if(current(user.id)) throw new GameError('already_at_table');
      if(rooms.size>=1000) throw new GameError('server_full');
      const result=transaction(()=>{
        let r; do { r=room(user.id,user.name,data.practice===true); } while(rooms.has(r.code));
        if(r.practice) ['Aurora','Duarte','Leonor'].forEach((name,i)=>r.players.push(player('bot-'+i,name,true)));
        rooms.set(r.code,r); return snapshot(r,user.id);
      });
      return send(res,201,result);
    }
    const match=url.pathname.match(/^\/rooms\/([A-F0-9]{8})(?:\/(join|start|action|leave|rebuy))?$/);
    if(!match) return send(res,404,{error:'not_found'});
    const r=rooms.get(match[1]); if(!r) return send(res,404,{error:'table_not_found'});
    if(deletingRooms.has(r.code)) throw new GameError('table_busy');
    if(req.method==='GET' && !match[2]) return send(res,200,snapshot(r,user.id));
    if(req.method!=='POST') return send(res,405,{error:'method_not_allowed'});
    const result=transaction(()=>{
      if(match[2]==='join') {
        const existing=current(user.id);
        if(existing && existing.code!==r.code) throw new GameError('already_at_table');
        if(r.practice && r.host!==user.id) throw new GameError('private_practice');
        join(r,user.id,user.name);
      } else {
        snapshot(r,user.id);
        if(match[2]==='start') start(r,user.id);
        else if(match[2]==='action') act(r,user.id,data.action,data.amount,data.version);
        else if(match[2]==='leave') {
          if(!['waiting','showdown'].includes(r.phase)) throw new GameError('finish_hand_first');
          remove(r,user.id); return {ok:true};
        } else if(match[2]==='rebuy') {
          if(!['waiting','showdown'].includes(r.phase)) throw new GameError('finish_hand_first');
          const p=r.players.find(p=>p.id===user.id);
          if(p.stack!==0) throw new GameError('chips_remaining');
          p.stack=2000; r.version++;
        } else throw new GameError('invalid_action');
      }
      r.updated=Date.now(); return snapshot(r,user.id);
    });
    send(res,200,result);
  } catch(e) {
    if(e instanceof GameError) send(res,e.message==='too_many_requests'?429:400,{error:e.message});
    else { console.error('Request failed:',e.name); send(res,503,{error:'service_unavailable'}); }
  }
});
function remove(r,id) {
  r.players=r.players.filter(p=>p.id!==id);
  if(!r.players.some(p=>!p.bot)) rooms.delete(r.code);
  else {if(r.host===id) r.host=r.players.find(p=>!p.bot).id; r.phase='waiting'; r.board=[]; r.winners=[]; r.refunds=[]; r.showdownRevealed=false; r.log=[]; r.actor=-1; r.players.forEach(p=>{p.cards=[];p.bet=0;p.total=0;});r.version++;}
}
// Each table advances on its own: a failure rolls back only that table, never the others.
export function advanceTables(now=Date.now()) {
  let changed=false;
  for(const [code,r] of rooms) {
    if(deletingRooms.has(code)) continue;
    if(now-r.updated>86400000 && ['waiting','showdown'].includes(r.phase)) {rooms.delete(code);changed=true;continue;}
    if(!due(r,now)) continue;
    const before=structuredClone(r);
    try { changed=tick(r,now)||changed; }
    catch(e) { rooms.set(code,before); console.error('Could not advance table:',e.name); }
  }
  if(changed) {
    try { persist(); } catch(e) { console.error('Could not persist table update:',e.name); }
  }
  for(const [key,value] of limits) if(value.reset<now) limits.delete(key);
  for(const [key,value] of identities) if(value.expires<now) identities.delete(key);
  return changed;
}
setInterval(()=>advanceTables(),1000).unref();
server.requestTimeout=15000;
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) server.listen(port,'0.0.0.0',()=>console.log(`iVidiPoker listening on ${port}`));
