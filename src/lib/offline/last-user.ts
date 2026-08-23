import { offlineDbName } from "./db";

/**
 * Resolves which per-user offline database, if any, the unauthenticated
 * Offline Entry Workspace (`src/app/offline-entry/page.tsx`) may open —
 * without ever trusting a bare, freely-editable value as proof of which
 * account it belongs to.
 *
 * An earlier revision stored the signed-in user's id in `localStorage`
 * (a "last known user" breadcrumb) and trusted whatever id was found
 * there. That was a real vulnerability: anyone with DevTools access to
 * this origin — or a device shared after someone else signed out with
 * work still queued (NFR-SEC-09 deliberately never deletes a non-empty
 * queue) — could edit that value to an arbitrary *other* real user's id.
 * `getOfflineDb` would then happily open (or silently create) that
 * user's database, letting an attacker both read their cached reference
 * data and, worse, queue new operations that would sync under that
 * victim's identity the next time they genuinely signed back in on this
 * device. A bare id is not something the SRS or CLAUDE.md ever meant to
 * stand in for authentication.
 *
 * Instead, this enumerates the IndexedDB databases *actually present* on
 * this device (`indexedDB.databases()`) and only ever offers access to
 * one that a real, previously-authenticated session already created —
 * `getOfflineDb` (db.ts) is called only from inside the authenticated
 * shell, so a `cdc-offline-<id>` database's mere existence already is
 * the proof of a genuine prior sign-in for that id on this exact browser
 * profile. This page never creates a new one for an id nobody has ever
 * signed in as here. If sign-out ever clears the underlying database
 * (NFR-SEC-09, `cleanup.ts`, whenever the queue was empty), it
 * simultaneously and automatically stops appearing here — there is no
 * separate breadcrumb left behind to go stale or be forged.
 */
const OFFLINE_DB_PREFIX = offlineDbName("");

export type OfflineAccessResolution =
  | { status: "none" }
  | { status: "single"; userId: string }
  /** More than one account has genuinely signed in on this device and
   * still has a local database — never guessed at; the workspace must
   * ask the user to disambiguate by signing in online once instead. */
  | { status: "ambiguous" };

export async function resolveOfflineAccessibleUserId(): Promise<OfflineAccessResolution> {
  let names: string[];
  try {
    const databases = await indexedDB.databases();
    names = databases
      .map((entry) => entry.name ?? "")
      .filter((name): name is string => name.startsWith(OFFLINE_DB_PREFIX));
  } catch {
    return { status: "none" };
  }

  if (names.length === 0) {
    return { status: "none" };
  }
  if (names.length > 1) {
    return { status: "ambiguous" };
  }
  return { status: "single", userId: names[0].slice(OFFLINE_DB_PREFIX.length) };
}
