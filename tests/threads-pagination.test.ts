/**
 * PERMANENT REGRESSION — BUS-THREADS-PAGINATION-001 (converted from the loop probe of cycle 2026-11-13-0952; assertions unchanged)
 * GET /api/messages/threads fetches every message where the user is
 * sender or recipient with no .range()/.limit(), groups in memory,
 * and returns every thread in one unbounded response. Sibling list
 * endpoints paginate with default 20 / max 50 (verified-fixed
 * BUS-*-PAGINATION-001 family).
 * Invariant: a list response is bounded to at most 50 entries per
 * page, whatever the underlying volume; small volumes return exactly.
 * Harness: in-memory mocked Supabase honoring range/limit if called.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { messages: [], unified_profiles: [] };
  class QB {
    table: string; lo=0; hi: number|null=null; lim: number|null=null; inIds: any[]|null=null;
    constructor(t:string){this.table=t;}
    select(){return this;} or(){return this;} order(){return this;} eq(){return this;}
    in(_k:string, ids:any[]){this.inIds=ids; return this;}
    range(a:number,b:number){this.lo=a;this.hi=b;return this;}
    limit(n:number){this.lim=n;return this;}
    exec(){ let rows=[...(store[this.table]||[])];
      if(this.table==='unified_profiles'&&this.inIds) rows=rows.filter(r=>this.inIds!.includes(r.id));
      if(this.hi!==null) rows=rows.slice(this.lo,this.hi+1);
      if(this.lim!==null) rows=rows.slice(0,this.lim);
      return rows; }
    then(res:any,rej:any){ try{res({data:this.exec(),error:null});}catch(e){rej(e);} }
  }
  return { store, QB, user: { id:'user-1' } as any };
});
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from:(t:string)=>new h.QB(t) },
  requireUser: async()=>h.user,
}));
import { GET } from '@/app/api/messages/threads/route';
function seedThreads(n:number){
  h.user={id:'user-1'};
  h.store.unified_profiles=[{id:'other-1',full_name:'Other',role:'user'}];
  h.store.messages=Array.from({length:n},(_,i)=>({ id:`m-${i+1}`, sender_id:'user-1', recipient_id:'other-1', request_id:`req-${i+1}`, booking_id:null, content:'hi', created_at:'2026-11-01T00:00:00Z', is_read:true }));
}
const req=(qs='')=>new NextRequest(`http://localhost/api/messages/threads${qs}`);
describe('message threads list must be bounded like sibling lists',()=>{
  beforeEach(()=>seedThreads(0));
  it('control: unauthenticated is refused 401', async()=>{ h.user=null; const r=await GET(req()); expect(r.status).toBe(401); });
  it('control: small volume (2 threads) returns exactly 2', async()=>{ seedThreads(2); const r=await GET(req()); expect(r.status).toBe(200); const b=await r.json(); expect(b.threads).toHaveLength(2); });
  it('attack: 60 distinct threads return at most 50 in one response', async()=>{ seedThreads(60); const r=await GET(req()); expect(r.status).toBe(200); const b=await r.json(); expect(b.threads.length).toBeLessThanOrEqual(50); });
  it('attack: explicit ?limit=5 is honored (at most 5 threads)', async()=>{ seedThreads(60); const r=await GET(req('?limit=5&page=1')); expect(r.status).toBe(200); const b=await r.json(); expect(b.threads.length).toBeLessThanOrEqual(5); });
});
