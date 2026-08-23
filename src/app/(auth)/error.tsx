"use client";

/**
 * NFR-SEC-10. The `(auth)` group (sign-in, forgot/reset password,
 * invitation acceptance) had no error boundary of its own, so a failure
 * there escaped to the framework default. Pre-authentication screens are
 * exactly where a leaked message matters most — an unauthenticated caller
 * must learn nothing about the database, the mail transport, or which
 * accounts exist — so nothing from `error` is rendered, and the wording is
 * identical regardless of what actually failed.
 */
export default function AuthError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-on-surface text-xl font-semibold">Something went wrong</h1>
      <p className="text-on-surface-variant max-w-md text-sm">
        We couldn&rsquo;t complete that request. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="bg-primary text-on-primary rounded-lg px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
