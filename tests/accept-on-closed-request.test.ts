/**
 * PERMANENT REGRESSION — BUS-ACCEPT-CLOSED-REQUEST-001 (adversarial-loop probe cycle 2026-11-04-0652; fixed 2026-11-04)
 * Scenario: quote ACCEPTANCE on a closed transport request.
 * POST /api/quotes/accept checks request status === 'booked' only; it never
 * refuses cancelled/completed requests. Cousin of BUS-QUOTE-CLOSED-REQUEST-001
 * (submission side) and BUS-ACCEPT-BINDING-001 (binding side).
 *
 * Invariant: a quote may be accepted only on an open request; a cancelled or
 * completed request cannot be resurrected to booked and creates no booking.
 * Harness: in-memory fake supabaseAdmin (repo pattern), session auth user-1.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { transport_requests: [], quotes: [], bookings: [], notifications: [] };
  let seq = 0;
  class QB {
    table: string; op = 'select'; filters: Array<[string,string,any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push(['eq',k,v]); return this; }
    neq(k: string, v: any) { this.filters.push(['neq',k,v]); return this; }
    update(p: any) { this.op='update'; this.payload=p; return this; }
    insert(p: any) { this.op='insert'; this.payload=p; return this; }
    match(r: Row) { return this.filters.every(([t,k,v]) => t==='eq' ? r[k]===v : r[k]!==v); }
    exec() {
      const rows = store[this.table];
      if (this.op==='insert') { const items = Array.isArray(this.payload)?this.payload:[this.payload]; return items.map((it:any)=>{ const row={id:`row-${++seq}`,...it}; rows.push(row); return row; }); }
      const matched = rows.filter((r)=>this.match(r));
      if (this.op==='update') { matched.forEach((r)=>Object.assign(r,this.payload)); return matched; }
      return matched;
    }
    async single() { const r=this.exec(); return r.length?{data:r[0],error:null}:{data:null,error:{message:'not found'}}; }
    async maybeSingle() { const r=this.exec(); return {data:r.length?r[0]:null,error:null}; }
    then(res:any,rej:any){ try{ res({data:this.exec(),error:null}); }catch(e){ rej(e);} }
  }
  return { store, QB };
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (t: string) => new h.QB(t) } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }) }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async()=>({id:'m'})), emailTemplates: { bookingConfirmation: () => ({subject:'s',html:'h'}) }, getAppBaseUrl: () => 'http://localhost' }));
vi.mock('@/lib/sms', () => ({ sendSMS: vi.fn(async()=>({})), smsTemplates: { quoteAccepted: () => ({body:'x'}) } }));
vi.mock('@/lib/event-logger', () => ({ logEvent: vi.fn(async()=>{}) }));
vi.mock('@/lib/app-settings', () => ({ getDispatchMode: vi.fn(async()=>false) }));

import { POST } from '@/app/api/quotes/accept/route';

const OP = { id: 'op-A', company_name: 'Op A', company_email: 'a@example.com', company_phone: '555', profile: null };
function seed() {
  h.store.transport_requests = [
    { id: 'req-open', status: 'quoted', user_id: 'user-1', metadata_private: {}, userProfile: null },
    { id: 'req-cancelled', status: 'cancelled', user_id: 'user-1', metadata_private: {}, userProfile: null },
    { id: 'req-completed', status: 'completed', user_id: 'user-1', metadata_private: {}, userProfile: null },
  ];
  h.store.quotes = [
    { id: 'q-open', request_id: 'req-open', operator_id: 'op-A', status: 'pending', total_price: 100, expires_at: null, operator: OP },
    { id: 'q-cancelled', request_id: 'req-cancelled', operator_id: 'op-A', status: 'pending', total_price: 100, expires_at: null, operator: OP },
    { id: 'q-completed', request_id: 'req-completed', operator_id: 'op-A', status: 'pending', total_price: 100, expires_at: null, operator: OP },
  ];
  h.store.bookings = []; h.store.notifications = [];
}
function accept(quoteId: string, tripRequestId: string) {
  const req = new NextRequest('http://localhost/api/quotes/accept', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ quoteId, tripRequestId }) });
  return POST(req);
}
describe('quote acceptance on closed request probe', () => {
  beforeEach(seed);
  it('control: accept pending quote on OPEN (quoted) request -> 200, one booking', async () => {
    const res = await accept('q-open','req-open');
    expect(res.status).toBe(200);
    expect(h.store.bookings).toHaveLength(1);
    expect(h.store.transport_requests.find(r=>r.id==='req-open')!.status).toBe('booked');
  });
  it('attack 1: accept on CANCELLED request -> refused, no booking, request stays cancelled, quote stays pending', async () => {
    const res = await accept('q-cancelled','req-cancelled');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.store.bookings).toHaveLength(0);
    expect(h.store.transport_requests.find(r=>r.id==='req-cancelled')!.status).toBe('cancelled');
    expect(h.store.quotes.find(q=>q.id==='q-cancelled')!.status).toBe('pending');
  });
  it('attack 2: accept on COMPLETED request -> refused, no booking, request stays completed, quote stays pending', async () => {
    const res = await accept('q-completed','req-completed');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.store.bookings).toHaveLength(0);
    expect(h.store.transport_requests.find(r=>r.id==='req-completed')!.status).toBe('completed');
    expect(h.store.quotes.find(q=>q.id==='q-completed')!.status).toBe('pending');
  });
});
