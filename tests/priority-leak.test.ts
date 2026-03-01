import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/cron/process-priority-leaks/route";
import { supabaseAdmin as supabase } from "@/lib/supabase-server";
import { findMatchingOperators } from "@/lib/operator-matching";
import { sendEmail } from "@/lib/email";

// Mock supabaseAdmin
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

// Mock operator matching
vi.mock("@/lib/operator-matching", () => ({
  findMatchingOperators: vi.fn(),
  extractRequirements: vi.fn().mockReturnValue([]),
}));

// Mock email
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: "email-123" }),
  emailTemplates: {
    operatorNewRequest: vi.fn().mockReturnValue({ subject: "test", html: "test" }),
  },
  getAppBaseUrl: vi.fn().mockReturnValue("https://businto.com"),
}));

// Mock tokens
vi.mock("@/lib/tokens", () => ({
  generateOperatorViewToken: vi.fn().mockResolvedValue("token-123"),
}));

describe("Priority Leak Cron Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL_CRON_SECRET = "cron_secret";
  });

  it("should leak requests to standard network after priority window expires", async () => {
    const mockRequest = {
      id: "req-123",
      service_type: "school",
      pickup_address: "123 Main St",
      pickup_fuzzy: "123 Main St",
      dropoff_address: "456 Oak St",
      dropoff_fuzzy: "456 Oak St",
      start_date: "2026-03-01",
      metadata: {},
    };

    const mockStandardOperator = {
      id: "op-std",
      company_name: "Standard Op",
      company_email: "std@example.com",
      is_partner: false,
      profile_id: "prof-std",
    };

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "transport_requests") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [mockRequest], error: null }),
          update: vi.fn().mockReturnThis(),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    (supabase.from as any).mockImplementation(fromMock);
    (findMatchingOperators as any).mockResolvedValue([mockStandardOperator]);

    const req = new Request("http://localhost:3000/api/cron/process-priority-leaks", {
      headers: { authorization: "Bearer cron_secret" },
    });

    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.leakedRequests).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "std@example.com"
    }));
  });

  it("should trigger admin safety valve for old unassigned care rides", async () => {
    const mockMedicalRequest = {
      id: "req-med",
      service_type: "medical",
      pickup_address: "Hosp St",
      dropoff_address: "Home St",
      created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "transport_requests") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockImplementation((col: string) => {
            if (col === 'priority_window_ends_at') return Promise.resolve({ data: [], error: null });
            return Promise.resolve({ data: [mockMedicalRequest], error: null });
          }),
          update: vi.fn().mockReturnThis(),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    const req = new Request("http://localhost:3000/api/cron/process-priority-leaks", {
      headers: { authorization: "Bearer cron_secret" },
    });

    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.safetyAlerts).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "admin@businto.com"
    }));
  });
});
