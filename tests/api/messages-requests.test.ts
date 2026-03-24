/**
 * messages-requests.test.ts
 *
 * Tests for:
 *   POST /api/messages  — send a message (auth-required, sender_id ownership check)
 *   GET  /api/messages  — fetch messages (auth-required)
 *   GET  /api/requests  — fetch user's transport requests (auth-required)
 *   POST /api/requests  — create a transport request (auth-required)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: { from: vi.fn() },
  requireUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/sms", () => ({
  sendSMS: vi.fn().mockResolvedValue(undefined),
  smsTemplates: {
    newMessage: vi.fn().mockReturnValue({ body: "test" }),
  },
}));

vi.mock("@/lib/event-logger", () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  emailTemplates: {
    newRequest: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
  },
  getAppBaseUrl: vi.fn().mockReturnValue("https://businto.com"),
}));

vi.mock("@/lib/operator-matching", () => ({
  findMatchingOperators: vi.fn().mockResolvedValue([]),
  extractRequirements: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/email-helpers", () => ({
  generateOperatorQuoteLink: vi.fn().mockResolvedValue("https://businto.com/claim/abc"),
}));

vi.mock("@/lib/tokens", () => ({
  generateOperatorViewToken: vi.fn().mockResolvedValue("tok_test"),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePost(path: string, body: object) {
  return new NextRequest(`https://businto.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGet(path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://businto.com${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

function mockChain(resolvedValue: { data?: any; error?: any; count?: number }) {
  const chain: any = {};
  const methods = [
    "select", "insert", "update", "upsert", "delete",
    "eq", "neq", "in", "or", "order", "range", "gt", "lt", "not",
  ];
  methods.forEach((m) => { chain[m] = vi.fn().mockReturnValue(chain); });
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  chain.order = vi.fn().mockResolvedValue(resolvedValue);
  chain.range = vi.fn().mockResolvedValue(resolvedValue);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  return chain;
}

// ── /api/messages ─────────────────────────────────────────────────────────────

describe("POST /api/messages", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const { requireUser } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue(null);

    const { POST } = await import("@/app/api/messages/route");
    const res = await POST(makePost("/api/messages", {
      recipient_id: "op-1",
      content: "hello",
      request_id: "req-1",
    }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when sender_id does not match authenticated user", async () => {
    const { requireUser } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue({ id: "user-1" });

    const { POST } = await import("@/app/api/messages/route");
    const res = await POST(makePost("/api/messages", {
      sender_id: "attacker-id",
      recipient_id: "op-1",
      content: "hello",
      request_id: "req-1",
    }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when recipient_id or content is missing", async () => {
    const { requireUser } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue({ id: "user-1" });

    const { POST } = await import("@/app/api/messages/route");
    const res = await POST(makePost("/api/messages", {
      sender_id: "user-1",
      request_id: "req-1",
      // missing recipient_id and content
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither request_id nor booking_id provided", async () => {
    const { requireUser } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue({ id: "user-1" });

    const { POST } = await import("@/app/api/messages/route");
    const res = await POST(makePost("/api/messages", {
      sender_id: "user-1",
      recipient_id: "op-1",
      content: "hello",
      // no request_id or booking_id
    }));
    expect(res.status).toBe(400);
  });

  it("returns 200 when authenticated and all required fields present", async () => {
    const { requireUser, supabaseAdmin } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue({ id: "user-1" });

    (supabaseAdmin as any).from = vi.fn().mockReturnValue(
      mockChain({
        data: { id: "msg-1", content: "hello", sender_id: "user-1" },
        error: null,
      })
    );

    const { POST } = await import("@/app/api/messages/route");
    const res = await POST(makePost("/api/messages", {
      sender_id: "user-1",
      recipient_id: "op-1",
      content: "hello",
      request_id: "req-1",
    }));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/messages", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const { requireUser } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue(null);

    const { GET } = await import("@/app/api/messages/route");
    const res = await GET(makeGet("/api/messages", { request_id: "req-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 with messages array when authenticated", async () => {
    const { requireUser, supabaseAdmin } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue({ id: "user-1" });

    // Messages GET uses: .select().order().eq().or() — all must be chainable
    const msgChain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    (supabaseAdmin as any).from = vi.fn().mockReturnValue(msgChain);

    const { GET } = await import("@/app/api/messages/route");
    const res = await GET(makeGet("/api/messages", { request_id: "req-1" }));
    expect(res.status).toBe(200);
  });
});

// ── /api/requests ─────────────────────────────────────────────────────────────
// NOTE: GET and POST /api/requests use createClient() — they work for anonymous users.
// POST is intentionally public (anonymous transport requests allowed).
// GET returns user's own requests when authenticated, or all public requests unauthenticated.

describe("GET /api/requests", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 for unauthenticated requests (public endpoint)", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });

    const { supabaseAdmin } = await import("@/lib/supabase-server");
    (supabaseAdmin as any).from = vi.fn().mockReturnValue(
      mockChain({ data: [], error: null })
    );

    const { GET } = await import("@/app/api/requests/route");
    const res = await GET(makeGet("/api/requests"));
    // Public endpoint — returns 200 even without auth
    expect(res.status).toBe(200);
  });
});

describe("POST /api/requests (intentionally public — allows anonymous submissions)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 400 when required fields are missing (not 401 — anonymous allowed)", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });

    const { supabaseAdmin } = await import("@/lib/supabase-server");
    (supabaseAdmin as any).from = vi.fn().mockReturnValue(mockChain({ data: null, error: null }));

    const { POST } = await import("@/app/api/requests/route");
    const res = await POST(makePost("/api/requests", {}));
    // Missing required fields → 400, not 401 (anonymous is allowed)
    expect(res.status).toBe(400);
  });
});
