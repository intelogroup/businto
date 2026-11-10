// REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-06-1852; Phase 3 policy layer (src/lib/policy.ts) — Businto (BUS-DASHBOARD-PII-REVEAL-001)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

// BUS probe 2026-11-06-1852: GET /api/operator/dashboard selects the related
// transport_requests rows with pickup_address + dropoff_address (exact rider
// addresses) for ALL of the operator's bookings, regardless of payment_status.
// The platform's own PII-reveal gate (payments/webhook, payment_intent.succeeded)
// sends exact order details to the operator only AFTER payment is confirmed,
// and the operator-view endpoint intentionally returns fuzzy locations only.
// Invariant: an operator must not receive a rider's exact pickup/dropoff
// addresses for a booking whose payment has not been confirmed ('paid');
// after payment, exact addresses are legitimate (control).
const OP_USER = "op-user-1";
const OP_ID = "op-1";

let bookingPaymentStatus = "paid";
let bookingStatus = "completed";

function makeBooking() {
  return {
    id: "booking-1",
    confirmation_code: "CONF1",
    status: bookingStatus,
    payment_status: bookingPaymentStatus,
    amount: 100,
    created_at: "2026-11-01T00:00:00.000Z",
    request: {
      id: "req-1",
      service_type: "school",
      pickup_fuzzy: "Everett",
      dropoff_fuzzy: "Boston",
      pickup_address: "EXACT_PICKUP_MARKER 123 Main St Everett",
      dropoff_address: "EXACT_DROPOFF_MARKER 456 Oak Ave Boston",
      start_date: "2026-11-10",
      start_time: "08:00",
      metadata_safe: {},
    },
  };
}

function chainFor(table: string) {
  const chain: any = {};
  for (const m of ["select", "eq", "order", "limit", "in"]) chain[m] = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn(async () => {
    if (table === "operator_profiles") return { data: { operator_id: OP_ID }, error: null };
    return { data: null, error: null };
  });
  chain.single = vi.fn(async () => {
    if (table === "operators")
      return { data: { id: OP_ID, company_name: "Op Co", company_email: "op@example.com", rating: 5, total_reviews: 3, is_partner: false, specialties: [], service_radius_miles: 25 }, error: null };
    return { data: null, error: null };
  });
  // Quotes/bookings queries are awaited directly after .limit()
  chain.then = (resolve: any, reject: any) => {
    const result = table === "bookings" ? { data: [makeBooking()], error: null } : { data: [], error: null };
    return Promise.resolve(result).then(resolve, reject);
  };
  return chain;
}

async function get() {
  const { GET } = await import("@/app/api/operator/dashboard/route");
  const req = new NextRequest("http://localhost:3000/api/operator/dashboard", { method: "GET" });
  return GET(req as any);
}

describe("operator dashboard PII-reveal gate", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    bookingPaymentStatus = "paid";
    bookingStatus = "completed";
    const { requireUser, supabaseAdmin } = await import("@/lib/supabase/admin");
    (requireUser as any).mockResolvedValue({ id: OP_USER });
    (supabaseAdmin as any).from = vi.fn((t: string) => chainFor(t));
  });

  it("control: PAID booking may expose exact addresses to its operator", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    const text = JSON.stringify(body);
    expect(text).toContain("EXACT_PICKUP_MARKER");
  });

  it("attack: UNPAID booking must not expose exact pickup/dropoff addresses", async () => {
    bookingPaymentStatus = "unpaid";
    bookingStatus = "confirmed";
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    const text = JSON.stringify(body);
    expect(text).not.toContain("EXACT_PICKUP_MARKER");
    expect(text).not.toContain("EXACT_DROPOFF_MARKER");
  });

  it("attack: PROCESSING (not yet paid) booking must not expose exact addresses", async () => {
    bookingPaymentStatus = "processing";
    bookingStatus = "confirmed";
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    const text = JSON.stringify(body);
    expect(text).not.toContain("EXACT_PICKUP_MARKER");
    expect(text).not.toContain("EXACT_DROPOFF_MARKER");
  });
});
