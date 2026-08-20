"use client";

import { Alert } from "../../components/ui/Alert";

/** Generic error boundary — no stack trace or internal detail shown (NFR-SEC-10 spirit; formally verified in Phase 8). */
export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4">
      <Alert variant="error">Something went wrong loading this page.</Alert>
      <button
        type="button"
        onClick={reset}
        className="text-primary hover:text-primary-container text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
