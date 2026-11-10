// REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-05-2152; Phase 3 policy layer (src/lib/policy.ts) — Businto (BUS-CHAT-SUGGEST-FOREIGN-CONTEXT-001)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/ai", () => ({ generateSmartReplies: vi.fn() }));

// BUS probe 2026-11-05-2152: POST /api/chat/suggestions fetches transport_requests
// / bookings context by id with NO ownership/participation check, and feeds
// service_type + status into generateSmartReplies. Invariant: a caller may only
// obtain context-derived suggestions for a request/booking they own/participate
// in; a foreign id's service_type/status must never enter the AI context.
const USER = "user-self";
const OWN_REQ = "req-own";
const FOREIGN_REQ = "req-foreign";
const FOREIGN_BOOKING = "booking-foreign";

function chainFor(table: string) {
  let idEq: string | null = null;
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn((col: string, val: string) => { if (col === "id") idEq = val; return chain; });
  chain.single = vi.fn(async () => {
    if (table === "transport_requests") {
      if (idEq === OWN_REQ) return { data: { service_type: "own_service_marker", status: "own_status_marker", user_id: USER }, error: null };
      if (idEq === FOREIGN_REQ) return { data: { service_type: "foreign_service_marker", status: "foreign_status_marker", user_id: "someone-else" }, error: null };
      return { data: null, error: null };
    }
    if (table === "bookings") {
      if (idEq === FOREIGN_BOOKING) return { data: { status: "foreign_booking_status", user_id: "someone-else", operator_id: "op-foreign", transport_requests: { service_type: "foreign_booking_service" } }, error: null };
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
  chain.maybeSingle = chain.single;
  return chain;
}

async function post(body: any) {
  const { POST } = await import("@/app/api/chat/suggestions/route");
  const req = new NextRequest("http://localhost:3000/api/chat/suggestions", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return POST(req as any);
}

describe("chat suggestions foreign-context binding", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireUser, supabaseAdmin } = await import("@/lib/supabase/admin");
    (requireUser as any).mockResolvedValue({ id: USER });
    (supabaseAdmin as any).from = vi.fn((t: string) => chainFor(t));
    const { generateSmartReplies } = await import("@/lib/ai");
    (generateSmartReplies as any).mockResolvedValue(["ok"]);
  });

  it("control: own request context is used for suggestions", async () => {
    const res = await post({ messages: [{ content: "hi", sender_id: "x" }], requestId: OWN_REQ });
    expect(res.status).toBe(200);
    const { generateSmartReplies } = await import("@/lib/ai");
    const ctx = (generateSmartReplies as any).mock.calls[0][1];
    expect(ctx.serviceType).toBe("own_service_marker");
    expect(ctx.status).toBe("own_status_marker");
  });

  it("attack: FOREIGN request_id context must not enter the AI context", async () => {
    const res = await post({ messages: [{ content: "hi", sender_id: "x" }], requestId: FOREIGN_REQ });
    expect(res.status).toBe(200);
    const { generateSmartReplies } = await import("@/lib/ai");
    const ctx = (generateSmartReplies as any).mock.calls[0][1];
    expect(ctx.serviceType).not.toBe("foreign_service_marker");
    expect(ctx.status).not.toBe("foreign_status_marker");
  });

  it("attack: FOREIGN bookingId context must not enter the AI context", async () => {
    const res = await post({ messages: [{ content: "hi", sender_id: "x" }], bookingId: FOREIGN_BOOKING });
    expect(res.status).toBe(200);
    const { generateSmartReplies } = await import("@/lib/ai");
    const ctx = (generateSmartReplies as any).mock.calls[0][1];
    expect(ctx.serviceType).not.toBe("foreign_booking_service");
    expect(ctx.status).not.toBe("foreign_booking_status");
  });
});
