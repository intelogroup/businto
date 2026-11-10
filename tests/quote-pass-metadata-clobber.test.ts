/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-08-0652; Phase 1 write core (src/lib/transitions.ts) — Businto
 * POST /api/quotes/pass: reads status+metadata_private, checks isOpenRequestStatus,
 * then UPDATEs metadata_private by id ONLY with a spread of the stale snapshot.
 * Interleavings inside read->write window:
 *  A) quote acceptance books the request — pass still flags booked request
 *  B) concurrent writer adds metadata_private key — stale spread clobbers it
 * Invariant: pass effects apply only to rows still open at write time, and
 * read-modify-write must not lose a concurrent metadata update.
 * Harness: mocked Supabase, snapshot selects, update by id exactly as real predicates.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
const h = vi.hoisted(() => {
  const store: any = { transport_requests: [] as any[] };
  let interleave: any = null;
  class QB {
    table: string; op="select"; filters:any[]=[]; payload:any=null;
    constructor(t:string){this.table=t;}
    select(){return this;}
    eq(k:string,v:any){this.filters.push([k,v]);return this;}
    update(p:any){this.op="update";this.payload=p;return this;}
    exec(){
      const rows=store[this.table];
      const matched=rows.filter((r:any)=>this.filters.every(([k,v]:any)=>r[k]===v));
      if(this.op==="update"){ for(const r of matched){ if(interleave){interleave(r); interleave=null;} Object.assign(r,this.payload);} return matched; }
      return matched.map((r:any)=>({...r, metadata_private:{...r.metadata_private}}));
    }
    async single(){ const r=this.exec(); return r.length?{data:r[0],error:null}:{data:null,error:{message:"not found"}}; }
    then(res:any,rej:any){ try{res({data:this.exec(),error:null});}catch(e){rej(e);} }
  }
  return {store,QB,setInterleave:(f:any)=>{interleave=f;}};
});
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: (t:string)=>new h.QB(t) } }));
vi.mock("@/lib/tokens", () => ({ verifyOperatorViewToken: vi.fn(async (token:string)=>{ if(!token.startsWith("tok-")) return null; return {requestId: token.slice(4), operatorId:"op-1"}; }) }));
vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn(async()=>{}) }));
import { POST } from "@/app/api/quotes/pass/route";
function seed(status="pending"){ h.store.transport_requests=[{id:"req-1",status,metadata_private:{origin:"seed"}}]; h.setInterleave(null); }
function call(){ const req=new NextRequest("http://localhost/api/quotes/pass",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({requestId:"req-1",token:"tok-req-1"})}); return POST(req); }
const row=()=>h.store.transport_requests[0];
describe("quotes/pass stale read-modify-write",()=>{
  beforeEach(()=>seed());
  it("control: live pending request is flagged, seed metadata preserved", async()=>{
    const res=await call(); expect(res.status).toBe(200); expect(row().metadata_private.requires_manual_allocation).toBe(true); expect(row().metadata_private.origin).toBe("seed");
  });
  it("sequential control: already-booked request is refused at read, not flagged", async()=>{
    seed("booked"); const res=await call(); expect(res.status).toBe(409); expect(row().metadata_private.requires_manual_allocation).toBeUndefined();
  });
  it("attack A: booking landing inside read->write window must not be flagged", async()=>{
    h.setInterleave((r:any)=>{r.status="booked";}); await call(); expect(row().status).toBe("booked"); expect(row().metadata_private.requires_manual_allocation).toBeUndefined();
  });
  it("attack B: concurrent metadata_private update inside window must not be clobbered", async()=>{
    h.setInterleave((r:any)=>{r.metadata_private={...r.metadata_private,priority_paid:true};}); await call(); expect(row().metadata_private.priority_paid).toBe(true);
  });
});
