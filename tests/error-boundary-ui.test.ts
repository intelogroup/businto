import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorBoundaryUI } from "@/components/error-boundary-ui";

const mockError = (digest?: string): Error & { digest?: string } => {
  const e = new Error("Test error");
  if (digest) (e as Error & { digest?: string }).digest = digest;
  return e;
};

describe("ErrorBoundaryUI", () => {
  it("renders default title and description", () => {
    const html = renderToStaticMarkup(
      React.createElement(ErrorBoundaryUI, {
        error: mockError(),
        reset: vi.fn(),
      })
    );
    expect(html).toContain("Something went wrong");
    expect(html).toContain("An unexpected error occurred on this page.");
  });

  it("renders custom title and description", () => {
    const html = renderToStaticMarkup(
      React.createElement(ErrorBoundaryUI, {
        error: mockError(),
        reset: vi.fn(),
        title: "Dashboard error",
        description: "Something went wrong loading your dashboard.",
      })
    );
    expect(html).toContain("Dashboard error");
    expect(html).toContain("Something went wrong loading your dashboard.");
  });

  it("shows digest ref when present", () => {
    const html = renderToStaticMarkup(
      React.createElement(ErrorBoundaryUI, {
        error: mockError("abc123"),
        reset: vi.fn(),
      })
    );
    expect(html).toContain("abc123");
    expect(html).toContain("ref:");
  });

  it("does not show digest ref when absent", () => {
    const html = renderToStaticMarkup(
      React.createElement(ErrorBoundaryUI, {
        error: mockError(),
        reset: vi.fn(),
      })
    );
    expect(html).not.toContain("ref:");
  });

  it("renders Try again button", () => {
    const html = renderToStaticMarkup(
      React.createElement(ErrorBoundaryUI, {
        error: mockError(),
        reset: vi.fn(),
      })
    );
    expect(html).toContain("Try again");
  });

  it("renders back link when backHref is provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(ErrorBoundaryUI, {
        error: mockError(),
        reset: vi.fn(),
        backHref: "/trips",
        backLabel: "All trips",
      })
    );
    expect(html).toContain('href="/trips"');
    expect(html).toContain("All trips");
  });

  it("does not render back link when backHref is omitted", () => {
    const html = renderToStaticMarkup(
      React.createElement(ErrorBoundaryUI, {
        error: mockError(),
        reset: vi.fn(),
      })
    );
    expect(html).not.toContain("Go back");
    expect(html).not.toContain("<a ");
  });

  it("uses default backLabel when not specified", () => {
    const html = renderToStaticMarkup(
      React.createElement(ErrorBoundaryUI, {
        error: mockError(),
        reset: vi.fn(),
        backHref: "/",
      })
    );
    expect(html).toContain("Go back");
  });
});

describe("error boundary page modules export valid components", () => {
  const boundaries = [
    "@/app/error",
    "@/app/dashboard/error",
    "@/app/master/error",
    "@/app/trips/[id]/error",
    "@/app/claim/[code]/error",
    "@/app/global-error",
  ];

  for (const mod of boundaries) {
    it(`${mod} exports a default function`, async () => {
      const m = await import(mod);
      expect(typeof m.default).toBe("function");
    });
  }
});
