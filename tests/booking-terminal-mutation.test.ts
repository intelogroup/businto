import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/bookings/route";
import { NextRequest } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

// REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-06-0652; Phase 1 write core (src/lib/transitions.ts) — Businto
// PATCH /api/bookings reads the booking's current status ONLY when the
// caller requests status='cancelled' (the BUS-BOOKING-STATUS-001 guard).
// A PATCH carrying only special_instructions skips that read entirely and
// updates any own booking — including terminal completed/cancelled ones.
// Invariant: a terminal booking is immutable to rider PATCHes; any PATCH
// against a completed/cancelled booking is refused with no stored change,
// while a live confirmed booking's special_instructions update succeeds.
const USER = "11111111-1111-4111-8111-111111111111";
const BOOKING = "33333333-3333-4333-8333-333333333333";

let booking: any;
let updates: any[] = [];

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

describe("booking terminal-state mutation via field-only PATCH", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    updates = [];
    booking = { id: BOOKING, user_id: USER, status: "confirmed", special_instructions: "original" };
    mockDb();
    const { requireUser } = await import("@/lib/supabase/admin");
    (requireUser as any).mockResolvedValue({ id: USER });
  });

  it("control: special_instructions update on a live confirmed booking succeeds", async () => {
    const res = await patch({ bookingId: BOOKING, special_instructions: "window seat please" });
    expect(res.status).toBe(200);
    expect(booking.special_instructions).toBe("window seat please");
  });

  it("attack: special_instructions-only PATCH on a COMPLETED booking is refused and changes nothing", async () => {
    booking.status = "completed";
    const res = await patch({ bookingId: BOOKING, special_instructions: "rewrite history" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(booking.special_instructions).toBe("original");
    expect(updates).toHaveLength(0);
  });

  it("attack: special_instructions-only PATCH on a CANCELLED booking is refused and changes nothing", async () => {
    booking.status = "cancelled";
    const res = await patch({ bookingId: BOOKING, special_instructions: "rewrite history" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(booking.special_instructions).toBe("original");
    expect(updates).toHaveLength(0);
  });
});
