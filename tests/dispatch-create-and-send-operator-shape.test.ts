/**
 * PERMANENT REGRESSION — BUS-DISPATCH-ONBOARD-OPERATOR-SHAPE-001 (converted from the loop probe of cycle 2026-11-20-0652; assertions unchanged)
 * POST /api/master/admin/dispatch action=create_and_send: operator
 * company_name / company_email / company_phone are truthiness-guarded
 * only, then flow verbatim into auth-user creation, the profiles upsert,
 * the operators insert, and the dispatch email recipient.
 * Invariant: all three operator fields must be non-empty strings; any
 * non-string shape is refused 400 before any auth user, operator row,
 * or email is created, while genuine strings succeed.
 * Harness: in-memory mocked Supabase; synthetic admin/request/operator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { transport_requests: [], operators: [], profiles: [], unified_profiles: [] };
  const inserts: any[] = [];
  const authUsers: any[] = [];
  const emails: any[] = [];
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; (Array.isArray(p) ? p : [p]).forEach((x) => inserts.push({ table: this.table, ...x })); return this; }
    upsert(p: any) { this.op = 'upsert'; this.payload = p; inserts.push({ table: this.table, ...p }); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    match(r: Row) { return this.filters.every(([k, v]) => r[k] === v); }
    exec() {
      const rows = store[this.table] || (store[this.table] = []);
      if (this.op === 'insert' || this.op === 'upsert') { const ps = Array.isArray(this.payload) ? this.payload : [this.payload]; const made = ps.map((p, i) => ({ id: `op-${rows.length + i + 1}`, ...p })); rows.push(...made); return made; }
      if (this.op === 'update') { const m = rows.filter((r) => this.match(r)); m.forEach((r) => Object.assign(r, this.payload)); return m; }
      return rows.filter((r) => this.match(r));
    }
    async single() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }; }
    async maybeSingle() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, inserts, authUsers, emails, QB };
});
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (t: string) => new h.QB(t),
    auth: { admin: { createUser: async (u: any) => { h.authUsers.push(u); return { data: { user: { id: 'auth-1' } }, error: null }; } } },
  },
  requireAdmin: async () => ({ id: 'admin-1', email: 'admin@example.com' }),
  requireUser: async () => null,
}));
vi.mock('@/lib/email', () => ({
  sendEmail: async (m: any) => { h.emails.push(m); return undefined; },
  emailTemplates: {
    operatorNewRequest: (x: any) => ({ subject: 'n', html: 'n' }),
    adminDispatchedNotification: (x: any) => ({ subject: 'n', html: 'n' }),
  },
  getAppBaseUrl: () => 'http://localhost',
}));
vi.mock('@/lib/email-helpers', () => ({ generateOperatorQuoteLink: async () => 'http://localhost/x' }));
vi.mock('@/lib/operator-matching', () => ({ extractRequirements: () => ({}) }));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => undefined }));
import { POST } from '@/app/api/master/admin/dispatch/route';
function seed() {
  h.inserts.length = 0; h.authUsers.length = 0; h.emails.length = 0;
  h.store.transport_requests = [{ id: 'req-1', status: 'pending', user_id: null, service_type: 'school', pickup_address: 'Everett, MA', dropoff_address: 'Somerville, MA', pickup_fuzzy: 'Everett', dropoff_fuzzy: 'Somerville', start_date: '2026-12-01', start_time: '08:00', metadata_safe: {} }];
  h.store.operators = []; h.store.profiles = []; h.store.unified_profiles = [];
}
function reqFor(operator: any) {
  return new NextRequest('http://localhost/api/master/admin/dispatch', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create_and_send', requestId: 'req-1', operator }),
  });
}
const good = { company_name: 'Synthetic Transport', company_email: 'op@example.com', company_phone: '555-0100' };
describe('admin dispatch create_and_send operator fields must be strings', () => {
  beforeEach(seed);
  it('control: string operator fields succeed, one operator created, email to that address', async () => {
    const res = await POST(reqFor({ ...good }));
    expect(res.status).toBe(200);
    expect(h.authUsers).toHaveLength(1);
    expect(h.store.operators).toHaveLength(1);
    expect(h.store.operators[0].company_email).toBe('op@example.com');
    expect(h.emails.map((m: any) => m.to)).toEqual(['op@example.com']);
  });
  it('attack: numeric company_email is refused 400 with no auth user, operator, or email', async () => {
    const res = await POST(reqFor({ ...good, company_email: 123 }));
    expect(res.status).toBe(400); expect(h.authUsers).toHaveLength(0); expect(h.store.operators).toHaveLength(0); expect(h.emails).toHaveLength(0);
  });
  it('attack: numeric company_name is refused 400 with no auth user, operator, or email', async () => {
    const res = await POST(reqFor({ ...good, company_name: 123 }));
    expect(res.status).toBe(400); expect(h.authUsers).toHaveLength(0); expect(h.store.operators).toHaveLength(0); expect(h.emails).toHaveLength(0);
  });
  it('attack: boolean company_phone is refused 400 with no auth user, operator, or email', async () => {
    const res = await POST(reqFor({ ...good, company_phone: true }));
    expect(res.status).toBe(400); expect(h.authUsers).toHaveLength(0); expect(h.store.operators).toHaveLength(0); expect(h.emails).toHaveLength(0);
  });
  it('attack: array company_email is refused 400 with no auth user, operator, or email', async () => {
    const res = await POST(reqFor({ ...good, company_email: ['op@example.com'] }));
    expect(res.status).toBe(400); expect(h.authUsers).toHaveLength(0); expect(h.store.operators).toHaveLength(0); expect(h.emails).toHaveLength(0);
  });
  it('attack: object company_name is refused 400 with no auth user, operator, or email', async () => {
    const res = await POST(reqFor({ ...good, company_name: { name: 'Synthetic' } }));
    expect(res.status).toBe(400); expect(h.authUsers).toHaveLength(0); expect(h.store.operators).toHaveLength(0); expect(h.emails).toHaveLength(0);
  });
});
