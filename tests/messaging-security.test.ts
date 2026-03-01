import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/messages/route";
import { NextRequest } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-server";

// Mock supabaseAdmin and helpers
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

// Mock sms utility
vi.mock("@/lib/sms", () => ({
  sendSMS: vi.fn().mockResolvedValue({ success: true }),
  smsTemplates: {
    newMessage: vi.fn().mockReturnValue({ content: "test" }),
  },
}));

describe("Messaging API Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should block messaging attempts where sender_id does not match authenticated user", async () => {
    const { requireUser } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue({ id: "real-user-id" });

    const req = new NextRequest("http://localhost:3000/api/messages", {
      method: "POST",
      body: JSON.stringify({
        sender_id: "attacker-id",
        recipient_id: "victim-id",
        content: "spoofed message",
        request_id: "req-123",
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Forbidden");
  });

  it("should allow messaging where sender_id matches authenticated user", async () => {
    const { requireUser } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue({ id: "real-user-id" });

    const mockMessage = { id: "msg-123", sender_id: "real-user-id", recipient_id: "victim-id" };
    
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "messages") {
        return { 
          insert: vi.fn().mockReturnThis(), 
          select: vi.fn().mockReturnThis(), 
          single: vi.fn().mockResolvedValue({ data: mockMessage, error: null }) 
        };
      }
      if (table === "unified_profiles") {
        return { 
          select: vi.fn().mockReturnThis(), 
          eq: vi.fn().mockReturnThis(), 
          single: vi.fn().mockResolvedValue({ data: { id: "real-user-id", full_name: "Real User" }, error: null }) 
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    const req = new NextRequest("http://localhost:3000/api/messages", {
      method: "POST",
      body: JSON.stringify({
        sender_id: "real-user-id",
        recipient_id: "victim-id",
        content: "legit message",
        request_id: "req-123",
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
