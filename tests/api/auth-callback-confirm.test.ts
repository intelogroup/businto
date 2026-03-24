/**
 * auth-callback-confirm.test.ts
 *
 * Tests for:
 *   GET  /api/auth/callback   — exchanges code for session, redirects
 *   GET  /api/auth/confirm    — verifies OTP token, redirects
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// next/navigation redirect is not used in route handlers — they return NextResponse.redirect
// Mock next/headers as some route handlers may import cookies
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [] }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://businto.com${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

// ── auth/callback ─────────────────────────────────────────────────────────────

describe("GET /api/auth/callback", () => {
  const mockExchange = vi.fn();

  beforeEach(async () => {
    vi.resetAllMocks();
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as any).mockResolvedValue({
      auth: { exchangeCodeForSession: mockExchange },
    });
  });

  it("redirects when code exchange succeeds", async () => {
    const { GET } = await import(
      "@/app/api/auth/callback/route"
    );
    mockExchange.mockResolvedValue({ error: null });

    const req = makeRequest("/api/auth/callback", { code: "valid-code" });
    const res = await GET(req);

    // NextResponse.redirect returns 307 in test env, 302 in prod — accept any 3xx
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(mockExchange).toHaveBeenCalledWith("valid-code");
  });

  it("redirects to login error when no code supplied", async () => {
    const { GET } = await import(
      "@/app/api/auth/callback/route"
    );

    const req = makeRequest("/api/auth/callback");
    const res = await GET(req);

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("redirects to login error page when exchange fails", async () => {
    const { GET } = await import(
      "@/app/api/auth/callback/route"
    );
    mockExchange.mockResolvedValue({ error: { message: "invalid code" } });

    const req = makeRequest("/api/auth/callback", { code: "bad-code" });
    const res = await GET(req);

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location") || "";
    expect(location).toContain("error");
  });
});

// ── auth/confirm ──────────────────────────────────────────────────────────────

describe("GET /api/auth/confirm", () => {
  const mockVerifyOtp = vi.fn();

  beforeEach(async () => {
    vi.resetAllMocks();
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as any).mockResolvedValue({
      auth: { verifyOtp: mockVerifyOtp },
    });
  });

  it("redirects when OTP verification succeeds", async () => {
    const { GET } = await import(
      "@/app/api/auth/confirm/route"
    );
    mockVerifyOtp.mockResolvedValue({ error: null });

    const req = makeRequest("/api/auth/confirm", {
      token_hash: "abc123",
      type: "email",
    });
    const res = await GET(req);

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      token_hash: "abc123",
      type: "email",
    });
  });

  it("redirects to error page when token_hash is missing", async () => {
    const { GET } = await import(
      "@/app/api/auth/confirm/route"
    );

    const req = makeRequest("/api/auth/confirm", { type: "email" });
    const res = await GET(req);

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("redirects to error page when OTP verification fails", async () => {
    const { GET } = await import(
      "@/app/api/auth/confirm/route"
    );
    mockVerifyOtp.mockResolvedValue({ error: { message: "expired token" } });

    const req = makeRequest("/api/auth/confirm", {
      token_hash: "bad-hash",
      type: "email",
    });
    const res = await GET(req);

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location") || "";
    expect(location).toContain("error");
  });
});
