"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorBoundaryUI } from "@/components/error-boundary-ui";

export default function ClaimError({
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
      title="Could not process claim"
      description="Something went wrong processing this claim link. It may have expired or already been used."
      backHref="/"
      backLabel="Go home"
    />
  );
}
