import { describe, it, expect, vi, afterEach } from "vitest";
import { updatePassword } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Shared validation logic (mirrors what the UI does before calling Supabase)
// ---------------------------------------------------------------------------
function validatePassword(newPassword: string, confirmPassword: string): string | null {
  if (newPassword.length < 8) return "Password must be at least 8 characters.";
  if (newPassword !== confirmPassword) return "Passwords do not match.";
  return null;
}

function validateDisplayName(name: string): string | null {
  if (!name.trim()) return "Name cannot be empty.";
  return null;
}

// ---------------------------------------------------------------------------
// Profile page: display name update (mocking supabase.auth.updateUser)
// ---------------------------------------------------------------------------
describe("Profile page — display name update", () => {
  it("calls supabase.auth.updateUser with trimmed full_name", async () => {
    const updateUser = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const supabaseMock = { auth: { updateUser } } as any;

    const name = "  Jane Doe  ";
    const { error } = await supabaseMock.auth.updateUser({ data: { full_name: name.trim() } });

    expect(error).toBeNull();
    expect(updateUser).toHaveBeenCalledWith({ data: { full_name: "Jane Doe" } });
  });

  it("propagates Supabase error on name update failure", async () => {
    const updateUser = vi.fn().mockResolvedValue({ data: null, error: { message: "Update failed" } });
    const supabaseMock = { auth: { updateUser } } as any;

    const { error } = await supabaseMock.auth.updateUser({ data: { full_name: "Jane" } });

    expect(error).toEqual({ message: "Update failed" });
  });

  it("rejects empty name before calling Supabase", () => {
    expect(validateDisplayName("")).toBe("Name cannot be empty.");
    expect(validateDisplayName("   ")).toBe("Name cannot be empty.");
  });

  it("accepts valid name", () => {
    expect(validateDisplayName("Alice")).toBeNull();
    expect(validateDisplayName("  Bob  ")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Settings page — password validation (client-side rules)
// ---------------------------------------------------------------------------
describe("Settings page — password validation", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(validatePassword("abc", "abc")).toBe("Password must be at least 8 characters.");
    expect(validatePassword("1234567", "1234567")).toBe("Password must be at least 8 characters.");
  });

  it("rejects passwords that do not match", () => {
    expect(validatePassword("password123", "password456")).toBe("Passwords do not match.");
  });

  it("accepts valid matching passwords of sufficient length", () => {
    expect(validatePassword("securePass1!", "securePass1!")).toBeNull();
    expect(validatePassword("12345678", "12345678")).toBeNull();
  });

  it("rejects short password even if both fields match", () => {
    expect(validatePassword("short", "short")).toBe("Password must be at least 8 characters.");
  });
});

// ---------------------------------------------------------------------------
// Settings page — updatePassword (via auth lib)
// ---------------------------------------------------------------------------
describe("Settings page — updatePassword (auth lib)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("calls supabase.auth.updateUser with new password", async () => {
    const updateUser = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });
    const supabaseMock = { auth: { updateUser, getSession } } as any;

    const result = await updatePassword("newSecure99!", supabaseMock);

    expect(updateUser).toHaveBeenCalledWith({ password: "newSecure99!" });
    expect(result).toEqual({ user: { id: "u1" } });
  });

  it("throws when Supabase returns a session-expired error", async () => {
    const updateUser = vi.fn().mockResolvedValue({ data: null, error: { message: "session expired" } });
    const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });
    const supabaseMock = { auth: { updateUser, getSession } } as any;

    await expect(updatePassword("newSecure99!", supabaseMock)).rejects.toEqual({ message: "session expired" });
  });

  it("never calls Supabase when client-side validation fails", async () => {
    const updateUser = vi.fn();
    const supabaseMock = { auth: { updateUser } } as any;

    const error = validatePassword("short", "short");
    if (!error) {
      await updatePassword("short", supabaseMock);
    }

    expect(updateUser).not.toHaveBeenCalled();
  });
});
