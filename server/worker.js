import { TableService } from './service.js';

const headers={'Content-Type':'application/json','Cache-Control':'no-store'};

// One Durable Object holds every table: a single, consistent game server that keeps each table in its own storage key.
export class Tables {
  constructor(state,env) {
    this.storage=state.storage;
    state.blockConcurrencyWhile(async()=>{
      const saved=await this.storage.list({prefix:'room:'});
      this.service=new TableService([...saved.values()],{authURL:env.SUPABASE_URL,publicKey:env.SUPABASE_ANON_KEY,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY});
    });
  }
  async fetch(request) {
    const url=new URL(request.url);
    const result=await this.service.handle({method:request.method,path:url.pathname,
      authorization:request.headers.get('Authorization')||'',ip:request.headers.get('CF-Connecting-IP')||'unknown',
      text:request.method==='POST' ? await request.text() : ''});
    await this.save();
    return new Response(JSON.stringify(result.data),{status:result.status,headers});
  }
  // Tables are saved before the response is sent.
  async save() {
    const codes=this.service.takeChanges();
    const kept=codes.filter(code=>this.service.rooms.has(code));
    const gone=codes.filter(code=>!this.service.rooms.has(code)).map(code=>'room:'+code);
    for(let i=0;i<kept.length;i+=128) await this.storage.put(Object.fromEntries(kept.slice(i,i+128).map(code=>['room:'+code,this.service.rooms.get(code)])));
    for(let i=0;i<gone.length;i+=128) await this.storage.delete(gone.slice(i,i+128));
  }
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(request.method==='GET' && url.pathname==='/health') return new Response(JSON.stringify({status:'ok'}),{headers});
    return env.TABLES.get(env.TABLES.idFromName('tables')).fetch(request);
  }
};
