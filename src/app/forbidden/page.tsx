import { Card } from "../../components/ui/Card";

/**
 * Shown when an authenticated but under-privileged user hits a protected
 * route directly. Server-side enforcement (src/lib/permissions/guard.ts)
 * is what actually blocks the request; this page is only the visible
 * result. Deliberately kept outside the `(app)` route group — a forbidden
 * user's role may not support rendering the authenticated shell/sidebar
 * meaningfully, so this stays a bare, chrome-less page, just restyled onto
 * the shared design tokens.
 */
export default function ForbiddenPage() {
  return (
    <main
      id="main-content"
      className="bg-surface flex min-h-screen items-center justify-center p-4"
    >
      <Card className="max-w-md p-8 text-center">
        <h1 className="text-on-surface text-2xl font-semibold">Not available</h1>
        <p className="text-on-surface-variant mt-2 text-sm">
          Your account does not have access to this page.
        </p>
      </Card>
    </main>
  );
}
