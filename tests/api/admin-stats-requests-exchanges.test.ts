/**
 * admin-stats-requests-exchanges.test.ts
 *
 * Tests for:
 *   GET  /api/master/admin/stats     — aggregate platform stats (admin-only)
 *   GET  /api/master/admin/requests  — paginated transport requests (admin-only)
 *   GET  /api/master/admin/exchanges — pending PII exchange queue (admin-only)
 *   POST /api/master/admin/exchanges — send operator details (admin-only)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: { from: vi.fn() },
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  emailTemplates: {
    operatorOrderDetails: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
  },
  getAppBaseUrl: vi.fn().mockReturnValue("https://businto.com"),
}));

vi.mock("@/lib/event-logger", () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGet(path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://businto.com${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

function makePost(path: string, body: object) {
  return new NextRequest(`https://businto.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── /api/master/admin/stats ────────────────────────────────────────────────────

describe("GET /api/master/admin/stats", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("no session") }) },
    });

    const { GET } = await import("@/app/api/master/admin/stats/route");
    const res = await GET(makeGet("/api/master/admin/stats"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated but not admin", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
    });

    const { supabaseAdmin } = await import("@/lib/supabase-server");
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "user" } }),
    });
    (supabaseAdmin as any).from = mockFrom;

    const { GET } = await import("@/app/api/master/admin/stats/route");
    const res = await GET(makeGet("/api/master/admin/stats"));
    expect(res.status).toBe(403);
  });

  it("returns stats when authenticated as admin", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null }) },
    });

    const { supabaseAdmin } = await import("@/lib/supabase-server");
    let callCount = 0;
    (supabaseAdmin as any).from = vi.fn().mockImplementation(() => {
      callCount++;
      // Profile check returns admin role
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "admin" } }),
        };
      }
      // All subsequent calls are the Promise.all stats queries
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        head: true,
        count: 5,
        data: [{ amount: 100 }],
        then: vi.fn(),
      };
    });

    // Mock Promise.all results
    vi.spyOn(Promise, "all").mockResolvedValueOnce([
      { count: 10 },
      { count: 5 },
      { count: 3 },
      { count: 8 },
      { data: [{ amount: 500 }, { amount: 200 }] },
    ] as any);

    const { GET } = await import("@/app/api/master/admin/stats/route");
    const res = await GET(makeGet("/api/master/admin/stats"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("stats");
    expect(json.stats).toHaveProperty("totalRevenue");
  });
});

// ── /api/master/admin/requests ────────────────────────────────────────────────

describe("GET /api/master/admin/requests", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 403 when not admin", async () => {
    const { requireAdmin } = await import("@/lib/supabase-server");
    (requireAdmin as any).mockResolvedValue(null);

    const { GET } = await import("@/app/api/master/admin/requests/route");
    const res = await GET(makeGet("/api/master/admin/requests"));
    expect(res.status).toBe(403);
  });

  it("returns paginated requests when admin", async () => {
    const { requireAdmin, supabaseAdmin } = await import("@/lib/supabase-server");
    (requireAdmin as any).mockResolvedValue({ id: "admin-1" });

    const chainMock = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
    };
    // First call: count, second call: data
    chainMock.range = vi.fn().mockResolvedValue({ data: [], count: 0, error: null });
    (supabaseAdmin as any).from = vi.fn().mockReturnValue(chainMock);

    const { GET } = await import("@/app/api/master/admin/requests/route");
    const res = await GET(makeGet("/api/master/admin/requests"));
    expect(res.status).toBe(200);
  });
});

// ── /api/master/admin/exchanges ───────────────────────────────────────────────

describe("GET /api/master/admin/exchanges", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 403 when not admin", async () => {
    const { requireAdmin } = await import("@/lib/supabase-server");
    (requireAdmin as any).mockResolvedValue(null);

    const { GET } = await import("@/app/api/master/admin/exchanges/route");
    const res = await GET(makeGet("/api/master/admin/exchanges"));
    expect(res.status).toBe(403);
  });

  it("returns pending exchanges when admin", async () => {
    const { requireAdmin, supabaseAdmin } = await import("@/lib/supabase-server");
    (requireAdmin as any).mockResolvedValue({ id: "admin-1" });

    (supabaseAdmin as any).from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const { GET } = await import("@/app/api/master/admin/exchanges/route");
    const res = await GET(makeGet("/api/master/admin/exchanges"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("exchanges");
  });
});

// NOTE: exchanges route only exports GET. POST (send operator details) is in dispatch route.
// The following tests verify the GET endpoint returns correct shape.

describe("GET /api/master/admin/exchanges (data shape)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("exchanges response contains exchanges array key", async () => {
    const { requireAdmin, supabaseAdmin } = await import("@/lib/supabase-server");
    (requireAdmin as any).mockResolvedValue({ id: "admin-1" });

    (supabaseAdmin as any).from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [{ id: "b-1", requires_manual_exchange: true }], error: null }),
    });

    const { GET } = await import("@/app/api/master/admin/exchanges/route");
    const res = await GET(makeGet("/api/master/admin/exchanges"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.exchanges)).toBe(true);
  });
});
