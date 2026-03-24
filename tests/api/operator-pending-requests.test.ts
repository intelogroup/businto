/**
 * operator-pending-requests.test.ts
 *
 * Tests for GET /api/operator/pending-requests
 * Operator-only endpoint. Returns open transport requests the operator can quote on.
 * SECURITY: Must never expose metadata_private (PII) to operators.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: { from: vi.fn() },
  requireUser: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGet() {
  return new NextRequest("https://businto.com/api/operator/pending-requests");
}

/** Build a fully-chainable Supabase mock (same pattern as admin-dispatch.test.ts) */
function mockChain(resolvedValue: { data?: any; error?: any }) {
  const chain: any = {};
  const methods = [
    "select", "insert", "update", "upsert", "delete",
    "eq", "neq", "in", "order", "range", "gt", "lt", "not", "maybeSingle", "single",
  ];
  methods.forEach((m) => { chain[m] = vi.fn().mockReturnValue(chain); });
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  chain.order = vi.fn().mockResolvedValue(resolvedValue);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.gt = vi.fn().mockReturnValue(chain);
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/operator/pending-requests", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const { requireUser } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue(null);

    const { GET } = await import("@/app/api/operator/pending-requests/route");
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not an operator", async () => {
    const { requireUser, supabaseAdmin } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue({ id: "user-1" });

    // Both profile lookups return null — not an operator
    (supabaseAdmin as any).from = vi.fn().mockReturnValue(
      mockChain({ data: null, error: null })
    );

    const { GET } = await import("@/app/api/operator/pending-requests/route");
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it("returns 200 with requests array when authenticated operator", async () => {
    const { requireUser, supabaseAdmin } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue({ id: "op-user-1" });

    const REQUESTS = [
      {
        id: "req-1",
        service_type: "school",
        metadata_safe: { pickup_fuzzy: "Boston, MA" },
        status: "pending",
      },
    ];

    (supabaseAdmin as any).from = vi.fn().mockImplementation((table: string) => {
      if (table === "operator_profiles") {
        return mockChain({ data: { operator_id: "op-1" }, error: null });
      }
      if (table === "operators") {
        return mockChain({ data: { specialties: [], service_areas: [], is_active: true }, error: null });
      }
      if (table === "quotes") {
        return mockChain({ data: [], error: null });
      }
      // transport_requests
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: REQUESTS, error: null }),
      };
    });

    const { GET } = await import("@/app/api/operator/pending-requests/route");
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("requests");
    expect(Array.isArray(json.requests)).toBe(true);
  });

  it("route select statement does NOT include metadata_private (PII guard)", async () => {
    // The route explicitly selects only safe fields from transport_requests.
    // This test verifies the select string by intercepting the from().select() call.
    const { requireUser, supabaseAdmin } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue({ id: "op-user-1" });

    let capturedSelect = "";

    (supabaseAdmin as any).from = vi.fn().mockImplementation((table: string) => {
      if (table === "operator_profiles") return mockChain({ data: { operator_id: "op-1" }, error: null });
      if (table === "operators") return mockChain({ data: { specialties: [], service_areas: [], is_active: true }, error: null });
      if (table === "quotes") return mockChain({ data: [], error: null });
      // Capture the select string for transport_requests
      const chain = {
        select: vi.fn().mockImplementation((fields: string) => {
          capturedSelect = fields;
          return chain;
        }),
        in: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      return chain;
    });

    const { GET } = await import("@/app/api/operator/pending-requests/route");
    await GET(makeGet());

    // The select string must NOT include metadata_private
    expect(capturedSelect).not.toContain("metadata_private");
    // Must include metadata_safe (the permitted field)
    expect(capturedSelect).toContain("metadata_safe");
  });
});
