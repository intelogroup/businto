"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorBoundaryUI } from "@/components/error-boundary-ui";

export default function MasterError({
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
      title="Admin panel error"
      description="Something went wrong in the admin panel."
      backHref="/master/admin"
      backLabel="Back to admin"
    />
  );
}
