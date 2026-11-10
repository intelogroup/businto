// REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-08-0052; Phase 3 policy layer (src/lib/policy.ts) — Businto (BUS-TOKEN-QUOTE-OPERATOR-STATUS-001)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock("@/lib/tokens", () => ({
  verifyOperatorViewToken: vi.fn(async () => ({ operatorId: OP_ID, requestId: REQ_ID, purpose: "quote" })),
  generateOperatorViewToken: vi.fn(async () => "tok"),
  generateUserTripToken: vi.fn(async () => "tok"),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "msg-1" })),
  emailTemplates: { quoteReceived: vi.fn(() => ({ subject: "Quote", html: "<p>q</p>" })) },
  getAppBaseUrl: vi.fn(() => "http://localhost"),
}));
vi.mock("@/lib/email-helpers", () => ({ generateTripViewLink: vi.fn(async () => "http://localhost/trips/view?token=x") }));
vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn(async () => {}) }));

// BUS probe 2026-11-08-0052: POST /api/quotes (token/email-link route) — the
// audit leg named in BUS-QUOTE-OPERATOR-STATUS-001's next action. The route
// verifies the operator token, the request lifecycle, duplicate/accepted
// locks, and the M7 onboarding fields (company_name/company_phone read from
// the operators row), but NEVER reads is_active / is_accepting_requests from
// that same row. Sibling surfaces enforce both: pending-requests 403s
// inactive operators, the directory lists only active operators, and
// operator-matching selects only is_active AND is_accepting_requests.
// Invariant: a quote may be submitted only by an active, accepting operator;
// otherwise refusal (>=400) and no quote row inserted.
const OP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REQ_ID = "11111111-1111-4111-8111-111111111111";

let operatorRow: any = null;
let insertedQuotes: any[] = [];

function chainFor(table: string) {
  const chain: any = {};
  for (const m of ["select", "eq", "in", "gte", "order", "limit", "contains", "update", "delete"])
    chain[m] = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn((payload: any) => {
    if (table === "quotes") insertedQuotes.push(payload);
    if (table === "notifications") return Promise.resolve({ data: null, error: null });
    chain._payload = payload;
    return chain;
  });
  chain.maybeSingle = vi.fn(async () => {
    if (table === "operators") return { data: operatorRow, error: null };
    if (table === "transport_requests") return { data: { status: "pending" }, error: null };
    return { data: null, error: null };
  });
  chain.single = vi.fn(async () => {
    if (table === "transport_requests")
      return { data: { user_id: "rider-1", metadata_private: {}, userProfile: { email: "rider@synthetic.example", full_name: "Rider One" } }, error: null };
    if (table === "quotes")
      return { data: { id: "q-1", operator_id: OP_ID, ...chain._payload, operator: { company_name: "Synthetic Transit", company_email: "op@synthetic.example", company_phone: "555-0100", rating: 5 } }, error: null };
    return { data: null, error: { message: "not found" } };
  });
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: [], error: null }).then(resolve, reject);
  return chain;
}

async function post() {
  const { POST } = await import("@/app/api/quotes/route");
  const req = new NextRequest("http://localhost:3000/api/quotes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "signed-token", request_id: REQ_ID, operator_id: OP_ID, total_price: 150, vehicle_type: "Van" }),
  });
  const res: any = await POST(req as any);
  return { status: res.status, body: await res.json() };
}

describe("token quote operator-status guard", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    insertedQuotes = [];
    operatorRow = { id: OP_ID, is_active: true, is_accepting_requests: true, company_name: "Synthetic Transit", company_phone: "555-0100" };
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    (supabaseAdmin as any).from = vi.fn((t: string) => chainFor(t));
    const { verifyOperatorViewToken } = await import("@/lib/tokens");
    (verifyOperatorViewToken as any).mockResolvedValue({ operatorId: OP_ID, requestId: REQ_ID, purpose: "quote" });
  });

  it("control: active, accepting operator submits a quote via token link", async () => {
    const { status } = await post();
    expect(status).toBe(200);
    expect(insertedQuotes.length).toBe(1);
  });

  it("attack A: inactive (deactivated) operator cannot submit a quote via token link", async () => {
    operatorRow = { ...operatorRow, is_active: false };
    const { status } = await post();
    expect(status).toBeGreaterThanOrEqual(400);
    expect(insertedQuotes.length).toBe(0);
  });

  it("attack B: paused operator (is_accepting_requests=false) cannot submit a quote via token link", async () => {
    operatorRow = { ...operatorRow, is_accepting_requests: false };
    const { status } = await post();
    expect(status).toBeGreaterThanOrEqual(400);
    expect(insertedQuotes.length).toBe(0);
  });
});
