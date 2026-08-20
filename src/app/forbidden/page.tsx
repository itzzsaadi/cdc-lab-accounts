/** Shown when an authenticated but under-privileged user hits a protected route directly. Server-side enforcement (src/lib/permissions/guard.ts) is what actually blocks the request; this page is only the visible result. */
export default function ForbiddenPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-on-surface">Not available</h1>
      <p className="text-sm text-on-surface-variant mt-2">
        Your account does not have access to this page.
      </p>
    </main>
  );
}
