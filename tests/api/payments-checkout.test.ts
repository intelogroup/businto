/**
 * payments-checkout.test.ts
 *
 * Tests for:
 *   POST /api/payments/booking-checkout  — Stripe Checkout Session for booking routing fee
 *   POST /api/payments/checkout-session  — Stripe Checkout Session for priority fee
 *   POST /api/payments/create-intent     — Stripe Payment Intent (off-session)
 *   POST /api/payments/seamless          — Off-session charge for saved card
 *
 * Auth pattern: these routes call createServerClient from @supabase/ssr directly
 * (not requireUser) so we mock @supabase/ssr at the module level.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Auth mock state (mutable so each test can control it) ─────────────────────
let _mockUser: object | null = null;

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockImplementation(() =>
        Promise.resolve({
          data: { user: _mockUser },
          error: _mockUser ? null : new Error("no session"),
        })
      ),
    },
  })),
}));

vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://stripe.com/pay", id: "sess_1" }) } },
    paymentIntents: {
      create: vi.fn().mockResolvedValue({ id: "pi_1", client_secret: "pi_1_secret_test" }),
      confirm: vi.fn(),
    },
    customers: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn().mockResolvedValue({ id: "cus_test" }),
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [] }),
}));

vi.mock("@/lib/email", () => ({
  getAppBaseUrl: vi.fn().mockReturnValue("https://businto.com"),
}));

vi.mock("@/lib/event-logger", () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePost(path: string, body: object) {
  return new NextRequest(`https://businto.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockChain(resolvedValue: { data?: any; error?: any }) {
  const chain: any = {};
  const methods = ["select", "insert", "update", "eq", "neq", "in", "order", "range", "single"];
  methods.forEach((m) => { chain[m] = vi.fn().mockReturnValue(chain); });
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  return chain;
}

// ── booking-checkout ──────────────────────────────────────────────────────────

describe("POST /api/payments/booking-checkout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    _mockUser = null;
  });

  it("returns 401 when unauthenticated", async () => {
    _mockUser = null;
    const { POST } = await import("@/app/api/payments/booking-checkout/route");
    const res = await POST(makePost("/api/payments/booking-checkout", { bookingId: "b-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when bookingId is missing", async () => {
    _mockUser = { id: "user-1" };
    const { POST } = await import("@/app/api/payments/booking-checkout/route");
    const res = await POST(makePost("/api/payments/booking-checkout", {}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when booking not found or not owned by user", async () => {
    _mockUser = { id: "user-1" };
    const { supabaseAdmin } = await import("@/lib/supabase-server");
    (supabaseAdmin as any).from = vi.fn().mockReturnValue(
      mockChain({ data: null, error: new Error("not found") })
    );

    const { POST } = await import("@/app/api/payments/booking-checkout/route");
    const res = await POST(makePost("/api/payments/booking-checkout", { bookingId: "no-such-booking" }));
    expect(res.status).toBe(404);
  });
});

// ── checkout-session ──────────────────────────────────────────────────────────

describe("POST /api/payments/checkout-session", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    _mockUser = null;
  });

  it("returns 401 when unauthenticated", async () => {
    _mockUser = null;
    const { POST } = await import("@/app/api/payments/checkout-session/route");
    const res = await POST(makePost("/api/payments/checkout-session", { requestId: "req-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when requestId is missing", async () => {
    _mockUser = { id: "user-1" };
    const { POST } = await import("@/app/api/payments/checkout-session/route");
    const res = await POST(makePost("/api/payments/checkout-session", {}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when transport request not found", async () => {
    _mockUser = { id: "user-1" };
    const { supabaseAdmin } = await import("@/lib/supabase-server");
    (supabaseAdmin as any).from = vi.fn().mockReturnValue(
      mockChain({ data: null, error: new Error("not found") })
    );

    const { POST } = await import("@/app/api/payments/checkout-session/route");
    const res = await POST(makePost("/api/payments/checkout-session", { requestId: "no-such-req" }));
    expect(res.status).toBe(404);
  });
});

// ── create-intent ─────────────────────────────────────────────────────────────

describe("POST /api/payments/create-intent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    _mockUser = null;
  });

  it("returns 401 when unauthenticated", async () => {
    _mockUser = null;
    const { POST } = await import("@/app/api/payments/create-intent/route");
    const res = await POST(makePost("/api/payments/create-intent", { bookingId: "b-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when bookingId is missing", async () => {
    _mockUser = { id: "user-1" };
    const { POST } = await import("@/app/api/payments/create-intent/route");
    const res = await POST(makePost("/api/payments/create-intent", {}));
    expect(res.status).toBe(400);
  });
});

// ── seamless ──────────────────────────────────────────────────────────────────

describe("POST /api/payments/seamless", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    _mockUser = null;
  });

  it("returns requires_payment_method when unauthenticated (graceful fallback)", async () => {
    // seamless endpoint uses status field rather than HTTP 401 for auth failure
    _mockUser = null;
    const { POST } = await import("@/app/api/payments/seamless/route");
    const res = await POST(makePost("/api/payments/seamless", { bookingId: "b-1" }));
    const json = await res.json();
    // Either HTTP fallback or status field must signal auth failure
    expect(json.status === "requires_payment_method" || res.status >= 400).toBe(true);
  });

  it("returns 400 when bookingId is missing and authenticated", async () => {
    _mockUser = { id: "user-1" };
    const { supabaseAdmin } = await import("@/lib/supabase-server");
    (supabaseAdmin as any).from = vi.fn().mockReturnValue(
      mockChain({ data: null, error: null })
    );

    const { POST } = await import("@/app/api/payments/seamless/route");
    const res = await POST(makePost("/api/payments/seamless", {}));
    expect(res.status).toBe(400);
  });
});
