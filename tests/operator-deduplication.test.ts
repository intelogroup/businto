import { describe, it, expect, vi, beforeEach } from "vitest";
import { findMatchingOperators } from "@/lib/operator-matching";
import { supabaseAdmin as supabase } from "@/lib/supabase-server";

// Mock supabaseAdmin
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

// Mock fetch for geocoding
global.fetch = vi.fn();

describe("findMatchingOperators De-duplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupSupabaseMock(data: any[]) {
    const mockQuery: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      then: (onfulfilled: any) => Promise.resolve({ data, error: null }).then(onfulfilled)
    };
    (supabase.from as any).mockReturnValue(mockQuery);
    return mockQuery;
  }

  it("should de-duplicate operators with the same company_email and keep the one with higher rating", async () => {
    // Mock geocoding to return coordinates
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "42.3601", lon: "-71.0589" }],
    });

    const mockOperators = [
      {
        id: "op-1",
        company_name: "Fleet A - Branch 1",
        company_email: "duplicate@example.com",
        rating: 4.2,
        vehicle_types: ["van"],
        specialties: ["Medical Transport"],
        company_lat: 42.3601,
        company_lng: -71.0589,
        service_radius_miles: 50,
        is_partner: true,
      },
      {
        id: "op-2",
        company_name: "Fleet A - Branch 2",
        company_email: "duplicate@example.com",
        rating: 4.8, // Higher rating
        vehicle_types: ["van"],
        specialties: ["Medical Transport"],
        company_lat: 42.3601,
        company_lng: -71.0589,
        service_radius_miles: 50,
        is_partner: true,
      },
      {
        id: "op-3",
        company_name: "Unique Operator",
        company_email: "unique@example.com",
        rating: 4.5,
        vehicle_types: ["van"],
        specialties: ["Medical Transport"],
        company_lat: 42.3601,
        company_lng: -71.0589,
        service_radius_miles: 50,
        is_partner: true,
      },
    ];

    setupSupabaseMock(mockOperators);

    const result = await findMatchingOperators({
      service_type: "medical",
      pickup_address: "Boston, MA",
    });

    // Should only have 2 operators (one from the duplicate pair, plus the unique one)
    expect(result.length).toBe(2);
    
    const duplicateOp = result.find(op => op.company_email === "duplicate@example.com");
    expect(duplicateOp?.rating).toBe(4.8); // Should have kept the higher rated one
    expect(duplicateOp?.id).toBe("op-2");

    const uniqueOp = result.find(op => op.company_email === "unique@example.com");
    expect(uniqueOp).toBeDefined();
  });

  it("should de-duplicate in the fallback (no coordinates) case", async () => {
    // Mock geocoding failure
    (global.fetch as any).mockResolvedValue({ ok: false });

    const mockOperators = [
      {
        id: "op-1",
        company_email: "fallback-dup@example.com",
        rating: 3.5,
        vehicle_types: ["van"],
        specialties: ["Medical Transport"],
      },
      {
        id: "op-2",
        company_email: "fallback-dup@example.com",
        rating: 4.1, // Higher
        vehicle_types: ["van"],
        specialties: ["Medical Transport"],
      }
    ];

    setupSupabaseMock(mockOperators);

    const result = await findMatchingOperators({
      service_type: "medical",
      pickup_address: "Some Address",
    });

    expect(result.length).toBe(1);
    expect(result[0].rating).toBe(4.1);
    expect(result[0].id).toBe("op-2");
  });
});
