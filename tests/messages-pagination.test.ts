/**
 * PERMANENT REGRESSION — BUS-MESSAGES-PAGINATION-001 (converted from the loop probe of cycle 2026-11-14-1252; assertions unchanged)
 * GET /api/messages returns every message where the caller is sender
 * or recipient in one unbounded response: it never calls
 * .range()/.limit() and never reads page/limit. Its sibling
 * GET /api/messages/threads was paginated in the fix wave
 * (BUS-THREADS-PAGINATION-001, verified fixed: shared parsePagination,
 * default 20 / max 50, grouping over the full set, page sliced from
 * the finished list) — this plain list surface was not in that family,
 * exactly the unbounded-list shape the systemic review flagged for
 * messages and requests.
 * Invariant: a list response is bounded to at most 50 entries per
 * page, whatever the underlying volume; small volumes return exactly;
 * an explicit ?limit=5 is honored.
 * Harness: in-memory mocked Supabase honoring range/limit if called,
 * faithful eq/or scoping (sender_id.eq.<user> OR recipient_id.eq.<user>).
 * Synthetic users/messages only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { messages: [], unified_profiles: [] };
  const state = { user: { id: 'user-1' } as any };
  class QB {
    table: string; filters: Array<(r: any) => boolean> = []; lo = 0; hi: number | null = null; lim: number | null = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    order() { return this; }
    eq(k: string, v: any) { this.filters.push((r) => r[k] === v); return this; }
    in(k: string, vs: any[]) { this.filters.push((r) => vs.includes(r[k])); return this; }
    or(expr: string) {
      const clauses = expr.split(',').map((c) => {
        const m = c.match(/^([^.]+)\.eq\.([\s\S]*)$/);
        return (r: any) => (m ? String(r[m[1]] ?? '') === m[2] : false);
      });
      this.filters.push((r) => clauses.some((f) => f(r)));
      return this;
    }
    range(a: number, b: number) { this.lo = a; this.hi = b; return this; }
    limit(n: number) { this.lim = n; return this; }
    exec() {
      let rows = [...(store[this.table] || [])];
      for (const f of this.filters) rows = rows.filter(f);
      if (this.hi !== null) rows = rows.slice(this.lo, this.hi + 1);
      if (this.lim !== null) rows = rows.slice(0, this.lim);
      return rows;
    }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB, state };
});
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireUser: async () => h.state.user,
}));
vi.mock('@/lib/sms', () => ({ sendSMS: async () => ({ success: true }), smsTemplates: { newMessage: () => ({ content: 'test' }) } }));
vi.mock('@/lib/policy', () => ({ validateRequestParticipation: async () => null }));
import { GET } from '@/app/api/messages/route';
function seed(n: number) {
  h.state.user = { id: 'user-1' };
  h.store.messages = Array.from({ length: n }, (_, i) => ({
    id: `msg-${i + 1}`, request_id: 'req-1', booking_id: null,
    sender_id: i % 2 === 0 ? 'user-1' : 'user-2',
    recipient_id: i % 2 === 0 ? 'user-2' : 'user-1',
    content: `hello ${i + 1}`, is_read: false,
    created_at: `2026-11-01T00:${String(i % 60).padStart(2, '0')}:00Z`,
  }));
  h.store.unified_profiles = [
    { id: 'user-1', full_name: 'Rider One', avatar_url: null, role: 'rider' },
    { id: 'user-2', full_name: 'Operator Two', avatar_url: null, role: 'operator' },
  ];
}
const req = (qs = '') => new NextRequest(`http://localhost/api/messages${qs}`);
describe('messages list must be bounded like sibling lists', () => {
  beforeEach(() => seed(0));
  it('control: unauthenticated is refused 401', async () => {
    h.state.user = null;
    const r = await GET(req()); expect(r.status).toBe(401);
  });
  it('control: small volume (2 messages) returns exactly 2', async () => {
    seed(2); const r = await GET(req('?request_id=req-1')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.messages).toHaveLength(2);
  });
  it('attack: 60 messages return at most 50 in one response', async () => {
    seed(60); const r = await GET(req('?request_id=req-1')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.messages.length).toBeLessThanOrEqual(50);
  });
  it('attack: explicit ?limit=5&page=1 is honored (at most 5 messages)', async () => {
    seed(60); const r = await GET(req('?request_id=req-1&limit=5&page=1')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.messages.length).toBeLessThanOrEqual(5);
  });
});
