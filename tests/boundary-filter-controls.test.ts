/**
 * PERMANENT — Lane B route controls (2026-11-14) for the legs the
 * converted loop probes do not cover, against faithful harnesses
 * (Postgres LIKE semantics WITH backslash escapes; PostgREST or()
 * clause splitting):
 * - directory: a plain substring still matches (Ever → Everett),
 *   and a literal % / _ in the term matches only a row that
 *   literally contains it (BUS-DIRECTORY-LOCATION-WILDCARD-001).
 * - earnings: month=2026-13 refused; limit above the ceiling clamps
 *   to 50; malformed page refused (BUS-EARNINGS-MONTH-FILTER-001,
 *   BUS-EARNINGS-PAGINATION-001).
 * - reviews: param-less call returns the first page while
 *   totalReviews/averageRating stay full-set exact
 *   (BUS-REVIEWS-PAGINATION-001).
 * - messages: param-less call returns the first 20 with the full
 *   total; page 3 returns the tail (BUS-MESSAGES-PAGINATION-001).
 * - admin users: grammar characters in search refused 400; a role
 *   outside the vocabulary refused 400; a valid role still filters
 *   (BUS-ADMIN-USERS-SEARCH-INJECTION-001).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  const store: Record<string, any[]> = {
    bookings: [], reviews: [], operators: [], profiles: [], messages: [], unified_profiles: [],
  };
  const state = { user: { id: 'op-user-1' } as any, admin: true };
  // Faithful Postgres LIKE: % any run, _ any single char, \ escapes
  // the next character into a literal.
  function ilikeMatch(value: string, pattern: string): boolean {
    let re = '^';
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i];
      if (ch === '\\' && i + 1 < pattern.length) {
        i++;
        re += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      } else if (ch === '%') re += '.*';
      else if (ch === '_') re += '.';
      else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(re + '$', 'i').test(value);
  }
  function evalOrClause(r: any, clause: string): boolean {
    const m = clause.match(/^([^.]+)\.(ilike|eq)\.([\s\S]*)$/);
    if (!m) return false;
    if (m[2] === 'eq') return String(r[m[1]] ?? '') === m[3];
    return ilikeMatch(String(r[m[1]] ?? ''), m[3]);
  }
  class QB {
    table: string; filters: Array<(r: any) => boolean> = []; lo = 0; hi: number | null = null; lim: number | null = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    order() { return this; }
    eq(k: string, v: any) { this.filters.push((r) => r[k] === v); return this; }
    in(k: string, vs: any[]) { this.filters.push((r) => vs.includes(r[k])); return this; }
    contains(k: string, v: any[]) { this.filters.push((r) => Array.isArray(r[k]) && v.every((x) => r[k].includes(x))); return this; }
    ilike(k: string, p: string) { this.filters.push((r) => ilikeMatch(String(r[k] ?? ''), p)); return this; }
    or(expr: string) { const cs = expr.split(','); this.filters.push((r) => cs.some((c) => evalOrClause(r, c))); return this; }
    range(a: number, b: number) { this.lo = a; this.hi = b; return this; }
    limit(n: number) { this.lim = n; return this; }
    async maybeSingle() {
      if (this.table === 'operator_profiles') return { data: { operator_id: 'op-1' }, error: null };
      return { data: null, error: null };
    }
    exec() {
      let rows = [...(store[this.table] || [])];
      for (const f of this.filters) rows = rows.filter(f);
      const count = rows.length;
      if (this.hi !== null) rows = rows.slice(this.lo, this.hi + 1);
      if (this.lim !== null) rows = rows.slice(0, this.lim);
      return { rows, count };
    }
    then(res: any, rej: any) { try { const { rows, count } = this.exec(); res({ data: rows, error: null, count }); } catch (e) { rej(e); } }
  }
  return { store, state, QB };
});
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireUser: async () => h.state.user,
  requireAdmin: async () => (h.state.admin ? { id: 'admin-1' } : null),
}));
vi.mock('@/lib/sms', () => ({ sendSMS: async () => ({ success: true }), smsTemplates: { newMessage: () => ({ content: 'test' }) } }));
vi.mock('@/lib/policy', () => ({ validateRequestParticipation: async () => null }));

import { GET as directoryGET } from '@/app/api/operators/directory/route';
import { GET as earningsGET } from '@/app/api/operator/earnings/route';
import { GET as reviewsGET } from '@/app/api/reviews/route';
import { GET as messagesGET } from '@/app/api/messages/route';
import { GET as adminUsersGET } from '@/app/api/master/admin/users/route';

function seedOperators() {
  h.store.operators = [
    { id: 'op-ev', company_name: 'Everett Co', specialties: ['school'], service_areas: 'Everett, Malden', service_radius_miles: 25, rating: 5, total_reviews: 3, is_verified: true, is_active: true, is_partner: false },
    { id: 'op-pct', company_name: 'Percent Co', specialties: ['medical'], service_areas: '100% Coverage Zone', service_radius_miles: 25, rating: 4, total_reviews: 2, is_verified: true, is_active: true, is_partner: false },
    { id: 'op-und', company_name: 'Underscore Co', specialties: ['wedding'], service_areas: 'Under_score Town', service_radius_miles: 25, rating: 4, total_reviews: 1, is_verified: true, is_active: true, is_partner: false },
  ];
}
function seedBookings(n: number) {
  h.state.user = { id: 'op-user-1' };
  h.store.bookings = Array.from({ length: n }, (_, i) => ({
    id: `b-${i + 1}`, operator_id: 'op-1', confirmation_code: `C${i + 1}`, status: 'completed', payment_status: 'paid',
    amount: 100, created_at: '2026-11-01T00:00:00Z',
    request: { id: `r-${i + 1}`, service_type: 'school', pickup_fuzzy: 'Everett', dropoff_fuzzy: 'Boston', start_date: '2026-11-10', start_time: '08:00' },
  }));
}
function seedReviews() {
  h.store.reviews = [
    ...Array.from({ length: 30 }, (_, i) => ({ id: `rev5-${i + 1}`, operator_id: 'op-1', user_id: `u5-${i + 1}`, rating: 5, comment: 'great', operator_response: null, operator_response_at: null, created_at: '2026-11-01T00:00:00Z', user: { id: `u5-${i + 1}`, full_name: 'Five', avatar_url: null } })),
    ...Array.from({ length: 30 }, (_, i) => ({ id: `rev1-${i + 1}`, operator_id: 'op-1', user_id: `u1-${i + 1}`, rating: 1, comment: 'bad', operator_response: null, operator_response_at: null, created_at: '2026-11-01T00:00:00Z', user: { id: `u1-${i + 1}`, full_name: 'One', avatar_url: null } })),
  ];
}
function seedMessages(n: number) {
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
function seedProfiles() {
  h.state.admin = true;
  h.store.profiles = [
    { id: 'u-1', email: 'alice@example.test', full_name: 'Alice Rider', company_name: null, role: 'rider', created_at: '2026-01-01' },
    { id: 'u-2', email: 'bob@transit.test', full_name: 'Bob Operator', company_name: 'Boston Transit Co', role: 'operator', created_at: '2026-01-02' },
    { id: 'u-3', email: 'carol@other.test', full_name: 'Carol Operator', company_name: 'Springfield Lines', role: 'operator', created_at: '2026-01-03' },
  ];
}
const reqFor = (path: string) => (qs = '') => new NextRequest(`http://localhost${path}${qs}`);
const dirReq = reqFor('/api/operators/directory');
const earnReq = reqFor('/api/operator/earnings');
const revReq = reqFor('/api/reviews');
const msgReq = reqFor('/api/messages');
const admReq = reqFor('/api/master/admin/users');

describe('directory location: literal matching against a faithful LIKE harness', () => {
  beforeEach(() => seedOperators());
  it('control: location=Ever matches the Everett operator', async () => {
    const r = await directoryGET(dirReq('?location=Ever'));
    expect(r.status).toBe(200); const b = await r.json();
    expect(b.operators.map((o: any) => o.id)).toEqual(['op-ev']);
  });
  it('control: location=% matches ONLY the row whose service area literally contains %', async () => {
    const r = await directoryGET(dirReq('?location=%25'));
    expect(r.status).toBe(200); const b = await r.json();
    expect(b.operators.map((o: any) => o.id)).toEqual(['op-pct']);
  });
  it('control: location=100% matches the literal-percent row', async () => {
    const r = await directoryGET(dirReq('?location=' + encodeURIComponent('100%')));
    expect(r.status).toBe(200); const b = await r.json();
    expect(b.operators.map((o: any) => o.id)).toEqual(['op-pct']);
  });
  it('control: location=_ matches ONLY the row whose service area literally contains _', async () => {
    const r = await directoryGET(dirReq('?location=_'));
    expect(r.status).toBe(200); const b = await r.json();
    expect(b.operators.map((o: any) => o.id)).toEqual(['op-und']);
  });
  it('attack: location=_verett is literal — the underscore must not stand in for E', async () => {
    const r = await directoryGET(dirReq('?location=_verett'));
    expect(r.status).toBe(200); const b = await r.json();
    expect(b.operators).toHaveLength(0);
  });
});

describe('earnings: month refusal, limit clamp, pagination refusal', () => {
  beforeEach(() => seedBookings(60));
  it('attack: month=2026-13 is refused 400, never an unfiltered 200', async () => {
    const r = await earningsGET(earnReq('?month=2026-13'));
    expect(r.status).toBe(400);
  });
  it('attack: month=2026-00 is refused 400', async () => {
    const r = await earningsGET(earnReq('?month=2026-00'));
    expect(r.status).toBe(400);
  });
  it('control: limit above the ceiling clamps to 50 with totals exact', async () => {
    const r = await earningsGET(earnReq('?limit=500'));
    expect(r.status).toBe(200); const b = await r.json();
    expect(b.trips).toHaveLength(50); expect(b.limit).toBe(50);
    expect(b.total).toBe(60); expect(b.totalPages).toBe(2);
    expect(b.allTimeTotal).toBe(6000); expect(b.totalTrips).toBe(60);
  });
  it('control: param-less call returns the first 20 with full-set totals', async () => {
    const r = await earningsGET(earnReq());
    expect(r.status).toBe(200); const b = await r.json();
    expect(b.trips).toHaveLength(20); expect(b.page).toBe(1); expect(b.limit).toBe(20);
    expect(b.total).toBe(60); expect(b.allTimeTotal).toBe(6000);
  });
  it('attack: malformed page/limit are refused 400', async () => {
    expect((await earningsGET(earnReq('?page=abc'))).status).toBe(400);
    expect((await earningsGET(earnReq('?limit=0'))).status).toBe(400);
    expect((await earningsGET(earnReq('?page=1.5'))).status).toBe(400);
  });
});

describe('reviews: first page by default, aggregates stay full-set', () => {
  beforeEach(() => seedReviews());
  it('control: param-less call returns 20 reviews, totalReviews 60, average over ALL 60', async () => {
    const r = await reviewsGET(revReq('?operator_id=op-1'));
    expect(r.status).toBe(200); const b = await r.json();
    expect(b.reviews).toHaveLength(20);
    expect(b.totalReviews).toBe(60); expect(b.total).toBe(60);
    expect(b.averageRating).toBe(3);
    expect(b.page).toBe(1); expect(b.limit).toBe(20); expect(b.totalPages).toBe(3);
  });
  it('control: page 2 with limit 5 returns the next page, aggregates unchanged', async () => {
    const r = await reviewsGET(revReq('?operator_id=op-1&limit=5&page=2'));
    expect(r.status).toBe(200); const b = await r.json();
    expect(b.reviews).toHaveLength(5); expect(b.totalReviews).toBe(60); expect(b.averageRating).toBe(3);
  });
  it('attack: malformed page is refused 400', async () => {
    expect((await reviewsGET(revReq('?operator_id=op-1&page=abc'))).status).toBe(400);
  });
});

describe('messages: first page by default with the full total', () => {
  beforeEach(() => seedMessages(60));
  it('control: param-less call returns the first 20 and total 60', async () => {
    const r = await messagesGET(msgReq('?request_id=req-1'));
    expect(r.status).toBe(200); const b = await r.json();
    expect(b.messages).toHaveLength(20);
    expect(b.total).toBe(60); expect(b.page).toBe(1); expect(b.limit).toBe(20); expect(b.totalPages).toBe(3);
  });
  it('control: page 3 returns the tail page', async () => {
    const r = await messagesGET(msgReq('?request_id=req-1&page=3'));
    expect(r.status).toBe(200); const b = await r.json();
    expect(b.messages).toHaveLength(20); expect(b.messages[0].id).toBe('msg-41');
  });
  it('attack: malformed limit is refused 400', async () => {
    expect((await messagesGET(msgReq('?request_id=req-1&limit=abc'))).status).toBe(400);
  });
});

describe('admin users: grammar refusal and role vocabulary', () => {
  beforeEach(() => seedProfiles());
  it('attack: a search containing a dot (grammar char) is refused 400', async () => {
    const r = await adminUsersGET(admReq('?search=' + encodeURIComponent('alice.example')));
    expect(r.status).toBe(400);
  });
  it('attack: a search containing an asterisk is refused 400', async () => {
    const r = await adminUsersGET(admReq('?search=' + encodeURIComponent('a*b')));
    expect(r.status).toBe(400);
  });
  it('attack: a role outside the vocabulary is refused 400', async () => {
    const r = await adminUsersGET(admReq('?role=bogus'));
    expect(r.status).toBe(400);
  });
  it('control: a valid role still filters exactly', async () => {
    const r = await adminUsersGET(admReq('?role=operator'));
    expect(r.status).toBe(200); const b = await r.json();
    expect((b.users || []).map((u: any) => u.id).sort()).toEqual(['u-2', 'u-3']);
  });
  it('control: role=manager (the admin page staff fetch) is accepted', async () => {
    const r = await adminUsersGET(admReq('?role=manager'));
    expect(r.status).toBe(200); const b = await r.json();
    expect(b.users).toHaveLength(0);
  });
});
