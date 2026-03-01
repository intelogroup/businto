import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as confirmGET } from "@/app/api/auth/confirm/route";
import { GET as callbackGET } from "@/app/api/auth/callback/route";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Mock supabase server client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

describe("Password Reset & Security Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should verify recovery token and redirect to reset password page", async () => {
    const mockSupabase = {
      auth: {
        verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      },
    };
    (createClient as any).mockResolvedValue(mockSupabase);

    const req = new NextRequest("http://localhost:3000/api/auth/confirm?token_hash=test_hash&type=recovery&next=/login/reset-password", {
      method: "GET",
    });

    const response = await confirmGET(req);

    expect(response.status).toBe(307); // Redirect
    expect(response.headers.get("location")).toBe("http://localhost:3000/login/reset-password");
    expect(mockSupabase.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "test_hash",
      type: "recovery",
    });
  });

  it("should exchange code for session in callback", async () => {
    const mockSupabase = {
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      },
    };
    (createClient as any).mockResolvedValue(mockSupabase);

    const req = new NextRequest("http://localhost:3000/api/auth/callback?code=test_code&next=/dashboard", {
      method: "GET",
    });

    const response = await callbackGET(req);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(mockSupabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("test_code");
  });
});
