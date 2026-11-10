import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/bookings/route";
import { NextRequest } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

// REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-07-0952; Phase 1 write core (src/lib/transitions.ts) — Businto
// PATCH /api/bookings cancel path (BUS-BOOKING-STATUS-001 guard): the handler
// READS the booking status, refuses unless it is 'confirmed', then UPDATEs
// by id + user_id ONLY — no status predicate on the write. The completion
// cron can land 'completed' between the read and the write; the cancel then
// overwrites the terminal state.
// Invariant: a booking that is 'completed' at write time must not be moved
// to 'cancelled'; the terminal state survives a racing cancel.
// Mock semantics: selects snapshot the row state at read time; the update
// applies to the row matched by id+user_id regardless of status (exactly
// the real query's predicates). The interleaved completion is applied at
// the moment the update executes, i.e. inside the read->write window.
const USER = "11111111-1111-4111-8111-111111111111";
const BOOKING = "33333333-3333-4333-8333-333333333333";

let booking: any;
let updates: any[] = [];
let interleaveCompletion = false;

function mockDb() {
  (supabase.from as any).mockImplementation((table: string) => {
    if (table !== "bookings") throw new Error("unexpected table " + table);
    return {
      select: vi.fn(() => ({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({ data: { status: booking.status }, error: null })),
      })),
      update: vi.fn((data: any) => {
        updates.push(data);
        return {
          eq: vi.fn().mockReturnThis(),
          select: vi.fn(() => ({
            single: vi.fn(async () => {
              if (interleaveCompletion) {
                // Completion cron lands first, inside the window.
                booking.status = "completed";
                interleaveCompletion = false;
              }
              Object.assign(booking, data);
              return { data: { ...booking }, error: null };
            }),
          })),
        };
      }),
    };
  });
}

async function patch(body: any) {
  const req = new NextRequest("http://localhost:3000/api/bookings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return PATCH(req);
}

describe("booking cancel vs completion race (check-then-act on status guard)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    updates = [];
    interleaveCompletion = false;
    booking = { id: BOOKING, user_id: USER, status: "confirmed", special_instructions: "original" };
    mockDb();
    const { requireUser } = await import("@/lib/supabase/admin");
    (requireUser as any).mockResolvedValue({ id: USER });
  });

  it("control: cancel of a live confirmed booking succeeds", async () => {
    const res = await patch({ bookingId: BOOKING, status: "cancelled" });
    expect(res.status).toBe(200);
    expect(booking.status).toBe("cancelled");
  });

  it("control: cancel of an already-completed booking is refused 409 sequentially", async () => {
    booking.status = "completed";
    const res = await patch({ bookingId: BOOKING, status: "cancelled" });
    expect(res.status).toBe(409);
    expect(booking.status).toBe("completed");
    expect(updates).toHaveLength(0);
  });

  it("attack: completion landing between the status read and the cancel write must survive", async () => {
    interleaveCompletion = true;
    const res = await patch({ bookingId: BOOKING, status: "cancelled" });
    // Invariant: terminal 'completed' state is not overwritten by the race.
    expect(booking.status).toBe("completed");
  });
});
