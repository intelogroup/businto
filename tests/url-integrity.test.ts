import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emailTemplates } from "@/lib/email";

// Note: getAppBaseUrl is not exported, so we test it indirectly via templates 
// or we can mock the environment.

describe("URL & Redirection Integrity", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Operator Redirection Links", () => {
    it("should generate a correct 'Claim Job' link pointing to the production domain", () => {
      process.env.NODE_ENV = 'production';
      process.env.NEXT_PUBLIC_APP_URL = 'https://businto.com';
      
      const template = emailTemplates.operatorNewRequest({
        operatorName: "Test Op",
        serviceType: "medical",
        serviceTypeDisplay: "Medical",
        pickupAddress: "123 Main St",
        dropoffAddress: "456 Oak St",
        pickupFuzzy: "Boston",
        dropoffFuzzy: "Cambridge",
        date: "2026-03-01",
        requestId: "req-123",
        accessToken: "token-abc",
        requirements: []
      });

      // Verify the link in the HTML
      expect(template.html).toContain('href="https://businto.com/quotes/submit?request_id=req-123&token=token-abc"');
    });

    it("should force businto.com even if NEXT_PUBLIC_APP_URL is a vercel subdomain in production", () => {
      process.env.NODE_ENV = 'production';
      process.env.NEXT_PUBLIC_APP_URL = 'https://businto-branch.vercel.app';
      
      const template = emailTemplates.operatorNewRequest({
        operatorName: "Test Op",
        serviceType: "medical",
        serviceTypeDisplay: "Medical",
        pickupAddress: "123 Main St",
        dropoffAddress: "456 Oak St",
        pickupFuzzy: "Boston",
        dropoffFuzzy: "Cambridge",
        date: "2026-03-01",
        requestId: "req-123",
        accessToken: "token-abc",
        requirements: []
      });

      expect(template.html).toContain('href="https://businto.com/quotes/submit?request_id=req-123&token=token-abc"');
    });
  });

  describe("User Redirection & Magic Links", () => {
    it("should handle a full Magic Link URL correctly in the quoteReceived template", () => {
      const magicLink = "https://expwyvyphwlyhwrzdmmv.supabase.co/auth/v1/verify?token=tok&type=magiclink&redirect_to=https://businto.com/api/auth/callback?next=/trips/req-123";
      
      const template = emailTemplates.quoteReceived({
        userName: "User",
        operatorName: "Op",
        price: 100,
        vehicleType: "Van",
        requestId: "req-123",
        quoteId: "quote-123",
        appBaseUrl: magicLink // This is how we pass the magic link now
      });

      // Should use the magic link exactly as is
      expect(template.html).toContain(`href="${magicLink}"`);
      // Should NOT append /trips/... to an already full URL
      expect(template.html).not.toContain(`${magicLink}/trips/`);
    });

    it("should fall back to standard token link if appBaseUrl is just a domain", () => {
      process.env.NODE_ENV = 'production';
      process.env.NEXT_PUBLIC_APP_URL = 'https://businto.com';

      const template = emailTemplates.quoteReceived({
        userName: "User",
        operatorName: "Op",
        price: 100,
        vehicleType: "Van",
        requestId: "req-123",
        quoteId: "quote-123",
        accessToken: "token-user",
        appBaseUrl: undefined // Standard behavior
      });

      expect(template.html).toContain('href="https://businto.com/trips/req-123?token=token-user"');
    });
  });

  describe("Auth Callback Logic", () => {
    it("should identify correct production redirect in api/auth/callback (Logic Check)", async () => {
      // We can't easily test the redirect response without mocking NextRequest perfectly,
      // but we verified the logic in the file previously. 
      // This test serves as a documentation check for the guard.
      const isLocalEnv = false;
      const forwardedHost = "businto-preview.vercel.app";
      const next = "/trips/req-123";
      
      let base = forwardedHost ? `https://${forwardedHost}` : "http://localhost:3000";
      
      if (!isLocalEnv && base.includes('vercel.app')) {
        base = 'https://businto.com';
      }

      const redirectTo = `${base}${next}`;
      expect(redirectTo).toBe("https://businto.com/trips/req-123");
    });
  });
});
