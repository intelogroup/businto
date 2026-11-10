/**
 * REGRESSION TEST — BUS-LOGS-FOREIGN-REQUEST-001, authenticated legs.
 * Phase 3 policy layer (src/lib/policy.ts) — Businto.
 *
 * The preserved probe (tests/logs-foreign-request-binding.test.ts)
 * covers the unauthenticated caller. These legs cover the session
 * side of the same binding rule: a log carrying a request_id is
 * stored only when the session user participates in that request
 * (owner, or operator with a quote on it); everyone else is refused
 * and nothing is stored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const captured: any[] = [];
let sessionUser: { id: string } | null = null;

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = {
    transport_requests: [],
    operators: [],
    quotes: [],
  };
  class QB {
    table: string;
    filters: Array<[string, any]> = [];
    constructor(t: string) {
      this.table = t;
    }
    select() {
      return this;
    }
    eq(k: string, v: any) {
      this.filters.push([k, v]);
      return this;
    }
    rows() {
      return (store[this.table] || []).filter((r) =>
        this.filters.every(([k, v]) => r[k] === v)
      );
    }
    async maybeSingle() {
      const rows = this.rows();
      return { data: rows[0] ?? null, error: null };
    }
    async single() {
      const rows = this.rows();
      return rows.length
        ? { data: rows[0], error: null }
        : { data: null, error: { message: 'not found' } };
    }
  }
  return { store, QB };
});

vi.mock('@/lib/event-logger', () => ({
  logEvent: async (input: any) => {
    captured.push(input);
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

import { POST } from '@/app/api/logs/route';

const OWNER = 'rider-1';
const OPERATOR_PROFILE = 'op-profile-1';
const OPERATOR_ID = 'op-company-1';
const STRANGER = 'stranger-1';
const REQ = 'req-1';

function post(body: any) {
  return POST(
    new NextRequest('http://localhost/api/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'test' },
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/logs request binding — authenticated legs', () => {
  beforeEach(() => {
    captured.length = 0;
    sessionUser = null;
    h.store.transport_requests = [{ id: REQ, user_id: OWNER }];
    h.store.operators = [{ id: OPERATOR_ID, profile_id: OPERATOR_PROFILE }];
    h.store.quotes = [{ request_id: REQ, operator_id: OPERATOR_ID }];
  });

  it('request owner may bind a log to their own request', async () => {
    sessionUser = { id: OWNER };
    const res = await post({ event_type: 'payment_step_viewed', request_id: REQ });
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0].request_id).toBe(REQ);
    expect(captured[0].user_id).toBe(OWNER);
  });

  it('operator with a quote on the request may bind', async () => {
    sessionUser = { id: OPERATOR_PROFILE };
    const res = await post({ event_type: 'quote_step_viewed', request_id: REQ });
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0].request_id).toBe(REQ);
  });

  it('authenticated stranger may NOT bind to a foreign request', async () => {
    sessionUser = { id: STRANGER };
    const res = await post({
      event_type: 'payment_confirmed',
      status: 'success',
      request_id: REQ,
      metadata: { forged: true },
    });
    expect(res.status).toBe(403);
    expect(captured).toHaveLength(0);
  });

  it('binding to a nonexistent request is refused', async () => {
    sessionUser = { id: OWNER };
    const res = await post({ event_type: 'payment_confirmed', request_id: 'req-nope' });
    expect(res.status).toBe(403);
    expect(captured).toHaveLength(0);
  });
});
