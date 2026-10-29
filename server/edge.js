import { TableService } from './service.js';

const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
class Conflict extends Error {}

// Supabase Edge Function: each request loads the tables it needs from Postgres and saves them only if nobody changed them meanwhile.
export function createHandler({url,anonKey,serviceKey,fetch=globalThis.fetch}) {
  const cache={limits:new Map(),identities:new Map(),swept:0};
  const rest=(query,options={})=>fetch(url+'/rest/v1/rooms'+query,{...options,
    headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json',Prefer:'return=representation',...options.headers},
    signal:AbortSignal.timeout(8000)});
  async function rows(query,options) {
    const response=await rest(query,options);
    if(response.status===409) throw new Conflict();
    if(!response.ok) throw new Error('Table storage unavailable');
    return response.json();
  }
  async function load(service,authorization,path,now) {
    const filters=[];
    const user=await service.identity(authorization,now).catch(()=>null);
    if(user) filters.push(`players.cs.{"${user.id}"}`);
    const code=path.match(/^\/rooms\/([A-F0-9]{8})/)?.[1];
    if(code) filters.push('code.eq.'+code);
    return filters.length ? rows('?select=code,rev,data&or=('+filters.join(',')+')') : [];
  }
  async function save(service,revisions) {
    for(const code of service.takeChanges()) {
      const r=service.rooms.get(code), rev=revisions.get(code);
      const record=r && {data:r,players:r.players.map(p=>p.id),updated_at:new Date(r.updated).toISOString()};
      let saved;
      if(rev===undefined) saved=r ? await rows('',{method:'POST',body:JSON.stringify({code,rev:0,...record})}) : [true];
      else if(r) saved=await rows(`?code=eq.${code}&rev=eq.${rev}`,{method:'PATCH',body:JSON.stringify({rev:rev+1,...record})});
      else saved=await rows(`?code=eq.${code}&rev=eq.${rev}`,{method:'DELETE'});
      if(!saved.length) throw new Conflict();
    }
  }
  async function serve(request) {
    const now=Date.now();
    const path=new URL(request.url).pathname.replace(/^(\/functions\/v1)?\/poker/,'')||'/';
    const authorization=request.headers.get('Authorization')||'';
    const ip=request.headers.get('CF-Connecting-IP')||request.headers.get('X-Forwarded-For')?.split(',').pop().trim()||'unknown';
    const text=request.method==='POST' ? await request.text() : '';
    // Two players acting at once: the later save is refused, so that request runs again on the newer table.
    for(let attempt=0;attempt<4;attempt++) {
      const service=new TableService([],{authURL:url,publicKey:anonKey,serviceKey,fetch,cache});
      try {
        const found=await load(service,authorization,path,now);
        service.rooms=new Map(found.map(row=>[row.code,row.data]));
        const revisions=new Map(found.map(row=>[row.code,row.rev]));
        const result=await service.handle({method:request.method,path,authorization,ip,text},now);
        await save(service,revisions);
        return result;
      } catch(e) {
        if(!(e instanceof Conflict)) { console.error('Request failed:',e.message); return {status:503,data:{error:'service_unavailable'}}; }
      }
    }
    return {status:503,data:{error:'service_unavailable'}};
  }
  return async request=>{
    if(request.method==='GET' && /\/health$/.test(new URL(request.url).pathname)) return new Response(JSON.stringify({status:'ok'}),{headers});
    const result=await serve(request);
    if(Math.random()<0.01) rest('?updated_at=lt.'+new Date(Date.now()-86400000).toISOString()+'&data->>phase=in.(waiting,showdown)',{method:'DELETE'}).catch(()=>{});
    return new Response(JSON.stringify(result.data),{status:result.status,headers});
  };
}

if(globalThis.Deno) Deno.serve(createHandler({url:Deno.env.get('SUPABASE_URL'),anonKey:Deno.env.get('SUPABASE_ANON_KEY'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}));
