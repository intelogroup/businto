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

    // H6: the recipient must be a participant too — here an operator who
    // quoted on the sender's request. (This test previously addressed the
    // message to a non-participant "victim-id" and pinned the vulnerable
    // 200; BUS-MSG-RECIPIENT-001 corrected that expectation.)
    const mockMessage = { id: "msg-123", sender_id: "real-user-id", recipient_id: "operator-user-id" };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "transport_requests") {
        // H6: Participant validation — return request owned by the sender
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { user_id: "real-user-id" }, error: null }),
        };
      }
      if (table === "operators") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "op-1" }, error: null }),
        };
      }
      if (table === "quotes") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { operator_id: "op-1" }, error: null }),
        };
      }
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
        recipient_id: "operator-user-id",
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

// BUS-MSG-RECIPIENT-001: in the request_id branch, the recipient must be a
// participant of the named request (its owner, or an operator with a quote
// on it). Before the fix, only the sender was validated, so any participant
// could push a message + notification + SMS to an arbitrary registered user.
describe("Messaging API — request recipient binding (BUS-MSG-RECIPIENT-001)", () => {
  const OWNER = "owner-user";
  const OPERATOR_USER = "operator-user"; // profile id of the quoting operator
  const OPERATOR_ID = "op-1";
  const VICTIM = "victim-user"; // registered user, no relation to the request
  const REQUEST_ID = "req-1";

  let messageInserts: any[] = [];
  let notificationInserts: any[] = [];

  function chain(resolver: (eqs: Record<string, any>) => any) {
    const eqs: Record<string, any> = {};
    const c: any = {
      select: vi.fn().mockImplementation(() => c),
      eq: vi.fn().mockImplementation((k: string, v: any) => { eqs[k] = v; return c; }),
      in: vi.fn().mockImplementation(() => c),
      order: vi.fn().mockImplementation(() => c),
      insert: vi.fn().mockImplementation((row: any) => { c._inserted = row; return c; }),
      update: vi.fn().mockImplementation(() => c),
      single: vi.fn().mockImplementation(async () => resolver(eqs)),
      maybeSingle: vi.fn().mockImplementation(async () => resolver(eqs)),
      then: (resolve: any) => resolve(resolver(eqs)),
    };
    return c;
  }

  function installMocks() {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "transport_requests") {
        return chain(() => ({ data: { user_id: OWNER }, error: null }));
      }
      if (table === "operators") {
        return chain((eqs) => ({
          data: eqs["profile_id"] === OPERATOR_USER ? { id: OPERATOR_ID } : null,
          error: null,
        }));
      }
      if (table === "quotes") {
        return chain((eqs) => ({
          data: eqs["operator_id"] === OPERATOR_ID ? { operator_id: OPERATOR_ID } : null,
          error: null,
        }));
      }
      if (table === "messages") {
        const c = chain(() => ({
          data: { id: "msg-1", sender_id: "x", recipient_id: "y" },
          error: null,
        }));
        const origInsert = c.insert;
        c.insert = vi.fn().mockImplementation((row: any) => { messageInserts.push(row); return origInsert(row); });
        return c;
      }
      if (table === "notifications") {
        const c = chain(() => ({ data: null, error: null }));
        const origInsert = c.insert;
        c.insert = vi.fn().mockImplementation((row: any) => { notificationInserts.push(row); return origInsert(row); });
        return c;
      }
      if (table === "unified_profiles") {
        return chain((eqs) => ({
          data: eqs["id"] === VICTIM || eqs["id"] === OPERATOR_USER
            ? { id: eqs["id"], full_name: "Person", phone: "+15555550123" }
            : { id: eqs["id"], full_name: "Sender" },
          error: null,
        }));
      }
      return chain(() => ({ data: null, error: null }));
    });
  }

  async function post(sender: string, recipient: string) {
    const { requireUser } = await import("@/lib/supabase-server");
    (requireUser as any).mockResolvedValue({ id: sender });
    const req = new NextRequest("http://localhost:3000/api/messages", {
      method: "POST",
      body: JSON.stringify({
        sender_id: sender,
        recipient_id: recipient,
        content: "You won a prize, call now",
        request_id: REQUEST_ID,
      }),
    });
    return POST(req);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    messageInserts = [];
    notificationInserts = [];
    installMocks();
  });

  it("allows the request owner to message the operator who quoted on the request", async () => {
    const res = await post(OWNER, OPERATOR_USER);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(messageInserts.length).toBe(1);
  });

  it("allows the quoting operator to message the request owner (reverse direction)", async () => {
    const res = await post(OPERATOR_USER, OWNER);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(messageInserts.length).toBe(1);
  });

  it("refuses the request owner messaging an arbitrary non-participant user", async () => {
    const { sendSMS } = await import("@/lib/sms");
    const res = await post(OWNER, VICTIM);
    expect(res.status).toBe(403);
    expect(messageInserts.length).toBe(0);
    expect(notificationInserts.length).toBe(0);
    expect(sendSMS as any).not.toHaveBeenCalled();
  });

  it("refuses a quoting operator messaging an arbitrary non-participant user", async () => {
    const { sendSMS } = await import("@/lib/sms");
    const res = await post(OPERATOR_USER, VICTIM);
    expect(res.status).toBe(403);
    expect(messageInserts.length).toBe(0);
    expect(notificationInserts.length).toBe(0);
    expect(sendSMS as any).not.toHaveBeenCalled();
  });
});
