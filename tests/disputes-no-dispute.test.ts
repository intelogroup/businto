/**
 * PERMANENT REGRESSION — BUS-DISPUTES-NO-DISPUTE-001 (converted from the loop probe of cycle 2026-11-12-1552; assertions unchanged)
 * POST /api/master/admin/disputes (src/app/api/master/admin/disputes/route.ts)
 * fetches the trip's dispute_status but only uses it in one note
 * expression; the resolve / dismiss / update_status branches never
 * check that a dispute exists. The repo's own dispute-management.test.ts
 * never calls the route — it re-implements the payload builder inline —
 * so acting on a never-flagged trip has never been executed.
 * Invariant: only `flag` may act on a trip with dispute_status = null;
 * resolve / dismiss / update_status on a never-flagged trip must be
 * refused (400/409) BEFORE any update, while the same actions on an
 * open dispute succeed.
 * Harness: in-memory mocked Supabase recording update payloads;
 * synthetic admin, synthetic trip only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  const updatePayloads: any[] = [];
  const store: Record<string, any> = {
    transport_requests: [{ id: 'trip-1', dispute_status: null }],
  };
  class QB {
    table: string; filters: Array<[string, any]> = []; payload: any = null; isUpdate = false;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    update(p: any) { this.isUpdate = true; this.payload = p; updatePayloads.push(p); return this; }
    _match() {
      const rows = store[this.table] || [];
      return rows.filter((r: any) => this.filters.every(([k, v]) => r[k] === v));
    }
    async maybeSingle() {
      const m = this._match();
      return m.length ? { data: m[0], error: null } : { data: null, error: null };
    }
    async single() {
      const m = this._match();
      if (this.isUpdate) { m.forEach((r: any) => Object.assign(r, this.payload)); }
      return m.length ? { data: m[0], error: null } : { data: null, error: { message: 'not found' } };
    }
  }
  return { store, updatePayloads, QB };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  supabase: { from: (t: string) => new h.QB(t) },
  requireAdmin: async () => ({ id: 'admin-1', email: 'admin@synthetic.test' }),
  requireUser: async () => ({ id: 'admin-1' }),
}));
vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  supabase: { from: (t: string) => new h.QB(t) },
  requireAdmin: async () => ({ id: 'admin-1', email: 'admin@synthetic.test' }),
  requireUser: async () => ({ id: 'admin-1' }),
}));

import { POST } from '@/app/api/master/admin/disputes/route';

function reqFor(body: any) {
  return new NextRequest('http://localhost/api/master/admin/disputes', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}
function setDispute(s: any) { h.store.transport_requests = [{ id: 'trip-1', dispute_status: s }]; }

describe('admin disputes POST requires an existing dispute for non-flag actions', () => {
  beforeEach(() => { h.updatePayloads.length = 0; setDispute(null); });

  it('control: flag on a never-flagged trip succeeds (200, open)', async () => {
    const res = await POST(reqFor({ action: 'flag', tripId: 'trip-1', note: 'rider reported' }));
    expect(res.status).toBe(200);
    expect(h.store.transport_requests[0].dispute_status).toBe('open');
  });

  it('control: update_status on an open dispute succeeds', async () => {
    setDispute('open');
    const res = await POST(reqFor({ action: 'update_status', tripId: 'trip-1', status: 'under_review' }));
    expect(res.status).toBe(200);
    expect(h.store.transport_requests[0].dispute_status).toBe('under_review');
  });

  it('control: resolve on an open dispute succeeds', async () => {
    setDispute('open');
    const res = await POST(reqFor({ action: 'resolve', tripId: 'trip-1' }));
    expect(res.status).toBe(200);
    expect(h.store.transport_requests[0].dispute_status).toBe('resolved');
  });

  it('attack: resolve on a never-flagged trip is refused with no update', async () => {
    const res = await POST(reqFor({ action: 'resolve', tripId: 'trip-1' }));
    expect([400, 409]).toContain(res.status);
    expect(h.updatePayloads).toEqual([]);
    expect(h.store.transport_requests[0].dispute_status).toBeNull();
  });

  it('attack: dismiss on a never-flagged trip is refused with no update', async () => {
    const res = await POST(reqFor({ action: 'dismiss', tripId: 'trip-1' }));
    expect([400, 409]).toContain(res.status);
    expect(h.updatePayloads).toEqual([]);
    expect(h.store.transport_requests[0].dispute_status).toBeNull();
  });

  it('attack: update_status on a never-flagged trip is refused with no update', async () => {
    const res = await POST(reqFor({ action: 'update_status', tripId: 'trip-1', status: 'under_review' }));
    expect([400, 409]).toContain(res.status);
    expect(h.updatePayloads).toEqual([]);
    expect(h.store.transport_requests[0].dispute_status).toBeNull();
  });
});
