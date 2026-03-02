import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/payments/webhook/route";
import { NextRequest } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";

// Mock dependencies
vi.mock("@/lib/supabase-server", () => ({
    supabaseAdmin: {
        from: vi.fn(),
    },
}));

vi.mock("@/lib/stripe", () => ({
    stripe: {
        webhooks: {
            constructEvent: vi.fn(),
        },
    },
}));

// We need to mock the dynamic import of @/lib/email
vi.mock("@/lib/email", () => ({
    sendEmail: vi.fn(),
    getAppBaseUrl: vi.fn().mockReturnValue('https://businto.com'),
    emailTemplates: {
        operatorOrderDetails: vi.fn().mockReturnValue({ subject: "Reveal", html: "<p>PII</p>" }),
    },
}));

describe("Booking Security: PII Reveal Webhook", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.STRIPE_WEBHOOK_SECRET = "test_secret";
    });

    const createMockQuery = (data: any = {}) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data, error: null }),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ error: null }),
        order: vi.fn().mockReturnThis(),
    });

    it("should trigger PII reveal email ONLY on payment_intent.succeeded", async () => {
        const mockEvent = {
            id: "evt_pii",
            type: "payment_intent.succeeded",
            data: { object: { id: "pi_pii", metadata: { booking_id: "book-pii" } } },
        };

        (stripe.webhooks.constructEvent as any).mockReturnValue(mockEvent);

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === "webhook_events") {
                return createMockQuery(null); // No existing event
            }
            if (table === "bookings") {
                return createMockQuery({
                    id: "book-pii",
                    user_id: "u1",
                    operator_id: "o1",
                    confirmation_code: "ABC",
                    amount: 100,
                    request: {
                        id: "req-1",
                        pickup_address: "123 Main St",
                        metadata_private: { contact_name: "John Doe", contact_phone: "555-1234" }
                    },
                    operator: { company_email: "operator@example.com", company_name: "Fleet Co" },
                    user: { email: "parent@example.com", full_name: "John Parent", phone: "555-0000" }
                });
            }
            return createMockQuery({});
        });

        const req = new NextRequest("http://localhost:3000/api/payments/webhook", {
            method: "POST",
            headers: { "stripe-signature": "test_sig" },
            body: JSON.stringify({}),
        });

        const response = await POST(req);
        expect(response.status).toBe(200);

        const { sendEmail } = await import("@/lib/email");
        expect(sendEmail).toHaveBeenCalled();
    });

    it("should NOT trigger PII reveal on payment_intent.payment_failed", async () => {
        const mockEvent = {
            id: "evt_fail",
            type: "payment_intent.payment_failed",
            data: { object: { id: "pi_fail", metadata: { booking_id: "book-fail" } } },
        };

        (stripe.webhooks.constructEvent as any).mockReturnValue(mockEvent);

        (supabase.from as any).mockImplementation(() => createMockQuery({}));

        const req = new NextRequest("http://localhost:3000/api/payments/webhook", {
            method: "POST",
            headers: { "stripe-signature": "test_sig" },
            body: JSON.stringify({}),
        });

        await POST(req);

        const { sendEmail } = await import("@/lib/email");
        expect(sendEmail).not.toHaveBeenCalled();
    });
});
