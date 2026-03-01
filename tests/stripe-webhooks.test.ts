import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/payments/webhook/route";
import { NextRequest } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";

// Mock supabaseAdmin
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

// Mock stripe
vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

describe("Stripe Webhook Idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "test_secret";
  });

  it("should skip processing if event ID already exists in webhook_events", async () => {
    const mockEvent = {
      id: "evt_123",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_123", metadata: { booking_id: "book-123" } } },
    };

    (stripe.webhooks.constructEvent as any).mockReturnValue(mockEvent);

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "webhook_events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: "existing-uuid" }, error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    });

    (supabase.from as any).mockImplementation(fromMock);

    const req = new NextRequest("http://localhost:3000/api/payments/webhook", {
      method: "POST",
      headers: { "stripe-signature": "test_sig" },
      body: JSON.stringify({}),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.duplicate).toBe(true);
    // Verify that 'bookings' update was NOT called
    expect(fromMock).not.toHaveBeenCalledWith("bookings");
  });

  it("should process and record new events", async () => {
    const mockEvent = {
      id: "evt_new",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_new", metadata: { booking_id: "book-new" } } },
    };

    (stripe.webhooks.constructEvent as any).mockReturnValue(mockEvent);

    const insertWebhookEvent = vi.fn().mockResolvedValue({ error: null });
    const updateBooking = vi.fn().mockReturnThis();
    const selectBooking = vi.fn().mockReturnThis();
    const singleBooking = vi.fn().mockResolvedValue({ 
      data: { user_id: "u1", operator_id: "o1", confirmation_code: "ABC", amount: 100 }, 
      error: null 
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "webhook_events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: insertWebhookEvent,
        };
      }
      if (table === "bookings") {
        return {
          update: updateBooking,
          select: selectBooking,
          eq: vi.fn().mockReturnThis(),
          single: singleBooking,
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    });

    const req = new NextRequest("http://localhost:3000/api/payments/webhook", {
      method: "POST",
      headers: { "stripe-signature": "test_sig" },
      body: JSON.stringify({}),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.received).toBe(true);
    expect(insertWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      stripe_event_id: "evt_new"
    }));
    expect(updateBooking).toHaveBeenCalledWith({ payment_status: 'paid' });
  });
});
