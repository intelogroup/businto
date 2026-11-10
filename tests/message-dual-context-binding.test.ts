// REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-05-1852; Phase 3 policy layer (src/lib/policy.ts) — Businto (BUS-MSG-DUAL-CONTEXT-001)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/messages/route";
import { NextRequest } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/sms", () => ({
  sendSMS: vi.fn().mockResolvedValue({ success: true }),
  smsTemplates: { newMessage: vi.fn().mockReturnValue({ content: "test" }) },
}));

// BUS probe 2026-11-05-1852: when BOTH booking_id and request_id are supplied,
// the route validates only the booking leg (if/else-if) and inserts the
// request_id unchecked. Invariant: every context id on a message must belong
// to a context both sender and recipient participate in.
const USER = "11111111-1111-4111-8111-111111111111";
const OPERATOR_PROFILE = "22222222-2222-4222-8222-222222222222";
const BOOKING = "33333333-3333-4333-8333-333333333333";
const FOREIGN_REQUEST = "44444444-4444-4444-8444-444444444444";
const OWN_REQUEST = "55555555-5555-4555-8555-555555555555";

let inserts: any[] = [];

function mockDb() {
  (supabase.from as any).mockImplementation((table: string) => {
    if (table === "bookings") return {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { user_id: USER, operator_id: OPERATOR_PROFILE }, error: null }) };
    if (table === "transport_requests") return {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      // sender owns OWN_REQUEST only; FOREIGN_REQUEST belongs to a stranger
      single: vi.fn().mockResolvedValue({ data: { user_id: USER }, error: null }) };
    if (table === "operators") return {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    if (table === "quotes") return {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    if (table === "messages") return {
      insert: vi.fn((row: any) => { inserts.push(row); return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: "msg-1", ...row }, error: null }) }; }) };
    if (table === "unified_profiles") return {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: USER, full_name: "Rider", phone: null }, error: null }) };
    return { insert: vi.fn().mockResolvedValue({ error: null }) };
  });
}

async function post(body: any) {
  const req = new NextRequest("http://localhost:3000/api/messages", { method: "POST", body: JSON.stringify(body) });
  return POST(req);
}

describe("message dual-context binding", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); inserts = []; mockDb();
    const { requireUser } = await import("@/lib/supabase/admin");
    (requireUser as any).mockResolvedValue({ id: USER });
  });

  it("control: booking-only message between booking participants succeeds", async () => {
    const res = await post({ sender_id: USER, recipient_id: OPERATOR_PROFILE, content: "hi", booking_id: BOOKING });
    expect(res.status).toBe(200);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].booking_id).toBe(BOOKING);
  });

  it("attack: booking-validated message carrying a FOREIGN request_id is refused and inserts nothing", async () => {
    const res = await post({ sender_id: USER, recipient_id: OPERATOR_PROFILE, content: "planted", booking_id: BOOKING, request_id: FOREIGN_REQUEST });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(inserts).toHaveLength(0);
  });
});
