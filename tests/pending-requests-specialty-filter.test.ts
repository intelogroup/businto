// REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-07-1852; Phase 3 policy layer (src/lib/policy.ts) — Businto (BUS-PENDING-SPECIALTY-001)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

// BUS probe 2026-11-07-1852: GET /api/operator/pending-requests documents in its
// own header that it filters open requests by "Request service type matches
// operator specialties (if any)", and the handler fetches the operator's
// specialties + service_areas with the comment "Get operator specialties to
// filter relevant requests" — but the fetched values are never applied: the
// transport_requests query carries no service_type predicate and the only
// post-filter drops already-quoted requests. An operator vetted only for
// 'school' is offered (and can quote on) 'medical' and 'wedding' requests.
// Invariant: when an operator has specialties set, returned requests are
// limited to those service types; an operator with no specialties set sees
// all open requests (the "(if any)" control), and already-quoted requests
// stay excluded (control).
const OP_USER = "op-user-1";
const OP_ID = "op-1";

let operatorSpecialties: string[] = ["school"];

const REQUESTS = [
  { id: "req-school", service_type: "school", status: "pending" },
  { id: "req-medical", service_type: "medical", status: "pending" },
  { id: "req-wedding", service_type: "wedding", status: "quoted" },
];

function chainFor(table: string) {
  const chain: any = {};
  for (const m of ["select", "eq", "in", "gte", "order", "limit", "contains"])
    chain[m] = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn(async () => {
    if (table === "operator_profiles") return { data: { operator_id: OP_ID }, error: null };
    return { data: null, error: null };
  });
  chain.single = vi.fn(async () => {
    if (table === "operators")
      return {
        data: { specialties: operatorSpecialties, service_areas: ["Everett"], is_active: true },
        error: null,
      };
    return { data: null, error: null };
  });
  chain.then = (resolve: any, reject: any) => {
    let result: any = { data: [], error: null };
    if (table === "transport_requests") result = { data: REQUESTS, error: null };
    if (table === "quotes") result = { data: [], error: null };
    return Promise.resolve(result).then(resolve, reject);
  };
  return chain;
}

async function get() {
  const { GET } = await import("@/app/api/operator/pending-requests/route");
  const req = new NextRequest("http://localhost:3000/api/operator/pending-requests", { method: "GET" });
  const res: any = await GET(req as any);
  return { status: res.status, body: await res.json() };
}

describe("pending-requests specialty filter", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    operatorSpecialties = ["school"];
    const { requireUser, supabaseAdmin } = await import("@/lib/supabase/admin");
    (requireUser as any).mockResolvedValue({ id: OP_USER });
    (supabaseAdmin as any).from = vi.fn((t: string) => chainFor(t));
  });

  it("control: operator with no specialties set sees all open requests", async () => {
    operatorSpecialties = [];
    const { status, body } = await get();
    expect(status).toBe(200);
    expect((body.requests || []).map((r: any) => r.id).sort()).toEqual([
      "req-medical",
      "req-school",
      "req-wedding",
    ]);
  });

  it("attack: school-only operator is not offered medical/wedding requests", async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    const ids = (body.requests || []).map((r: any) => r.id);
    expect(ids).toEqual(["req-school"]);
  });
});
