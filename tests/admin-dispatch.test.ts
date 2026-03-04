/**
 * admin-dispatch.test.ts
 *
 * Comprehensive tests for all admin dispatch & PII exchange endpoints:
 *   GET  /api/master/admin/dispatch   — mode flag + operator list
 *   POST /api/master/admin/dispatch   — toggle | send | create_and_send | create_quote | send_operator_details
 *   GET  /api/master/admin/exchanges  — pending PII exchange queue
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as dispatchGET,
  POST as dispatchPOST,
} from "@/app/api/master/admin/dispatch/route";
import { GET as exchangesGET } from "@/app/api/master/admin/exchanges/route";
import { supabaseAdmin } from "@/lib/supabase-server";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: { from: vi.fn(), auth: { admin: { createUser: vi.fn() } } },
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  emailTemplates: {
    operatorNewRequest: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
    adminDispatchedNotification: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
    quoteReceived: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
    quotesBulkReceived: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
    operatorOrderDetails: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
  },
  getAppBaseUrl: vi.fn().mockReturnValue("https://businto.com"),
}));

vi.mock("@/lib/email-helpers", () => ({
  generateOperatorQuoteLink: vi.fn().mockResolvedValue("https://businto.com/claim/abc"),
}));

vi.mock("@/lib/operator-matching", () => ({
  extractRequirements: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/event-logger", () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const { requireAdmin } = await import("@/lib/supabase-server");

const ADMIN = { id: "admin-uuid" };

const MOCK_REQUEST = {
  id: "req-1",
  service_type: "school",
  pickup_address: "123 Main St, Boston, MA",
  dropoff_address: "456 School Ave, Boston, MA",
  pickup_fuzzy: "Boston, MA",
  dropoff_fuzzy: "Boston, MA",
  start_date: "2026-04-01",
  start_time: "08:00",
  status: "pending",
  user_id: "user-1",
  metadata_safe: {},
  metadata_private: { parent_name: "Jane Doe", parent_phone: "555-0001", parent_email: "jane@example.com" },
};

const MOCK_OPERATOR = {
  id: "op-1",
  company_name: "Metro Transit",
  company_email: "ops@metro.com",
  is_partner: true,
  is_verified: true,
};

const MOCK_USER_PROFILE = {
  email: "user@example.com",
  full_name: "Test User",
  phone: "555-9999",
};

const MOCK_BOOKING = {
  id: "booking-1",
  confirmation_code: "BUS-001",
  amount: 350,
  request_id: "req-1",
  operator_id: "op-1",
  user_id: "user-1",
  transport_requests: MOCK_REQUEST,
  quotes: { vehicle_type: "school_bus" },
  operators: MOCK_OPERATOR,
};

/** Build a chainable Supabase mock that resolves with the given data/error */
function mockChain(resolvedValue: { data?: any; error?: any; count?: number }) {
  const chain: any = {};
  const methods = [
    "select", "insert", "update", "upsert", "delete",
    "eq", "neq", "in", "order", "range", "maybeSingle", "single",
  ];
  methods.forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });
  // Terminal methods resolve
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockResolvedValue(resolvedValue);
  // Allow re-chaining after terminal
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockResolvedValue(resolvedValue);
  // Default array resolve
  chain._ = resolvedValue;
  return chain;
}

