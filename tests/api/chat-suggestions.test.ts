/**
 * chat-suggestions.test.ts
 *
 * Tests for POST /api/chat/suggestions — AI smart reply suggestions (auth-required)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: { from: vi.fn() },
  requireUser: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  generateSmartReplies: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePost(body: object) {
  return new NextRequest("https://businto.com/api/chat/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockChain(resolvedValue: { data?: any; error?: any }) {
  const chain: any = {};
  const methods = ["select", "insert", "update", "eq", "neq", "in", "order", "limit", "not"];
  methods.forEach((m) => { chain[m] = vi.fn().mockReturnValue(chain); });
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(resolvedValue);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/chat/suggestions", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const { requireUser } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue(null);

    const { POST } = await import("@/app/api/chat/suggestions/route");
    const res = await POST(makePost({ messages: [{ content: "hi", sender_id: "u-1" }], requestId: "req-1" }));
    expect(res.status).toBe(401);
  });

  it("returns empty suggestions when messages array is empty", async () => {
    const { requireUser } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue({ id: "user-1" });

    const { POST } = await import("@/app/api/chat/suggestions/route");
    const res = await POST(makePost({ messages: [] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.suggestions).toEqual([]);
  });

  it("returns 401 (not 500) for unauthenticated requests — never generates suggestions", async () => {
    const { requireUser } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue(null);

    const { generateSmartReplies } = await import("@/lib/ai");

    const { POST } = await import("@/app/api/chat/suggestions/route");
    await POST(makePost({ messages: [{ content: "test", sender_id: "u-1" }] }));

    // Should not reach AI call when not authenticated
    expect(generateSmartReplies).not.toHaveBeenCalled();
  });

  it("returns suggestions when authenticated with valid messages", async () => {
    const { requireUser, supabaseAdmin } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue({ id: "user-1" });

    (supabaseAdmin as any).from = vi.fn().mockReturnValue(
      mockChain({ data: { service_type: "school", status: "pending" } })
    );

    const { generateSmartReplies } = await import("@/lib/ai");
    (generateSmartReplies as any).mockResolvedValue(["Sure!", "Sounds good", "Let me check"]);

    const { POST } = await import("@/app/api/chat/suggestions/route");
    const res = await POST(makePost({
      messages: [{ content: "Hello", sender_id: "op-1" }],
      requestId: "req-1",
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.suggestions)).toBe(true);
    expect(json.suggestions).toContain("Sure!");
  });
});
