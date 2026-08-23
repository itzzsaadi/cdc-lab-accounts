/**
 * A small, deliberately non-secret breadcrumb: which user id last had
 * `OfflineProvider` mounted on this device. It exists purely so the
 * static, unauthenticated Offline Entry Workspace
 * (`src/app/offline-entry/page.tsx`) — reachable with zero connectivity,
 * see its own file comment — knows *which* per-user IndexedDB database
 * (`src/lib/offline/db.ts`) to write a newly-queued entry into when there
 * is no live session to ask. It is never used to authenticate or
 * authorize anything: the real session cookie (HttpOnly, never readable
 * from this code) is what the server checks once the entry actually
 * syncs, exactly as for any other queued operation. Anyone with access to
 * this device's storage already has access to that user's own IndexedDB
 * data directly, so storing a bare id alongside it discloses nothing new.
 */
const LAST_KNOWN_USER_ID_KEY = "cdc-offline-last-user-id";

export function rememberLastUserId(userId: string): void {
  try {
    localStorage.setItem(LAST_KNOWN_USER_ID_KEY, userId);
  } catch {
    // Storage can be unavailable (private browsing, quota) — this is a
    // best-effort convenience, never a requirement for online use.
  }
}

export function getLastKnownUserId(): string | null {
  try {
    return localStorage.getItem(LAST_KNOWN_USER_ID_KEY);
  } catch {
    return null;
  }
}
