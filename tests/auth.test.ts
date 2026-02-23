import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapSupabaseUser,
  normalizeRole,
  registerUser,
  sendMagicLink,
  signInWithPassword,
  signOutUser,
} from "@/lib/auth";

const sampleAuthUser = {
  id: "user-123",
  email: "test@example.com",
  user_metadata: {
    full_name: "Test User",
    avatar_url: "https://example.com/avatar.png",
  },
  app_metadata: {},
};

describe("auth helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).window;
  });

  it("normalizeRole returns provided system role", () => {
    expect(normalizeRole("admin")).toBe("admin");
    expect(normalizeRole("operator")).toBe("operator");
    expect(normalizeRole("guest")).toBe("user");
  });

  it("mapSupabaseUser merges profile metadata when available", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { full_name: "Operator One", role: "operator", avatar_url: "https://cdn/avatar.png" },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabaseMock = { from } as any;

    const result = await mapSupabaseUser(sampleAuthUser as any, supabaseMock);

    expect(from).toHaveBeenCalledWith("profiles");
    expect(select).toHaveBeenCalledWith("full_name, role, avatar_url");
    expect(eq).toHaveBeenCalledWith("id", sampleAuthUser.id);
    expect(result.name).toBe("Operator One");
    expect(result.role).toBe("operator");
    expect(result.avatar).toBe("https://cdn/avatar.png");
  });

  it("mapSupabaseUser falls back when profile is missing", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabaseMock = { from } as any;

    const result = await mapSupabaseUser({
      ...sampleAuthUser,
      user_metadata: { full_name: "Legacy" },
      email: "legacy@example.com",
    } as any, supabaseMock);

    expect(result.name).toBe("Legacy");
    expect(result.role).toBe("user");
  });

  it("signInWithPassword resolves when Supabase responds", async () => {
    const signIn = vi.fn().mockResolvedValue({ data: { session: "session-1", user: null }, error: null });
    const supabaseMock = { auth: { signInWithPassword: signIn } } as any;

    await expect(signInWithPassword("test@example.com", "secret", supabaseMock)).resolves.toEqual({
      session: "session-1",
      user: null,
    });
    expect(signIn).toHaveBeenCalledWith({ email: "test@example.com", password: "secret" });
  });

  it("signInWithPassword throws when Supabase returns an error", async () => {
    const signIn = vi.fn().mockResolvedValue({ data: null, error: { message: "Failed" } });
    const supabaseMock = { auth: { signInWithPassword: signIn } } as any;

    await expect(signInWithPassword("a", "b", supabaseMock)).rejects.toEqual({ message: "Failed" });
  });

  it("sendMagicLink uses origin when available", async () => {
    (globalThis as any).window = { location: { origin: "https://app.test" } };
    const sendOtp = vi.fn().mockResolvedValue({ error: null });
    const supabaseMock = { auth: { signInWithOtp: sendOtp } } as any;

    await sendMagicLink("magic@example.com", supabaseMock);
    expect(sendOtp).toHaveBeenCalledWith({
      email: "magic@example.com",
      options: { emailRedirectTo: "https://app.test/dashboard" },
    });
  });

  it("sendMagicLink throws on failure", async () => {
    (globalThis as any).window = { location: { origin: "https://app.test" } };
    const sendOtp = vi.fn().mockResolvedValue({ error: { message: "oops" } });
    const supabaseMock = { auth: { signInWithOtp: sendOtp } } as any;

    await expect(sendMagicLink("magic@example.com", supabaseMock)).rejects.toEqual({ message: "oops" });
  });

  it("registerUser signs up and upserts profile", async () => {
    const profileUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue({ upsert: profileUpsert });
    const signUp = vi.fn().mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    const supabaseMock = { auth: { signUp }, from } as any;

    const result = await registerUser("new@test.com", "pass", "New User", supabaseMock);

    expect(signUp).toHaveBeenCalledWith({
      email: "new@test.com",
      password: "pass",
      options: {
        data: { full_name: "New User" },
      },
    });
    expect(from).toHaveBeenCalledWith("profiles");
    expect(profileUpsert).toHaveBeenCalledWith({
      id: "u1",
      full_name: "New User",
      role: "user",
    });
    expect(result).toEqual({ user: { id: "u1" } });
  });

  it("registerUser rethrows signup error", async () => {
    const signUp = vi.fn().mockResolvedValue({ data: null, error: { message: "bad" } });
    const supabaseMock = { auth: { signUp } } as any;

    await expect(registerUser("err@test.com", "pass", "Err", supabaseMock)).rejects.toEqual({ message: "bad" });
  });

  it("signOutUser calls Supabase signOut", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const supabaseMock = { auth: { signOut } } as any;

    await signOutUser(supabaseMock);
    expect(signOut).toHaveBeenCalled();
  });

  it("signOutUser throws on error", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: { message: "nope" } });
    const supabaseMock = { auth: { signOut } } as any;

    await expect(signOutUser(supabaseMock)).rejects.toEqual({ message: "nope" });
  });
});
