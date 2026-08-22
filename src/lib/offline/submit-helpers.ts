/**
 * A Server Action call fails with a plain `TypeError` (e.g. "Failed to
 * fetch") when the browser has no usable connection — there is no
 * network-specific error subtype Next.js exposes for this, so a `fetch`-
 * style `TypeError`, combined with `navigator.onLine` already being false,
 * is the practical signal every offline-aware entry form uses to decide
 * "queue this instead of showing a generic error." A `TypeError` for any
 * other reason (a genuine bug) still gets queued rather than lost — worst
 * case it surfaces later as a REJECTED sync result in the Sync Center,
 * which is safer than discarding a user's entry.
 */
export function isLikelyOfflineError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }
  return error instanceof TypeError;
}
