/**
 * PERMANENT REGRESSION — Phase 4 (M5), pagination family.
 * Cards: BUS-DIRECTORY-PAGINATION-001, BUS-ADMIN-DISPUTES-PAGINATION-001,
 * BUS-ADMIN-REQUESTS-PAGINATION-001, BUS-ADMIN-USERS-PAGINATION-001,
 * BUS-QUOTES-PAGINATION-001.
 *
 * Invariant: every list endpoint parses page/limit through the ONE
 * shared parser (src/lib/boundary.ts). Malformed (non-integer) or
 * non-positive values are refused 400 BEFORE any data-layer call —
 * never propagated as NaN into .range() (the old 500s), never an
 * empty/reversed range — while valid pagination, route defaults, and
 * each route's pre-existing limit ceiling behave exactly as before.
 * Harness: in-memory mocked Supabase; range() records its arguments
 * and, like PostgREST, errors when handed a non-finite/reversed range.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  const rangeCalls: Array<[any, any]> = [];
  class QB {
    table: string;
    rangeArgs: [any, any] | null = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq() { return this; }
    order() { return this; }
    contains() { return this; }
    ilike() { return this; }
    not() { return this; }
    in() { return this; }
    or() { return this; }
    range(a: any, b: any) { this.rangeArgs = [a, b]; rangeCalls.push([a, b]); return this; }
    single() {
      if (this.table === 'profiles') return Promise.resolve({ data: { role: 'admin' }, error: null });
      return Promise.resolve({ data: null, error: null });
    }
    maybeSingle() { return Promise.resolve({ data: null, error: null }); }
    then(res: any) {
      if (this.rangeArgs && (!Number.isFinite(this.rangeArgs[0]) || !Number.isFinite(this.rangeArgs[1]) || this.rangeArgs[1] < this.rangeArgs[0])) {
        res({ data: null, error: { message: 'invalid range' }, count: null });
      } else {
        res({ data: [{ id: 'row-1' }], error: null, count: 1 });
      }
    }
  }
  return { QB, rangeCalls };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireUser: async () => ({ id: 'admin-1', email: 'admin@example.com' }),
  requireAdmin: async () => ({ id: 'admin-1', email: 'admin@example.com' }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from: (t: string) => new h.QB(t),
  }),
}));
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async () => {}),
  emailTemplates: {},
  getAppBaseUrl: () => 'http://localhost',
}));
vi.mock('@/lib/tokens', () => ({
  generateOperatorViewToken: vi.fn(async () => 'tok'),
  generateUserTripToken: vi.fn(async () => 'tok'),
  verifyOperatorViewToken: vi.fn(async () => null),
}));
vi.mock('@/lib/email-helpers', () => ({ generateTripViewLink: vi.fn(async () => 'http://localhost/x') }));
vi.mock('@/lib/event-logger', () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/quote-validation', () => ({ validateQuote: vi.fn(() => ({ valid: true })) }));
vi.mock('@/lib/request-status', () => ({
  fetchRequestStatus: vi.fn(async () => null),
  isOpenRequestStatus: vi.fn(() => false),
}));
vi.mock('@/lib/policy', () => ({ operatorQuoteEligibility: vi.fn(() => ({ eligible: true })) }));

import { GET as directoryGET } from '@/app/api/operators/directory/route';
import { GET as disputesGET } from '@/app/api/master/admin/disputes/route';
import { GET as requestsGET } from '@/app/api/master/admin/requests/route';
import { GET as usersGET } from '@/app/api/master/admin/users/route';
import { GET as quotesGET } from '@/app/api/quotes/route';
import { parsePagination, parseLimitParam } from '@/lib/boundary';

const oneBasedRoutes: Array<[string, (r: NextRequest) => Promise<any>, string]> = [
  ['directory', directoryGET, 'http://localhost/api/operators/directory'],
  ['admin disputes', disputesGET, 'http://localhost/api/master/admin/disputes'],
  ['admin requests', requestsGET, 'http://localhost/api/master/admin/requests'],
  ['admin users', usersGET, 'http://localhost/api/master/admin/users'],
];

describe('shared pagination parser — 1-based list endpoints', () => {
  beforeEach(() => { h.rangeCalls.length = 0; });
  for (const [name, handler, base] of oneBasedRoutes) {
    describe(name, () => {
      it('control: page=1&limit=20 succeeds with range 0-19', async () => {
        const res = await handler(new NextRequest(`${base}?page=1&limit=20`));
        expect(res.status).toBe(200);
        expect(h.rangeCalls).toEqual([[0, 19]]);
      });
      it('control: defaults (no params) succeed with range 0-19', async () => {
        const res = await handler(new NextRequest(base));
        expect(res.status).toBe(200);
        expect(h.rangeCalls).toEqual([[0, 19]]);
      });
      it('attack: page=abc refused 400, data layer never called', async () => {
        const res = await handler(new NextRequest(`${base}?page=abc&limit=20`));
        expect(res.status).toBe(400);
        expect(h.rangeCalls).toEqual([]);
      });
      it('attack: limit=abc refused 400, data layer never called', async () => {
        const res = await handler(new NextRequest(`${base}?page=1&limit=abc`));
        expect(res.status).toBe(400);
        expect(h.rangeCalls).toEqual([]);
      });
      it('attack: page=0 refused 400 (below the 1-based floor)', async () => {
        const res = await handler(new NextRequest(`${base}?page=0&limit=20`));
        expect(res.status).toBe(400);
        expect(h.rangeCalls).toEqual([]);
      });
      it('attack: page=-1 refused 400', async () => {
        const res = await handler(new NextRequest(`${base}?page=-1&limit=20`));
        expect(res.status).toBe(400);
        expect(h.rangeCalls).toEqual([]);
      });
      it('attack: limit=0 refused 400', async () => {
        const res = await handler(new NextRequest(`${base}?page=1&limit=0`));
        expect(res.status).toBe(400);
        expect(h.rangeCalls).toEqual([]);
      });
      it('attack: limit=-5 refused 400', async () => {
        const res = await handler(new NextRequest(`${base}?page=1&limit=-5`));
        expect(res.status).toBe(400);
        expect(h.rangeCalls).toEqual([]);
      });
      it('attack: fractional page=1.5 refused 400 (strict integer syntax)', async () => {
        const res = await handler(new NextRequest(`${base}?page=1.5&limit=20`));
        expect(res.status).toBe(400);
        expect(h.rangeCalls).toEqual([]);
      });
    });
  }
  it('directory keeps its pre-existing limit ceiling of 50', async () => {
    const res = await directoryGET(new NextRequest('http://localhost/api/operators/directory?page=1&limit=100'));
    expect(res.status).toBe(200);
    expect(h.rangeCalls).toEqual([[0, 49]]);
  });
});

describe('shared pagination parser — quotes list (0-based)', () => {
  beforeEach(() => { h.rangeCalls.length = 0; });
  const base = 'http://localhost/api/quotes';
  it('control: page=0&limit=20 succeeds with range 0-19', async () => {
    const res = await quotesGET(new NextRequest(`${base}?page=0&limit=20`));
    expect(res.status).toBe(200);
    expect(h.rangeCalls).toEqual([[0, 19]]);
  });
  it('control: page=1&limit=10 succeeds with range 10-19', async () => {
    const res = await quotesGET(new NextRequest(`${base}?page=1&limit=10`));
    expect(res.status).toBe(200);
    expect(h.rangeCalls).toEqual([[10, 19]]);
  });
  it('control: defaults (no params) succeed with range 0-49 (default limit 50)', async () => {
    const res = await quotesGET(new NextRequest(base));
    expect(res.status).toBe(200);
    expect(h.rangeCalls).toEqual([[0, 49]]);
  });
  it('attack: page=abc refused 400, data layer never called', async () => {
    const res = await quotesGET(new NextRequest(`${base}?page=abc&limit=20`));
    expect(res.status).toBe(400);
    expect(h.rangeCalls).toEqual([]);
  });
  it('attack: limit=abc refused 400, data layer never called', async () => {
    const res = await quotesGET(new NextRequest(`${base}?page=0&limit=abc`));
    expect(res.status).toBe(400);
    expect(h.rangeCalls).toEqual([]);
  });
  it('attack: limit=0 refused 400', async () => {
    const res = await quotesGET(new NextRequest(`${base}?page=0&limit=0`));
    expect(res.status).toBe(400);
    expect(h.rangeCalls).toEqual([]);
  });
  it('attack: limit=-5 refused 400', async () => {
    const res = await quotesGET(new NextRequest(`${base}?page=0&limit=-5`));
    expect(res.status).toBe(400);
    expect(h.rangeCalls).toEqual([]);
  });
  it('attack: page=-3 refused 400 (below the 0-based floor), never a 500', async () => {
    const res = await quotesGET(new NextRequest(`${base}?page=-3&limit=10`));
    expect(res.status).toBe(400);
    expect(h.rangeCalls).toEqual([]);
  });
  it('control: limit above the ceiling clamps to 100, as before', async () => {
    const res = await quotesGET(new NextRequest(`${base}?page=0&limit=200`));
    expect(res.status).toBe(200);
    expect(h.rangeCalls).toEqual([[0, 99]]);
  });
});

describe('parseLimitParam (geocode census leg)', () => {
  it('absent param yields the default', () => {
    expect(parseLimitParam(null, { defaultValue: 5, max: 50 })).toBe(5);
  });
  it('a valid value passes through, clamped to the ceiling', () => {
    expect(parseLimitParam('7', { defaultValue: 5, max: 50 })).toBe(7);
    expect(parseLimitParam('500', { defaultValue: 5, max: 50 })).toBe(50);
  });
  it('malformed or non-positive values are refused (null)', () => {
    expect(parseLimitParam('abc', { defaultValue: 5, max: 50 })).toBeNull();
    expect(parseLimitParam('0', { defaultValue: 5, max: 50 })).toBeNull();
    expect(parseLimitParam('-2', { defaultValue: 5, max: 50 })).toBeNull();
    expect(parseLimitParam('2.5', { defaultValue: 5, max: 50 })).toBeNull();
  });
});

describe('parsePagination unit contract', () => {
  it('huge digit strings that overflow a safe integer are refused', () => {
    const res = parsePagination(new URLSearchParams('page=99999999999999999999&limit=20'));
    expect(res.ok).toBe(false);
  });
  it('empty-string params fall back to defaults, as the old || defaults did', () => {
    const res = parsePagination(new URLSearchParams('page=&limit='));
    expect(res).toEqual({ ok: true, page: 1, limit: 20, from: 0, to: 19 });
  });
});
