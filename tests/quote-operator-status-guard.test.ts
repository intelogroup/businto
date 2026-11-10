// REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-07-2152; Phase 3 policy layer (src/lib/policy.ts) — Businto (BUS-QUOTE-OPERATOR-STATUS-001)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ success: true })),
  emailTemplates: { quoteReceived: vi.fn(() => ({ subject: "Quote", html: "<p>q</p>" })) },
  getAppBaseUrl: vi.fn(() => "http://localhost"),
}));
vi.mock("@/lib/email-helpers", () => ({ generateTripViewLink: vi.fn(async () => "http://localhost/trips/view?token=x") }));
vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn(async () => {}) }));

// BUS probe 2026-11-07-2152: POST /api/operator/quote (dashboard, session auth)
// resolves the operator's company id from operator_profiles / operators.id
// but NEVER reads the operator's own status row. The sibling surfaces all
// enforce it: GET /api/operator/pending-requests refuses inactive operators
// with 403 ("Operator account is inactive"), the public directory lists only
// is_verified + is_active operators, and the matching engine
// (src/lib/operator-matching.ts) selects only operators with
// is_active=true AND is_accepting_requests=true. The availability toggle's
// contract is "availability to receive new requests".
// Invariant: a quote may be submitted only by an operator that is active
// and currently accepting requests; an inactive or paused operator's quote
// submission is refused (>=400) and inserts no quote row.
const OP_USER = "op-user-1";
const OP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REQ_ID = "11111111-1111-4111-8111-111111111111";

let operatorRow: any = { id: OP_ID, is_active: true, is_accepting_requests: true, company_name: "Synthetic Transit" };
let insertedQuotes: any[] = [];

function chainFor(table: string) {
  const chain: any = {};
  for (const m of ["select", "eq", "in", "gte", "order", "limit", "contains", "update", "delete"])
    chain[m] = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn((payload: any) => {
    if (table === "quotes") insertedQuotes.push(payload);
    chain._payload = payload;
    return chain;
  });
  chain.maybeSingle = vi.fn(async () => {
    if (table === "operator_profiles") return { data: { operator_id: OP_ID }, error: null };
    if (table === "transport_requests") return { data: { status: "pending" }, error: null };
    if (table === "operators") return { data: operatorRow, error: null };
    return { data: null, error: null };
  });
  chain.single = vi.fn(async () => {
    if (table === "operators") return { data: operatorRow, error: null };
    if (table === "transport_requests")
      return { data: { user_id: "rider-1", metadata_private: {}, userProfile: { email: "rider@synthetic.example", full_name: "Rider One" } }, error: null };
    if (table === "quotes")
      return { data: { id: "q-1", operator_id: OP_ID, ...chain._payload, operator: { company_name: "Synthetic Transit" } }, error: null };
    return { data: null, error: { message: "not found" } };
  });
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: [], error: null }).then(resolve, reject);
  return chain;
}

async function post() {
  const { POST } = await import("@/app/api/operator/quote/route");
  const req = new NextRequest("http://localhost:3000/api/operator/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request_id: REQ_ID, total_price: 150, vehicle_type: "Van" }),
  });
  const res: any = await POST(req as any);
  return { status: res.status, body: await res.json() };
}

describe("dashboard quote operator-status guard", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    insertedQuotes = [];
    operatorRow = { id: OP_ID, is_active: true, is_accepting_requests: true, company_name: "Synthetic Transit" };
    const { requireUser, supabaseAdmin } = await import("@/lib/supabase/admin");
    (requireUser as any).mockResolvedValue({ id: OP_USER });
    (supabaseAdmin as any).from = vi.fn((t: string) => chainFor(t));
  });

  it("control: active, accepting operator submits a quote", async () => {
    const { status } = await post();
    expect(status).toBe(200);
    expect(insertedQuotes.length).toBe(1);
  });

  it("attack A: inactive (deactivated) operator cannot submit a quote", async () => {
    operatorRow = { ...operatorRow, is_active: false };
    const { status } = await post();
    expect(status).toBeGreaterThanOrEqual(400);
    expect(insertedQuotes.length).toBe(0);
  });

  it("attack B: paused operator (is_accepting_requests=false) cannot submit a quote", async () => {
    operatorRow = { ...operatorRow, is_accepting_requests: false };
    const { status } = await post();
    expect(status).toBeGreaterThanOrEqual(400);
    expect(insertedQuotes.length).toBe(0);
  });
});
