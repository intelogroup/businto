"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorBoundaryUI } from "@/components/error-boundary-ui";

export default function DashboardError({
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
    <ErrorBoundaryUI
      error={error}
      reset={reset}
      title="Dashboard error"
      description="Something went wrong loading your dashboard."
      backHref="/"
      backLabel="Go home"
    />
  );
}
