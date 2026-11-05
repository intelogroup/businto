import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// BUS-REREQUEST-ORACLE-001: GET /api/trips/[id]/re-request must check
// ownership before trip status. A non-owner gets one uniform response for a
// foreign trip regardless of its status; before the fix, the M9 status gate
// ran first (completed → 403, pending → 400), leaking the status class.

const OWNER = "owner-user";
const ATTACKER = "attacker-user";
let currentUser: string = OWNER;
let tripStatus: string = "completed";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: currentUser } }, error: null })) },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn(async () => {}) }));

import { GET } from "@/app/api/trips/[id]/re-request/route";
import { supabaseAdmin } from "@/lib/supabase/admin";

function chain() {
  const c: any = {
    select: vi.fn(() => c),
    eq: vi.fn(() => c),
    single: vi.fn(async () => ({
      data: {
        id: "trip-1", status: tripStatus, service_type: "school",
        pickup_address: "1 Exact St, Everett, MA", dropoff_address: "2 Exact St, Boston, MA",
        pickup_fuzzy: "Everett", dropoff_fuzzy: "Boston",
        start_date: "2026-01-01", start_time: "08:00", end_date: "2026-01-01", end_time: "09:00",
        is_recurring: false, recurrence_pattern: null, metadata_safe: {}, user_id: OWNER,
      },
      error: null,
    })),
  };
  return c;
}

async function get() {
  (supabaseAdmin.from as any).mockImplementation(() => chain());
  const req = new NextRequest("http://localhost:3000/api/trips/trip-1/re-request");
  return GET(req, { params: Promise.resolve({ id: "trip-1" }) });
}

describe("re-request route — ownership before status (BUS-REREQUEST-ORACLE-001)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("owner of a completed trip gets 200 with prefill data", async () => {
    currentUser = OWNER; tripStatus = "completed";
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trip?.id).toBe("trip-1");
  });

  it("owner of a cancelled trip gets 200 with prefill data", async () => {
    currentUser = OWNER; tripStatus = "cancelled";
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trip?.id).toBe("trip-1");
  });

  it("owner of a pending trip gets 400 (status gate applies to the owner)", async () => {
    currentUser = OWNER; tripStatus = "pending";
    const res = await get();
    expect(res.status).toBe(400);
  });

  it("non-owner response is identical for completed, cancelled, and pending foreign trips", async () => {
    currentUser = ATTACKER;
    const seen: Array<{ status: number; error: any; trip: any }> = [];
    for (const status of ["completed", "cancelled", "pending"]) {
      tripStatus = status;
      const res = await get();
      const body = await res.json();
      seen.push({ status: res.status, error: body.error, trip: body.trip });
    }
    for (const leg of seen) {
      expect(leg.status).toBe(403);
      expect(leg.trip).toBeUndefined();
    }
    expect(seen[1].error).toBe(seen[0].error);
    expect(seen[2].error).toBe(seen[0].error);
  });
});
