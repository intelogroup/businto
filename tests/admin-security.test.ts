import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/master/admin/requests/route";
import { NextRequest } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-server";
import { createClient } from "@/lib/supabase/server";

// Mock supabase server client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock supabaseAdmin and helpers
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
  requireAdmin: vi.fn(),
  requireUser: vi.fn(),
}));

describe("Admin API Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should block non-admin users from accessing admin requests", async () => {
    const { requireAdmin } = await import("@/lib/supabase-server");
    (requireAdmin as any).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/master/admin/requests", {
      method: "GET",
    });

    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("should allow admin users to access admin requests", async () => {
    const { requireAdmin } = await import("@/lib/supabase-server");
    (requireAdmin as any).mockResolvedValue({ id: "admin-id" });

    const mockRequests = [{ id: "req-1" }];
    const selectMock = vi.fn().mockReturnThis();
    const orderMock = vi.fn().mockReturnThis();
    const rangeMock = vi.fn().mockResolvedValue({ data: mockRequests, error: null, count: 1 });

    (supabase.from as any).mockReturnValue({
      select: selectMock,
      order: orderMock,
      range: rangeMock,
    });

    const req = new NextRequest("http://localhost:3000/api/master/admin/requests", {
      method: "GET",
    });

    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.requests).toHaveLength(1);
  });
});
