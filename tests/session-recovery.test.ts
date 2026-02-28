import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapSupabaseUser } from "@/lib/auth";

describe("Session Recovery", () => {
  const mockUser = {
    id: "user-123",
    email: "test@example.com",
    user_metadata: { full_name: "Test User" },
  };

  const mockSession = {
    user: mockUser,
    access_token: "token",
    refresh_token: "refresh",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully map user profile upon session recovery", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { 
        full_name: "Mapped User", 
        role: "operator", 
        avatar_url: "https://example.com/avatar.png",
        operator_id: "op-123"
      },
      error: null,
    });
    
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabaseMock = { from } as any;

    // Simulate what happens in onAuthStateChange
    const result = await mapSupabaseUser(mockUser as any, supabaseMock);

    expect(from).toHaveBeenCalledWith("unified_profiles");
    expect(select).toHaveBeenCalledWith("full_name, role, avatar_url, operator_id");
    expect(eq).toHaveBeenCalledWith("id", mockUser.id);
    
    expect(result).toEqual({
      id: "user-123",
      name: "Mapped User",
      email: "test@example.com",
      role: "operator",
      avatar: "https://example.com/avatar.png",
      operatorId: "op-123",
    });
  });

  it("should handle session with no profile (fallback to metadata)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabaseMock = { from } as any;

    const result = await mapSupabaseUser(mockUser as any, supabaseMock);

    expect(result.name).toBe("Test User");
    expect(result.role).toBe("user");
    expect(result.email).toBe("test@example.com");
  });

  it("should handle session recovery when Supabase returns an error", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Database error" },
    });
    
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabaseMock = { from } as any;

    const result = await mapSupabaseUser(mockUser as any, supabaseMock);

    // Should still return basic info from auth metadata
    expect(result.name).toBe("Test User");
    expect(result.role).toBe("user");
  });
});
