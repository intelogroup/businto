"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="font-sans antialiased bg-background">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-semibold text-foreground">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm">
            An unexpected error occurred. Our team has been notified.
            {error.digest && (
              <span className="block mt-1 font-mono text-xs opacity-60">
                ref: {error.digest}
              </span>
            )}
          </p>
          <button
            onClick={reset}
            className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
