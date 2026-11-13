import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

// PERMANENT REGRESSION — BUS-DASHBOARD-STATS-TRUNCATION-001 (converted from the loop probe of cycle 2026-11-13-1252; assertions unchanged).
// Original finding: GET /api/operator/dashboard fetches the
// operator's bookings with .limit(50) and then computes its headline
// stats (totalEarnings, completedTrips, activeBookings) from that
// truncated page alone. The sibling earnings route fetches ALL
// completed/paid bookings with no limit before totalling.
// Invariant: dashboard earnings/completion stats reflect ALL of the
// operator's bookings, not only the 50 most recent.
const OP_USER = "op-user-1";
const OP_ID = "op-1";

let bookingsSeed: any[] = [];

function makeBookings(n: number, amount = 100) {
  return Array.from({ length: n }, (_, i) => ({
    id: `booking-${i}`,
    confirmation_code: `CONF${i}`,
    status: "completed",
    payment_status: "paid",
    amount,
    created_at: "2026-11-01T00:00:00.000Z",
    request: {
      id: `req-${i}`,
      service_type: "school",
      pickup_fuzzy: "Everett",
      dropoff_fuzzy: "Boston",
      pickup_address: "1 Main St",
      dropoff_address: "2 Oak Ave",
      start_date: "2026-11-10",
      start_time: "08:00",
      metadata_safe: {},
    },
  }));
}

function chainFor(table: string) {
  const chain: any = {};
  let limitN: number | null = null;
  for (const m of ["select", "eq", "order", "in"]) chain[m] = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn((n: number) => { limitN = n; return chain; });
  chain.maybeSingle = vi.fn(async () => {
    if (table === "operator_profiles") return { data: { operator_id: OP_ID }, error: null };
    return { data: null, error: null };
  });
  chain.single = vi.fn(async () => {
    if (table === "operators")
      return { data: { id: OP_ID, company_name: "Op Co", company_email: "op@example.com", rating: 5, total_reviews: 3, is_partner: false, specialties: [], service_radius_miles: 25 }, error: null };
    return { data: null, error: null };
  });
  chain.then = (resolve: any, reject: any) => {
    let rows: any[] = [];
    if (table === "bookings") rows = limitN === null ? bookingsSeed : bookingsSeed.slice(0, limitN);
    return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  };
  return chain;
}

async function get() {
  const { GET } = await import("@/app/api/operator/dashboard/route");
  const req = new NextRequest("http://localhost:3000/api/operator/dashboard", { method: "GET" });
  return GET(req as any);
}

describe("operator dashboard stats truncation", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    bookingsSeed = [];
    const { requireUser, supabaseAdmin } = await import("@/lib/supabase/admin");
    (requireUser as any).mockResolvedValue({ id: OP_USER });
    (supabaseAdmin as any).from = vi.fn((t: string) => chainFor(t));
  });

  it("control: 2 completed paid bookings total exactly", async () => {
    bookingsSeed = makeBookings(2);
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.totalEarnings).toBe(200);
    expect(body.stats.completedTrips).toBe(2);
  });

  it("attack: 60 completed paid bookings must total 6000 / 60 trips", async () => {
    bookingsSeed = makeBookings(60);
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.totalEarnings).toBe(6000);
    expect(body.stats.completedTrips).toBe(60);
  });

  it("attack: 51 completed paid bookings must total 5100 / 51 trips", async () => {
    bookingsSeed = makeBookings(51);
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.totalEarnings).toBe(5100);
    expect(body.stats.completedTrips).toBe(51);
  });
});
