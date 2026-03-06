"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorBoundaryUI } from "@/components/error-boundary-ui";

export default function TripError({
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
      title="Could not load trip"
      description="Something went wrong loading this trip."
      backHref="/trips"
      backLabel="All trips"
    />
  );
}