function postReq(body: object) {
  return new NextRequest("http://localhost/api/master/admin/dispatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getReq(url = "http://localhost/api/master/admin/dispatch") {
  return new NextRequest(url, { method: "GET" });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /dispatch — mode flag + operator list
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/master/admin/dispatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks non-admin (403)", async () => {
    (requireAdmin as any).mockResolvedValue(null);
    const res = await dispatchGET(getReq());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  /**
   * The GET /dispatch route ends the operators query with two chained .order() calls.
   * The SECOND .order() is the terminal — it must resolve as a promise.
   */
  function makeOperatorsChain(data: any[]) {
    const chain: any = { select: vi.fn().mockReturnThis() };
    let orderCount = 0;
    chain.order = vi.fn().mockImplementation(() => {
      orderCount++;
      // First .order() returns chain; second .order() resolves
      return orderCount < 2 ? chain : Promise.resolve({ data, error: null });
    });
    return chain;
  }

  it("returns manualDispatchMode=false when setting is absent", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const settingChain = mockChain({ data: null, error: null });
    const operatorsChain = makeOperatorsChain([MOCK_OPERATOR]);

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === "app_settings") return settingChain;
      if (table === "operators") return operatorsChain;
    });

    const res = await dispatchGET(getReq());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.manualDispatchMode).toBe(false);
    expect(json.operators).toHaveLength(1);
  });

  it("returns manualDispatchMode=true when setting value is true", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const settingChain = mockChain({ data: { value: true }, error: null });
    const operatorsChain = makeOperatorsChain([]);

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === "app_settings") return settingChain;
      if (table === "operators") return operatorsChain;
    });

    const res = await dispatchGET(getReq());
    expect((await res.json()).manualDispatchMode).toBe(true);
  });

  it("returns empty operator list when no operators exist", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const settingChain = mockChain({ data: null, error: null });
    const operatorsChain = makeOperatorsChain([]);

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === "app_settings") return settingChain;
      if (table === "operators") return operatorsChain;
    });

    const res = await dispatchGET(getReq());
    expect((await res.json()).operators).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. POST /dispatch — action: toggle
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /dispatch — action: toggle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks non-admin (403)", async () => {
    (requireAdmin as any).mockResolvedValue(null);
    const res = await dispatchPOST(postReq({ action: "toggle", enabled: true }));
    expect(res.status).toBe(403);
  });

  it("enables manual dispatch mode", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const upsertChain = mockChain({ data: null, error: null });
    (supabaseAdmin.from as any).mockReturnValue(upsertChain);

    const res = await dispatchPOST(postReq({ action: "toggle", enabled: true }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.manualDispatchMode).toBe(true);
  });

  it("disables manual dispatch mode", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const upsertChain = mockChain({ data: null, error: null });
    (supabaseAdmin.from as any).mockReturnValue(upsertChain);

    const res = await dispatchPOST(postReq({ action: "toggle", enabled: false }));
    expect((await res.json()).manualDispatchMode).toBe(false);
  });

  it("returns 500 when upsert fails", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const upsertChain = mockChain({ data: null, error: { message: "DB error" } });
    (supabaseAdmin.from as any).mockReturnValue(upsertChain);

    const res = await dispatchPOST(postReq({ action: "toggle", enabled: true }));
    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. POST /dispatch — action: send
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /dispatch — action: send", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks non-admin", async () => {
    (requireAdmin as any).mockResolvedValue(null);
    const res = await dispatchPOST(postReq({ action: "send", requestId: "r1", operatorId: "o1" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when requestId is missing", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const res = await dispatchPOST(postReq({ action: "send", operatorId: "o1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when operatorId is missing", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const res = await dispatchPOST(postReq({ action: "send", requestId: "r1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when request is not found", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const chain = mockChain({ data: null, error: { message: "Not found" } });
    (supabaseAdmin.from as any).mockReturnValue(chain);

    const res = await dispatchPOST(postReq({ action: "send", requestId: "r-bad", operatorId: "o1" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Request not found");
  });

  it("returns 404 when operator is not found", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation(() => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_REQUEST, error: null });
      return mockChain({ data: null, error: { message: "Not found" } });
    });

    const res = await dispatchPOST(postReq({ action: "send", requestId: "req-1", operatorId: "op-bad" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Operator not found");
  });

  it("sends email and returns sentTo on success", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const { sendEmail } = await import("@/lib/email");
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation(() => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_REQUEST, error: null });
      if (call === 2) return mockChain({ data: MOCK_OPERATOR, error: null });
      return mockChain({ data: null, error: null }); // logEvent fallback
    });

    const res = await dispatchPOST(postReq({ action: "send", requestId: "req-1", operatorId: "op-1" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.sentTo).toBe("ops@metro.com");
    expect(sendEmail).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /dispatch — action: create_and_send
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /dispatch — action: create_and_send", () => {
  const validOp = {
    company_name: "New Bus Co",
    company_email: "newbus@co.com",
    company_phone: "555-1234",
    vehicle_types: ["school_bus"],
    is_partner: false,
  };

  beforeEach(() => vi.clearAllMocks());

  it("blocks non-admin", async () => {
    (requireAdmin as any).mockResolvedValue(null);
    const res = await dispatchPOST(postReq({ action: "create_and_send", requestId: "r1", operator: validOp }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when operator fields are missing", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const res = await dispatchPOST(postReq({
      action: "create_and_send",
      requestId: "r1",
      operator: { company_name: "X" }, // missing email & phone
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when requestId is missing", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const res = await dispatchPOST(postReq({ action: "create_and_send", operator: validOp }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when request is not found", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    (supabaseAdmin.from as any).mockReturnValue(mockChain({ data: null, error: { message: "Not found" } }));
    const res = await dispatchPOST(postReq({ action: "create_and_send", requestId: "bad-req", operator: validOp }));
    expect(res.status).toBe(404);
  });

  it("reuses existing operator (idempotency)", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const { sendEmail } = await import("@/lib/email");
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_REQUEST, error: null }); // transport_requests
      if (call === 2) return mockChain({ data: MOCK_OPERATOR, error: null }); // existing operator check
      return mockChain({ data: MOCK_USER_PROFILE, error: null }); // unified_profiles
    });

    const res = await dispatchPOST(postReq({ action: "create_and_send", requestId: "req-1", operator: validOp }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.isNewOperator).toBeFalsy();
    // No auth.admin.createUser for existing operator
    expect((supabaseAdmin as any).auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("creates new operator when email does not exist", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const NEW_AUTH_USER = { id: "auth-new" };
    (supabaseAdmin as any).auth.admin.createUser = vi.fn().mockResolvedValue({
      data: { user: NEW_AUTH_USER },
      error: null,
    });

    let call = 0;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_REQUEST, error: null }); // request
      if (call === 2) return mockChain({ data: null, error: null });          // no existing operator
      if (call === 3) return mockChain({ data: null, error: null });          // profile upsert
      if (call === 4) return mockChain({ data: { id: "op-new" }, error: null }); // operator insert
      return mockChain({ data: MOCK_USER_PROFILE, error: null });             // user profile
    });

    const res = await dispatchPOST(postReq({ action: "create_and_send", requestId: "req-1", operator: validOp }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.isNewOperator).toBe(true);
    expect(json.operatorId).toBe("op-new");
  });

  it("returns 500 when auth user creation fails", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    (supabaseAdmin as any).auth.admin.createUser = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Auth error" },
    });

    let call = 0;
    (supabaseAdmin.from as any).mockImplementation(() => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_REQUEST, error: null });
      return mockChain({ data: null, error: null }); // no existing operator
    });

    const res = await dispatchPOST(postReq({ action: "create_and_send", requestId: "req-1", operator: validOp }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Failed to create auth user/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. POST /dispatch — action: create_quote
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /dispatch — action: create_quote", () => {
  const baseBody = {
    action: "create_quote",
    requestId: "req-1",
    operatorId: "op-1",
    price: 350,
    vehicleType: "school_bus",
  };

  beforeEach(() => vi.clearAllMocks());

  it("blocks non-admin (403)", async () => {
    (requireAdmin as any).mockResolvedValue(null);
    const res = await dispatchPOST(postReq(baseBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 when price is missing", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const res = await dispatchPOST(postReq({ ...baseBody, price: undefined }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/price/i);
  });

  it("returns 400 when vehicleType is missing", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const res = await dispatchPOST(postReq({ ...baseBody, vehicleType: undefined }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when requestId is missing", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const res = await dispatchPOST(postReq({ ...baseBody, requestId: undefined }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when operatorId is missing", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const res = await dispatchPOST(postReq({ ...baseBody, operatorId: undefined }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when request is not found", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    (supabaseAdmin.from as any).mockReturnValue(mockChain({ data: null, error: { message: "Not found" } }));
    const res = await dispatchPOST(postReq(baseBody));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Request not found");
  });

  it("returns 404 when operator is not found", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation(() => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_REQUEST, error: null });
      return mockChain({ data: null, error: { message: "Not found" } });
    });
    const res = await dispatchPOST(postReq(baseBody));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Operator not found");
  });

  it("creates quote and returns quoteId", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const { sendEmail } = await import("@/lib/email");
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_REQUEST, error: null });       // transport_requests
      if (call === 2) return mockChain({ data: MOCK_OPERATOR, error: null });      // operators
      if (call === 3) return mockChain({ data: { id: "quote-99" }, error: null }); // quotes insert
      if (call === 4) return mockChain({ data: null, error: null });               // update request status
      if (call === 5) return mockChain({ data: MOCK_USER_PROFILE, error: null });  // unified_profiles
      return mockChain({ data: null, error: null });
    });

    const res = await dispatchPOST(postReq(baseBody));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.quoteId).toBe("quote-99");
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("creates quote with optional note", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation(() => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_REQUEST, error: null });
      if (call === 2) return mockChain({ data: MOCK_OPERATOR, error: null });
      if (call === 3) return mockChain({ data: { id: "quote-88" }, error: null });
      if (call === 4) return mockChain({ data: null, error: null });
      if (call === 5) return mockChain({ data: MOCK_USER_PROFILE, error: null });
      return mockChain({ data: null, error: null });
    });

    const res = await dispatchPOST(postReq({ ...baseBody, note: "Price includes fuel" }));
    expect(res.status).toBe(200);
    expect((await res.json()).quoteId).toBe("quote-88");
  });

  it("skips user notification when user_id is absent", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const { sendEmail } = await import("@/lib/email");
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation(() => {
      call++;
      if (call === 1) return mockChain({ data: { ...MOCK_REQUEST, user_id: null }, error: null });
      if (call === 2) return mockChain({ data: MOCK_OPERATOR, error: null });
      if (call === 3) return mockChain({ data: { id: "quote-77" }, error: null });
      if (call === 4) return mockChain({ data: null, error: null });
      return mockChain({ data: null, error: null });
    });

    const res = await dispatchPOST(postReq(baseBody));
    expect(res.status).toBe(200);
    // No email sent when user_id is null
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 500 when quote insert fails", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation(() => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_REQUEST, error: null });
      if (call === 2) return mockChain({ data: MOCK_OPERATOR, error: null });
      return mockChain({ data: null, error: { message: "Insert failed" } });
    });

    const res = await dispatchPOST(postReq(baseBody));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Failed to create quote/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. POST /dispatch — action: send_operator_details (PII exchange)
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /dispatch — action: send_operator_details", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks non-admin (403)", async () => {
    (requireAdmin as any).mockResolvedValue(null);
    const res = await dispatchPOST(postReq({ action: "send_operator_details", bookingId: "b1" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when bookingId is missing", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const res = await dispatchPOST(postReq({ action: "send_operator_details" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/bookingId/);
  });

  it("returns 404 when booking is not found or already exchanged", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    (supabaseAdmin.from as any).mockReturnValue(mockChain({ data: null, error: { message: "Not found" } }));
    const res = await dispatchPOST(postReq({ action: "send_operator_details", bookingId: "bad-booking" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found or already exchanged/i);
  });

  it("sends PII email and marks exchange complete", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const { sendEmail } = await import("@/lib/email");
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_BOOKING, error: null });      // bookings
      if (call === 2) return mockChain({ data: MOCK_USER_PROFILE, error: null }); // unified_profiles
      if (call === 3) return mockChain({ data: null, error: null });              // update requires_manual_exchange
      return mockChain({ data: null, error: null });
    });

    const res = await dispatchPOST(postReq({ action: "send_operator_details", bookingId: "booking-1" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.sentTo).toBe("ops@metro.com");
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("uses metadata_private PII over profile data when available", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const { emailTemplates } = await import("@/lib/email");
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation(() => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_BOOKING, error: null });
      if (call === 2) return mockChain({ data: MOCK_USER_PROFILE, error: null });
      return mockChain({ data: null, error: null });
    });

    await dispatchPOST(postReq({ action: "send_operator_details", bookingId: "booking-1" }));

    // emailTemplates.operatorOrderDetails should be called with private metadata PII
    expect(emailTemplates.operatorOrderDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        parentName: "Jane Doe",
        parentPhone: "555-0001",
        parentEmail: "jane@example.com",
      })
    );
  });

  it("falls back to profile data when metadata_private has no PII fields", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const { emailTemplates } = await import("@/lib/email");
    const bookingNoPii = {
      ...MOCK_BOOKING,
      transport_requests: { ...MOCK_REQUEST, metadata_private: {} },
    };
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation(() => {
      call++;
      if (call === 1) return mockChain({ data: bookingNoPii, error: null });
      if (call === 2) return mockChain({ data: MOCK_USER_PROFILE, error: null });
      return mockChain({ data: null, error: null });
    });

    await dispatchPOST(postReq({ action: "send_operator_details", bookingId: "booking-1" }));

    expect(emailTemplates.operatorOrderDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        parentName: "Test User",
        parentEmail: "user@example.com",
        parentPhone: "555-9999",
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6b. POST /dispatch — action: create_quotes_bulk
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_OP_2 = {
  id: "op-2",
  company_name: "City Wheels",
  company_email: "ops@citywheels.com",
  is_partner: false,
  is_verified: true,
};

const BULK_BODY = {
  action: "create_quotes_bulk",
  requestId: "req-1",
  quotes: [
    { operatorId: "op-1", price: 350, vehicleType: "school_bus" },
    { operatorId: "op-2", price: 300, vehicleType: "mini_bus", note: "Includes tolls" },
  ],
};

/**
 * Build a chain where `.in()` is the terminal resolver (used by the operators bulk fetch).
 */
function makeInChain(resolvedValue: { data?: any; error?: any }) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockResolvedValue(resolvedValue);
  return chain;
}

/**
 * Build a chain where `.select()` after `.insert()` is the terminal resolver (used by quotes batch insert).
 */
function makeInsertSelectChain(resolvedValue: { data?: any; error?: any }) {
  const chain: any = {};
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockResolvedValue(resolvedValue);
  return chain;
}

describe("POST /dispatch — action: create_quotes_bulk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks non-admin (403)", async () => {
    (requireAdmin as any).mockResolvedValue(null);
    const res = await dispatchPOST(postReq(BULK_BODY));
    expect(res.status).toBe(403);
  });

  it("returns 400 when quotes array is empty", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const res = await dispatchPOST(postReq({ ...BULK_BODY, quotes: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/non-empty/i);
  });

  it("returns 400 when quotes is not an array", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const res = await dispatchPOST(postReq({ ...BULK_BODY, quotes: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when requestId is missing", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const { requestId: _, ...body } = BULK_BODY as any;
    const res = await dispatchPOST(postReq(body));
    expect(res.status).toBe(400);
  });

  it("returns 404 when request is not found", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    (supabaseAdmin.from as any).mockReturnValue(
      mockChain({ data: null, error: { message: "Not found" } })
    );
    const res = await dispatchPOST(postReq(BULK_BODY));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Request not found");
  });

  it("returns 404 when one operator is missing (count mismatch)", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_REQUEST, error: null }); // request
      // operators: only 1 returned, but 2 requested
      if (call === 2) return makeInChain({ data: [MOCK_OPERATOR], error: null });
      return mockChain({ data: null, error: null });
    });
    const res = await dispatchPOST(postReq(BULK_BODY));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found/i);
  });

  it("returns 500 when batch quote insert fails", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_REQUEST, error: null });
      if (call === 2) return makeInChain({ data: [MOCK_OPERATOR, MOCK_OP_2], error: null });
      if (call === 3) return makeInsertSelectChain({ data: null, error: { message: "Insert failed" } });
      return mockChain({ data: null, error: null });
    });
    const res = await dispatchPOST(postReq(BULK_BODY));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Failed to create quotes/);
  });

  it("inserts all quotes and sends one consolidated email", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const { sendEmail, emailTemplates } = await import("@/lib/email");
    const createdQuotes = [
      { id: "q-1", operator_id: "op-1" },
      { id: "q-2", operator_id: "op-2" },
    ];
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_REQUEST, error: null });          // transport_requests
      if (call === 2) return makeInChain({ data: [MOCK_OPERATOR, MOCK_OP_2], error: null }); // operators
      if (call === 3) return makeInsertSelectChain({ data: createdQuotes, error: null }); // quotes batch insert
      if (call === 4) return mockChain({ data: null, error: null });                  // update request status
      if (call === 5) return mockChain({ data: MOCK_USER_PROFILE, error: null });     // unified_profiles
      return mockChain({ data: null, error: null });
    });

    const res = await dispatchPOST(postReq(BULK_BODY));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.quoteIds).toEqual(["q-1", "q-2"]);

    // Exactly ONE email to the user
    expect(sendEmail).toHaveBeenCalledOnce();

    // Email used the bulk template, not quoteReceived
    expect(emailTemplates.quotesBulkReceived).toHaveBeenCalledOnce();
    expect(emailTemplates.quoteReceived).not.toHaveBeenCalled();

    // Template received both quotes
    expect(emailTemplates.quotesBulkReceived).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        quotes: expect.arrayContaining([
          expect.objectContaining({ operatorName: "Metro Transit", price: 350 }),
          expect.objectContaining({ operatorName: "City Wheels", price: 300 }),
        ]),
      })
    );
  });

  it("returns all quoteIds on success (single-quote bulk)", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const singleQuote = [{ id: "q-solo", operator_id: "op-1" }];
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_REQUEST, error: null });
      if (call === 2) return makeInChain({ data: [MOCK_OPERATOR], error: null });
      if (call === 3) return makeInsertSelectChain({ data: singleQuote, error: null });
      if (call === 4) return mockChain({ data: null, error: null });
      if (call === 5) return mockChain({ data: MOCK_USER_PROFILE, error: null });
      return mockChain({ data: null, error: null });
    });

    const singleBulk = {
      ...BULK_BODY,
      quotes: [{ operatorId: "op-1", price: 275, vehicleType: "van" }],
    };
    const res = await dispatchPOST(postReq(singleBulk));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.quoteIds).toEqual(["q-solo"]);
  });

  it("skips user email when user_id is absent", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const { sendEmail } = await import("@/lib/email");
    const createdQuotes = [{ id: "q-1", operator_id: "op-1" }, { id: "q-2", operator_id: "op-2" }];
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      call++;
      if (call === 1) return mockChain({ data: { ...MOCK_REQUEST, user_id: null }, error: null });
      if (call === 2) return makeInChain({ data: [MOCK_OPERATOR, MOCK_OP_2], error: null });
      if (call === 3) return makeInsertSelectChain({ data: createdQuotes, error: null });
      if (call === 4) return mockChain({ data: null, error: null });
      return mockChain({ data: null, error: null });
    });
    const res = await dispatchPOST(postReq(BULK_BODY));
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("moves request to quoted status exactly once", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const updateChain = mockChain({ data: null, error: null });
    const createdQuotes = [{ id: "q-1", operator_id: "op-1" }, { id: "q-2", operator_id: "op-2" }];
    let call = 0;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      call++;
      if (call === 1) return mockChain({ data: MOCK_REQUEST, error: null });
      if (call === 2) return makeInChain({ data: [MOCK_OPERATOR, MOCK_OP_2], error: null });
      if (call === 3) return makeInsertSelectChain({ data: createdQuotes, error: null });
      if (call === 4) return updateChain; // status update
      if (call === 5) return mockChain({ data: MOCK_USER_PROFILE, error: null });
      return mockChain({ data: null, error: null });
    });

    await dispatchPOST(postReq(BULK_BODY));

    // update was called exactly once for transport_requests
    expect(updateChain.update).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. POST /dispatch — invalid action
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /dispatch — invalid action", () => {
  it("returns 400 for unknown action", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const res = await dispatchPOST(postReq({ action: "do_something_weird" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid action");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. GET /api/master/admin/exchanges
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/master/admin/exchanges", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks non-admin (403)", async () => {
    (requireAdmin as any).mockResolvedValue(null);
    const res = await exchangesGET(getReq("http://localhost/api/master/admin/exchanges"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  it("returns empty array when no pending exchanges", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const chain = mockChain({ data: [], error: null });
    chain.order = vi.fn().mockResolvedValue({ data: [], error: null });
    (supabaseAdmin.from as any).mockReturnValue(chain);

    const res = await exchangesGET(getReq("http://localhost/api/master/admin/exchanges"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.exchanges).toHaveLength(0);
  });

  it("returns pending exchanges with related data", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const EXCHANGES = [MOCK_BOOKING, { ...MOCK_BOOKING, id: "booking-2" }];
    const chain = mockChain({ data: EXCHANGES, error: null });
    chain.order = vi.fn().mockResolvedValue({ data: EXCHANGES, error: null });
    (supabaseAdmin.from as any).mockReturnValue(chain);

    const res = await exchangesGET(getReq("http://localhost/api/master/admin/exchanges"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.exchanges).toHaveLength(2);
  });

  it("returns 500 on database error", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    const chain = mockChain({ data: null, error: { message: "connection failed" } });
    chain.order = vi.fn().mockResolvedValue({ data: null, error: { message: "connection failed" } });
    (supabaseAdmin.from as any).mockReturnValue(chain);

    const res = await exchangesGET(getReq("http://localhost/api/master/admin/exchanges"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("connection failed");
  });

  it("only returns bookings where requires_manual_exchange is true", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    // The route uses .eq('requires_manual_exchange', true) — verify the chain receives it
    const chain: any = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn() };
    chain.order.mockResolvedValue({ data: [MOCK_BOOKING], error: null });
    (supabaseAdmin.from as any).mockReturnValue(chain);

    await exchangesGET(getReq("http://localhost/api/master/admin/exchanges"));

    expect(chain.eq).toHaveBeenCalledWith("requires_manual_exchange", true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Security — PII must not leak via wrong action path
// ─────────────────────────────────────────────────────────────────────────────

describe("PII gate — send_operator_details must require requires_manual_exchange=true", () => {
  it("returns 404 for booking where requires_manual_exchange is false", async () => {
    (requireAdmin as any).mockResolvedValue(ADMIN);
    // Simulate booking found but exchange already done (requires_manual_exchange was set to false)
    // The route uses .eq('requires_manual_exchange', true) — if false, single() returns null
    (supabaseAdmin.from as any).mockReturnValue(
      mockChain({ data: null, error: { message: "No rows returned" } })
    );

    const res = await dispatchPOST(postReq({ action: "send_operator_details", bookingId: "already-done" }));
    expect(res.status).toBe(404);
  });
});
