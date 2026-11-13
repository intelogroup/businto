/**
 * PERMANENT REGRESSION — BUS-BOOKINGS-PAGINATION-001 (converted from the loop probe of cycle 2026-11-13-1552; assertions unchanged)
 * GET /api/bookings fetches all of the caller's bookings with no
 * .range()/.limit() and ignores limit/page params, returning every
 * booking (with joined request/quote/user/operator) in one response.
 * Sibling lists paginate default 20 / max 50.
 * Invariant: a list response is bounded to at most 50 entries per page;
 * small volumes return exactly.
 * Harness: in-memory mocked Supabase honoring range/limit if called.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { bookings: [] };
  class QB {
    table: string; lo=0; hi: number|null=null; lim: number|null=null;
    constructor(t:string){this.table=t;}
    select(){return this;} order(){return this;} eq(){return this;}
    range(a:number,b:number){this.lo=a;this.hi=b;return this;}
    limit(n:number){this.lim=n;return this;}
    exec(){ let rows=[...(store[this.table]||[])];
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
import { GET } from '@/app/api/bookings/route';
function seed(n:number){
  h.user={id:'user-1'};
  h.store.bookings=Array.from({length:n},(_,i)=>({ id:`b-${i+1}`, user_id:'user-1', operator_id:'op-1', status:'completed', created_at:'2026-11-01T00:00:00Z' }));
}
const req=(qs='')=>new NextRequest(`http://localhost/api/bookings${qs}`);
describe('bookings list must be bounded like sibling lists',()=>{
  beforeEach(()=>seed(0));
  it('control: unauthenticated is refused 401', async()=>{ h.user=null; const r=await GET(req()); expect(r.status).toBe(401); });
  it('control: small volume (2 bookings) returns exactly 2', async()=>{ seed(2); const r=await GET(req()); expect(r.status).toBe(200); const b=await r.json(); expect(b.bookings).toHaveLength(2); });
  it('attack: 60 bookings return at most 50 in one response', async()=>{ seed(60); const r=await GET(req()); expect(r.status).toBe(200); const b=await r.json(); expect(b.bookings.length).toBeLessThanOrEqual(50); });
  it('attack: explicit ?limit=5 is honored (at most 5)', async()=>{ seed(60); const r=await GET(req('?limit=5&page=1')); expect(r.status).toBe(200); const b=await r.json(); expect(b.bookings.length).toBeLessThanOrEqual(5); });
});
