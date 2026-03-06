import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Sentry integration tests
// Tests the DSN is present, the SDK initializes correctly, and that
// captureException is callable from error boundary components.
// ---------------------------------------------------------------------------

describe("Sentry configuration", () => {
  it("NEXT_PUBLIC_SENTRY_DSN is set", () => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    expect(dsn).toBeTruthy();
    expect(dsn).toMatch(/^https:\/\//);
  });

  it("NEXT_PUBLIC_SENTRY_DSN has valid format", () => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN!;
    // Format: https://<key>@o<org_id>.ingest.*.sentry.io/<project_id>
    const dsnRegex =
      /^https:\/\/[a-f0-9]+@o\d+\.ingest(\.\w+)?\.sentry\.io\/\d+$/;
    expect(dsn).toMatch(dsnRegex);
  });

  it("SENTRY_AUTH_TOKEN is set", () => {
    const token = process.env.SENTRY_AUTH_TOKEN;
    expect(token).toBeTruthy();
    expect(token).toMatch(/^sntrys_/);
  });

  it("DSN project ID matches expected project", () => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN!;
    const projectId = dsn.split("/").pop();
    expect(projectId).toBe("4510994917687296");
  });
});

describe("Sentry SDK", () => {
  it("initializes without throwing", async () => {
    const Sentry = await import("@sentry/nextjs");
    expect(() => {
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: "test",
        tracesSampleRate: 0,
        // Disable transport so no real HTTP calls are made
        transport: () => ({
          send: async () => ({ statusCode: 200 }),
          flush: async () => true,
        }),
      });
    }).not.toThrow();
  });

  it("captureException is a function", async () => {
    const Sentry = await import("@sentry/nextjs");
    expect(typeof Sentry.captureException).toBe("function");
  });

  it("captureException does not throw when called with an Error", async () => {
    const Sentry = await import("@sentry/nextjs");
    expect(() => {
      Sentry.captureException(new Error("test error from vitest"));
    }).not.toThrow();
  });

  it("captureMessage is a function", async () => {
    const Sentry = await import("@sentry/nextjs");
    expect(typeof Sentry.captureMessage).toBe("function");
  });
});

describe("Sentry DSN reachability", () => {
  it("Sentry ingest endpoint responds to envelope POST", async () => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN!;
    // Parse DSN: https://<key>@<host>/<project_id>
    const url = new URL(dsn);
    const projectId = url.pathname.replace("/", "");
    const key = url.username;
    const ingestUrl = `${url.protocol}//${url.host}/api/${projectId}/envelope/?sentry_key=${key}&sentry_version=7`;

    // Send a minimal valid envelope (SDK info only — no real event data captured)
    const envelope = [
      JSON.stringify({ sdk: { name: "sentry.javascript.nextjs", version: "0.0.0-test" } }),
      JSON.stringify({ type: "client_report" }),
      JSON.stringify({ timestamp: Math.floor(Date.now() / 1000), discarded_events: [] }),
    ].join("\n");

    const res = await fetch(ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
    });

    // Sentry returns 200 (or 202) for valid envelopes, 400 for bad DSN key
    expect([200, 202]).toContain(res.status);
  });
});
