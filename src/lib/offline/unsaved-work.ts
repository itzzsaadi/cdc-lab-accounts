/**
 * FR-OFF-10's actual gate for the native `beforeunload` prompt, extracted
 * as a pure function so the condition itself — not just the wiring — is
 * unit-testable. `SYNCED` operations are already excluded upstream (they
 * never contribute to `pendingCount`/`conflictCount`/`failedCount`), so an
 * empty or fully-synced queue always resolves to `false` here; a page
 * reload or client-side navigation never actually loses anything sitting
 * in IndexedDB regardless, but a real, uncommitted browser-tab close is
 * still worth warning about while genuine `QUEUED`/`SYNCING`, `FAILED`, or
 * `CONFLICT` operations exist.
 */
export function shouldWarnBeforeUnload(counts: {
  pendingCount: number;
  conflictCount: number;
  failedCount: number;
}): boolean {
  return counts.pendingCount + counts.conflictCount + counts.failedCount > 0;
}
