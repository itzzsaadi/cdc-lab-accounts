"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getOfflineDb, closeOfflineDb } from "../../lib/offline/db";
import {
  enqueueOperation,
  resolveConflictKeepLocal,
  resolveConflictKeepServer,
  retryNow,
} from "../../lib/offline/queue";
import { runSync } from "../../lib/offline/sync-engine";
import { refreshReferenceCache, pruneRecentRecords } from "../../lib/offline/reference-cache";
import type { NewOperationInput, QueuedOperation } from "../../lib/offline/types";

interface OfflineContextValue {
  enqueue: (input: NewOperationInput) => Promise<void>;
  operations: QueuedOperation[];
  pendingCount: number;
  conflictCount: number;
  failedCount: number;
  isSyncing: boolean;
  /** Best-effort UI hint from `navigator.onLine` only — never the gate an
   * actual sync attempt relies on; `runSync` always independently verifies
   * a real authenticated connection (mandatory decision #2). */
  isOnline: boolean;
  triggerSyncNow: () => Promise<void>;
  resolveKeepLocal: (operationId: string) => Promise<void>;
  resolveKeepServer: (operationId: string) => Promise<void>;
  retry: (operationId: string) => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

/**
 * The one place every offline-aware entry form and the Sync Center read
 * queue/connection state from, and the one place that actually drives
 * sync attempts (FR-OFF). Mounted once per signed-in user, at the
 * authenticated shell (src/components/layout/AuthenticatedShell.tsx),
 * keyed by `userId` so a different user signing in on the same device
 * opens a completely separate IndexedDB database (src/lib/offline/db.ts)
 * — never the prior user's queue.
 */
export function OfflineProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const db = useMemo(() => getOfflineDb(userId), [userId]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const syncingRef = useRef(false);

  const operations = useLiveQuery(() => db.operations.orderBy("createdAt").toArray(), [db], []);
  const pendingCount = operations.filter((op) => op.status === "QUEUED" || op.status === "SYNCING")
    .length;
  const conflictCount = operations.filter((op) => op.status === "CONFLICT").length;
  const failedCount = operations.filter((op) => op.status === "FAILED").length;

  const triggerSyncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      await runSync(db);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [db]);

  useEffect(() => {
    // Service worker registration is an enhancement only (mandatory
    // decision #7) — never awaited, never a precondition for anything
    // else in this provider.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    // Closing on unmount (e.g. after signing out and navigating away from
    // the authenticated shell) only releases the IndexedDB connection —
    // it never deletes the database itself, so a later sign-in (by the
    // same or a different user) always finds its own queue intact.
    return () => {
      closeOfflineDb();
    };
  }, []);

  useEffect(() => {
    refreshReferenceCache(db).catch(() => {});
    pruneRecentRecords(db).catch(() => {});
    void triggerSyncNow(); // app startup

    function handleOnline() {
      setIsOnline(true);
      void triggerSyncNow(); // verified reconnect (runSync re-verifies itself)
    }
    function handleOffline() {
      setIsOnline(false);
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") void triggerSyncNow();
    }
    function handleFocus() {
      void triggerSyncNow();
    }
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "BACKGROUND_SYNC_HINT") void triggerSyncNow();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    navigator.serviceWorker?.addEventListener?.("message", handleMessage);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      navigator.serviceWorker?.removeEventListener?.("message", handleMessage);
    };
    // triggerSyncNow is stable for a given `db`; re-running this effect
    // whenever it changes identity would double-register listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  const enqueue = useCallback(
    async (input: NewOperationInput) => {
      await enqueueOperation(db, input);
      // Background Sync registration: a pure enhancement, never the
      // dependable path (mandatory decision #7) — the listeners above
      // are what actually drive sync in every browser this app supports.
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then((registration) => {
            const syncManager = (
              registration as unknown as { sync?: { register(tag: string): Promise<void> } }
            ).sync;
            return syncManager?.register("cdc-offline-sync");
          })
          .catch(() => {});
      }
      void triggerSyncNow();
    },
    [db, triggerSyncNow],
  );

  const resolveKeepLocal = useCallback(
    async (operationId: string) => {
      await resolveConflictKeepLocal(db, operationId, crypto.randomUUID());
      void triggerSyncNow();
    },
    [db, triggerSyncNow],
  );
  const resolveKeepServer = useCallback(
    (operationId: string) => resolveConflictKeepServer(db, operationId),
    [db],
  );
  const retry = useCallback(
    async (operationId: string) => {
      await retryNow(db, operationId);
      void triggerSyncNow();
    },
    [db, triggerSyncNow],
  );

  const value: OfflineContextValue = {
    enqueue,
    operations,
    pendingCount,
    conflictCount,
    failedCount,
    isSyncing,
    isOnline,
    triggerSyncNow,
    resolveKeepLocal,
    resolveKeepServer,
    retry,
  };

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOfflineSync(): OfflineContextValue {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    throw new Error("useOfflineSync must be used within an OfflineProvider.");
  }
  return ctx;
}
