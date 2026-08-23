import { OfflineEntryWorkspace } from "../../components/offline/OfflineEntryWorkspace";

/**
 * FR-OFF: the one entry-creation screen the service worker (public/sw.js)
 * precaches and can serve entirely from cache, so it is reachable after
 * reopening the installed app with zero connectivity — unlike Daily
 * Expenses, Counter Income, Party Income, and Monthly Expenses, each of
 * which is a per-request, authenticated Server Component whose `navigate`
 * fetch simply cannot complete without a live connection (an inherent
 * Next.js App Router constraint, not something this page works around —
 * see docs/offline-sync.md). This page itself does no session check, no
 * Prisma call, and renders no financial data (no totals, no history, no
 * other user's figures) — it is safe to precache and serve to anyone,
 * exactly like `/offline` and `/sign-in`. The actual entry forms
 * (`OfflineEntryWorkspace`, a Client Component) read this device's own
 * already-cached reference data and always queue through the same
 * offline-sync machinery every other entry screen uses; nothing here
 * bypasses server-side validation or authorization — those still run in
 * full the moment each queued entry actually syncs.
 */
export default function OfflineEntryPage() {
  return (
    <main id="main-content" className="bg-surface mx-auto min-h-screen max-w-2xl p-gutter">
      <h1 className="text-display-lg text-on-background mb-1 mt-6 font-bold">
        Offline Entry Workspace
      </h1>
      <p className="text-on-surface-variant mb-6 text-sm">
        Record entries here even with no connection at all — reachable straight from reopening the
        installed app while offline.
      </p>
      <OfflineEntryWorkspace />
    </main>
  );
}
