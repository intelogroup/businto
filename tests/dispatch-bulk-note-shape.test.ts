/**
 * PERMANENT REGRESSION — BUS-DISPATCH-QUOTE-NOTE-SHAPE-001 (bulk leg) (converted from the loop probe of cycle 2026-11-20-1852; assertions unchanged)
 * POST /api/master/admin/dispatch action=create_quotes_bulk maps each
 * quote's note as `q.note || null` into quotes.note with no type check,
 * and also forwards q.note into the consolidated rider email. This
 * executes the bulk leg deferred by cycle 2026-11-20-1252, sibling of
 * BUS-DISPATCH-QUOTE-NOTE-SHAPE-001 (single create_quote branch).
 * Invariant: every bulk quote's note, when present, must be a string;
 * any non-string shape is refused 400 before any insert, while a genuine
 * string succeeds and is stored verbatim, and absent note stores null.
 * Harness: in-memory mocked Supabase; synthetic admin/request/operator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { transport_requests: [], operators: [], quotes: [], unified_profiles: [] };
  const inserts: any[] = [];
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    in(k: string, vs: any[]) { vs.forEach((v) => this.filters.push([k, v])); this.inMode = true; return this; }
    inMode = false;
    insert(p: any) { this.op = 'insert'; this.payload = p; inserts.push(p); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    match(r: Row) {
      if (this.inMode) return this.filters.some(([k, v]) => r[k] === v);
      return this.filters.every(([k, v]) => r[k] === v);
    }
    exec() {
      const rows = store[this.table] || (store[this.table] = []);
      if (this.op === 'insert') {
        const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
        const made = arr.map((p, i) => ({ id: `quote-${i + 1}`, ...p }));
        made.forEach((m) => rows.push(m));
        return made;
      }
      if (this.op === 'update') { const m = rows.filter((r) => this.match(r)); m.forEach((r) => Object.assign(r, this.payload)); return m; }
      return rows.filter((r) => this.match(r));
    }
    async single() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }; }
    async maybeSingle() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, inserts, QB };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireAdmin: async () => ({ id: 'admin-1', email: 'admin@example.com' }),
  requireUser: async () => null,
}));
vi.mock('@/lib/email', () => ({
  sendEmail: async () => undefined,
  emailTemplates: { quotesBulkReceived: (x: any) => ({ subject: 'q', html: 'q' }) },
  getAppBaseUrl: () => 'http://localhost',
}));
vi.mock('@/lib/email-helpers', () => ({ generateOperatorQuoteLink: async () => 'http://localhost/x' }));
vi.mock('@/lib/operator-matching', () => ({ extractRequirements: () => ({}) }));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => undefined }));

import { POST } from '@/app/api/master/admin/dispatch/route';

function seed() {
  h.inserts.length = 0;
  h.store.transport_requests = [{ id: 'req-1', status: 'pending', user_id: null }];
  h.store.operators = [{ id: 'op-1', company_name: 'Synthetic Transport', company_email: 'op@example.com' }];
  h.store.quotes = []; h.store.unified_profiles = [];
}
function reqFor(note: any, include = true) {
  const q: any = { operatorId: 'op-1', price: 150, vehicleType: 'van' };
  if (include) q.note = note;
  return new NextRequest('http://localhost/api/master/admin/dispatch', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create_quotes_bulk', requestId: 'req-1', quotes: [q] }),
  });
}
const insertedNotes = () => h.inserts.flatMap((p: any) => (Array.isArray(p) ? p : [p]).map((q: any) => q.note));

describe('admin dispatch create_quotes_bulk note must be a string when present', () => {
  beforeEach(seed);
  it('control: string note succeeds and is stored verbatim', async () => {
    const res = await POST(reqFor('wheelchair lift available'));
    expect(res.status).toBe(200); expect(insertedNotes()).toEqual(['wheelchair lift available']);
  });
  it('control: absent note succeeds and stores null', async () => {
    const res = await POST(reqFor(undefined, false));
    expect(res.status).toBe(200); expect(insertedNotes()).toEqual([null]);
  });
  it('attack: numeric note is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor(123)); expect(res.status).toBe(400); expect(h.inserts).toHaveLength(0);
  });
  it('attack: boolean note is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor(true)); expect(res.status).toBe(400); expect(h.inserts).toHaveLength(0);
  });
  it('attack: array note is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor(['van'])); expect(res.status).toBe(400); expect(h.inserts).toHaveLength(0);
  });
  it('attack: object note is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor({ text: 'van' })); expect(res.status).toBe(400); expect(h.inserts).toHaveLength(0);
  });
});
