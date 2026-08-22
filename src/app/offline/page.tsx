import { Card } from "../../components/ui/Card";

/**
 * The one page the service worker (public/sw.js) is allowed to serve from
 * its cache when a navigation fails while offline (CLAUDE.md Phase 6
 * mandatory decision #6) — genuinely static, no session check, no
 * financial data, so it is always safe to show regardless of who is
 * signed in or what they were looking at. Kept outside the `(app)` route
 * group, matching forbidden/page.tsx — the authenticated shell requires a
 * live session to render meaningfully, which is exactly what may not be
 * available here.
 */
export default function OfflinePage() {
  return (
    <main
      id="main-content"
      className="bg-surface flex min-h-screen items-center justify-center p-4"
    >
      <Card className="max-w-md p-8 text-center">
        <h1 className="text-on-surface text-2xl font-semibold">You&rsquo;re offline</h1>
        <p className="text-on-surface-variant mt-2 text-sm">
          This page couldn&rsquo;t be reached without a connection. Any entries you&rsquo;ve
          already made are saved on this device and will sync automatically once you&rsquo;re
          back online.
        </p>
        <p className="text-on-surface-variant mt-4 text-xs">
          Reconnect and reopen the app to continue.
        </p>
      </Card>
    </main>
  );
}
