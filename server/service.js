import { room, player, join, start, act, snapshot, tick, due, GameError } from './poker.js';

const betweenHands = r => r.phase==='waiting' || r.phase==='showdown';
// Replaces a table's contents in place, so references held elsewhere stay valid after a rollback.
function restore(r,before) { for(const key of Object.keys(r)) delete r[key]; Object.assign(r,before); }
function parse(text) {
  if(text.length>8192) throw new GameError('request_too_large');
  try {
    const value=text ? JSON.parse(text) : {};
    if(value===null || typeof value!=='object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new GameError('invalid_json'); }
}
function remove(service,r,id) {
  r.players=r.players.filter(p=>p.id!==id);
  if(!r.players.some(p=>!p.bot)) service.rooms.delete(r.code);
  else {if(r.host===id) r.host=r.players.find(p=>!p.bot).id; r.phase='waiting'; r.board=[]; r.winners=[]; r.refunds=[]; r.showdownRevealed=false; r.log=[]; r.actor=-1; r.players.forEach(p=>{p.cards=[];p.bet=0;p.total=0;});r.version++;}
}

// Works on the tables it is given; the host decides how tables are loaded and saved.
export class TableService {
  // cache keeps request limits and verified tokens between instances, so the host can build one service per request.
  constructor(saved,{authURL,publicKey,serviceKey,fetch=globalThis.fetch,cache={limits:new Map(),identities:new Map(),swept:0}}) {
    if(!authURL || !publicKey) throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY');
    if(!authURL.startsWith('https://')) throw new Error('SUPABASE_URL must use HTTPS');
    Object.assign(this,{authURL,publicKey,serviceKey,fetch});
    this.rooms=new Map(saved.map(r=>[r.code,r]));
    this.changed=new Set();
    this.cache=cache;
    this.limits=cache.limits;
    // Clients poll every 1.5 seconds; verified tokens are reused briefly instead of asking Supabase each time.
    this.identities=cache.identities;
    this.deletingUsers=new Set();
    this.deletingRooms=new Set();
  }
  // Codes of tables to save, or to delete when they no longer exist, since the last call.
  takeChanges() { const codes=[...this.changed]; this.changed.clear(); return codes; }
  current(id) { return [...this.rooms.values()].find(r=>r.players.some(p=>p.id===id)); }
  limit(key,max,now) {
    let value=this.limits.get(key);
    if(!value || value.reset<now) { value={count:0,reset:now+60000}; this.limits.set(key,value); }
    if(++value.count>max) throw new GameError('too_many_requests');
  }
  async identity(bearer,now) {
    if(!bearer.startsWith('Bearer ') || bearer.length>8192) return null;
    const cached=this.identities.get(bearer);
    if(cached && cached.expires>now) return cached.user;
    const response=await this.fetch(this.authURL+'/auth/v1/user',{headers:{apikey:this.publicKey,Authorization:bearer},signal:AbortSignal.timeout(8000)});
    if(!response.ok) {
      if(response.status===401 || response.status===403) return null;
      throw new Error('Identity service unavailable');
    }
    const u=await response.json();
    if(!u.id) return null;
    const user={id:u.id,name:u.user_metadata?.display_name||u.user_metadata?.full_name||u.user_metadata?.name||'Player'};
    if(this.identities.size>=5000) this.identities.clear();
    this.identities.set(bearer,{user,expires:now+30000});
    return user;
  }
  forget(id) { for(const [token,entry] of this.identities) if(entry.user.id===id) this.identities.delete(token); }
  mutate(r,fn) {
    const before=structuredClone(r);
    try { const result=fn(); this.changed.add(r.code); return result; }
    catch(e) { restore(r,before); throw e; }
  }
  // Bots and expired turns advance whenever someone looks at the table, so no timer runs while tables are idle.
  advance(r,now) {
    if(!r || this.deletingRooms.has(r.code) || !due(r,now)) return;
    try { this.mutate(r,()=>tick(r,now)); }
    catch(e) { console.error('Could not advance table:',e.name); }
  }
  sweep(now) {
    for(const [code,r] of this.rooms) if(now-r.updated>86400000 && betweenHands(r) && !this.deletingRooms.has(code)) { this.rooms.delete(code); this.changed.add(code); }
    if(now-this.cache.swept<60000) return;
    this.cache.swept=now;
    for(const [key,value] of this.limits) if(value.reset<now) this.limits.delete(key);
    for(const [key,value] of this.identities) if(value.expires<now) this.identities.delete(key);
  }
  // request: {method, path, authorization, ip, text}. Resolves to {status, data}.
  async handle(request,now=Date.now()) {
    try { return await this.route(request,now); }
    catch(e) {
      if(e instanceof GameError) return {status:e.message==='too_many_requests'?429:400,data:{error:e.message}};
      console.error('Request failed:',e.name); return {status:503,data:{error:'service_unavailable'}};
    }
  }
  async route({method,path,authorization='',ip='unknown',text=''},now) {
    if(method==='GET' && path==='/health') return {status:200,data:{status:'ok'}};
    this.sweep(now);
    this.limit(ip,600,now);
    const user=await this.identity(authorization,now);
    if(!user) return {status:401,data:{error:'authentication_required'}};
    this.limit(user.id,180,now);
    if(this.deletingUsers.has(user.id)) throw new GameError('account_busy');
    const data=method==='POST' ? parse(text) : {};
    if(method==='GET' && path==='/me') {
      this.advance(this.current(user.id),now);
      const r=this.current(user.id); return {status:200,data:{room:r?snapshot(r,user.id):null}};
    }
    if(method==='POST' && path==='/account/delete') return await this.deleteAccount(user);
    if(method==='POST' && path==='/rooms') {
      if(this.current(user.id)) throw new GameError('already_at_table');
      let r; do { r=room(user.id,user.name,data.practice===true); } while(this.rooms.has(r.code));
      if(r.practice) ['Aurora','Duarte','Leonor'].forEach((name,i)=>r.players.push(player('bot-'+i,name,true)));
      this.rooms.set(r.code,r); this.changed.add(r.code);
      return {status:201,data:snapshot(r,user.id)};
    }
    const match=path.match(/^\/rooms\/([A-F0-9]{8})(?:\/(join|start|action|leave|rebuy))?$/);
    if(!match) return {status:404,data:{error:'not_found'}};
    const r=this.rooms.get(match[1]); if(!r) return {status:404,data:{error:'table_not_found'}};
    if(this.deletingRooms.has(r.code)) throw new GameError('table_busy');
    this.advance(r,now);
    if(method==='GET' && !match[2]) return {status:200,data:snapshot(r,user.id)};
    if(method!=='POST') return {status:405,data:{error:'method_not_allowed'}};
    if(match[2]==='join') {
      const existing=this.current(user.id);
      if(existing && existing.code!==r.code) throw new GameError('already_at_table');
      if(r.practice && r.host!==user.id) throw new GameError('private_practice');
    } else snapshot(r,user.id);
    const result=this.mutate(r,()=>{
      if(match[2]==='join') join(r,user.id,user.name);
      else if(match[2]==='start') start(r,user.id);
      else if(match[2]==='action') act(r,user.id,data.action,data.amount,data.version);
      else if(match[2]==='leave') {
        if(!betweenHands(r)) throw new GameError('finish_hand_first');
        remove(this,r,user.id); return {ok:true};
      } else {
        if(!betweenHands(r)) throw new GameError('finish_hand_first');
        const p=r.players.find(p=>p.id===user.id);
        if(p.stack!==0) throw new GameError('chips_remaining');
        p.stack=2000; r.version++;
      }
      r.updated=now; return snapshot(r,user.id);
    });
    return {status:200,data:result};
  }
  async deleteAccount(user) {
    if(!this.serviceKey) return {status:503,data:{error:'deletion_unavailable'}};
    const r=this.current(user.id);
    if(r && !betweenHands(r)) throw new GameError('finish_hand_first');
    this.deletingUsers.add(user.id); if(r) this.deletingRooms.add(r.code);
    try {
      const response=await this.fetch(this.authURL+'/auth/v1/admin/users/'+encodeURIComponent(user.id),{method:'DELETE',
        headers:{apikey:this.serviceKey,Authorization:'Bearer '+this.serviceKey},signal:AbortSignal.timeout(10000)});
      if(!response.ok) return {status:502,data:{error:'deletion_failed'}};
      this.forget(user.id);
      const latest=this.current(user.id); if(latest) this.mutate(latest,()=>remove(this,latest,user.id));
      return {status:200,data:{ok:true}};
    } finally {this.deletingUsers.delete(user.id);if(r) this.deletingRooms.delete(r.code);}
  }
}
