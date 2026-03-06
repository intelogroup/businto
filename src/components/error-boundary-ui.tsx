"use client";

interface ErrorBoundaryUIProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}

export function ErrorBoundaryUI({
  error,
  reset,
  title = "Something went wrong",
  description = "An unexpected error occurred on this page.",
  backHref,
  backLabel = "Go back",
}: ErrorBoundaryUIProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <svg
          className="h-8 w-8 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        {description}
        {error.digest && (
          <span className="block mt-1 font-mono text-xs opacity-50">
            ref: {error.digest}
          </span>
        )}
      </p>
      <div className="flex gap-3 mt-2">
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Try again
        </button>
        {backHref && (
          <a
            href={backHref}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            {backLabel}
          </a>
        )}
      </div>
    </div>
  );
}
