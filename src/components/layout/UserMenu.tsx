"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "../ui/Avatar";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { signOutAction } from "../../server/actions/auth";
import { useOfflineSync } from "../offline/OfflineProvider";

/**
 * Native <dialog>-backed menu — Escape-to-close, focus-trap while open, and
 * focus return to the trigger button on close all come from `showModal()`
 * for free (no hand-rolled focus management). Styled as a small anchored
 * panel near the trigger rather than a centered card, unlike `ui/Modal`.
 */
export function UserMenu({ fullName, roleLabel }: { fullName: string; roleLabel: string }) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const { pendingCount, failedCount, conflictCount, clearLocalDataOnSignOut } = useOfflineSync();
  const unsyncedCount = pendingCount + failedCount + conflictCount;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.show();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Close on Escape key (showModal() handled this for free; show() does not)
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Close when clicking outside the dialog
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function doSignOut() {
    startTransition(async () => {
      await signOutAction();
      // NFR-SEC-09: `clearLocalDataOnSignOut` re-checks the *actual*
      // current queue directly against IndexedDB before deleting anything
      // — it silently no-ops if the user chose "Sign out anyway" with
      // work still pending, never trusting this component's own
      // (possibly stale) `unsyncedCount` render as the deletion gate.
      await clearLocalDataOnSignOut().catch(() => {});
      setOpen(false);
      setConfirmOpen(false);
      router.push("/sign-in");
    });
  }

  /**
   * FR-AUTH-09: warn before signing out with entries still waiting to
   * upload. Signing out never erases anything — the offline queue lives in
   * this browser's IndexedDB, keyed by user id (src/lib/offline/db.ts), and
   * is still there the next time this same account signs in on this same
   * device. The confirmation below is a heads-up, not a destructive-action
   * prompt, and says so plainly rather than implying deletion.
   */
  function handleSignOut() {
    if (unsyncedCount > 0) {
      setConfirmOpen(true);
      return;
    }
    doSignOut();
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="min-h-touch-target-min flex items-center gap-2 rounded-lg px-2 py-1 transition-colors"
      >
        <Avatar fullName={fullName} />
        <span className="text-on-surface-variant hidden text-sm sm:inline">{roleLabel}</span>
        <span className="material-symbols-outlined text-on-surface-variant" aria-hidden>
          expand_more
        </span>
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
        aria-label="User menu"
        className="bg-surface-container-lowest text-on-surface absolute top-full right-0 z-50 mt-1 m-0 w-56 max-w-[calc(100vw-1rem)] rounded-lg p-2 shadow-[0px_4px_12px_rgba(18,48,71,0.08)]"
      >
        <p className="text-on-surface truncate px-3 py-2 text-sm font-medium">{fullName}</p>
        <p className="text-on-surface-variant px-3 pb-2 text-xs">{roleLabel}</p>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isPending}
          className="text-error hover:bg-error-container/40 min-h-touch-target-min flex w-full items-center gap-2 rounded-lg px-3 text-left text-sm disabled:opacity-60"
        >
          <span className="material-symbols-outlined" aria-hidden>
            logout
          </span>
          {isPending ? "Signing out…" : "Sign out"}
        </button>
      </dialog>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="You have entries that haven't synced yet"
      >
        <p className="text-on-surface-variant text-sm">
          {unsyncedCount} {unsyncedCount === 1 ? "entry hasn't" : "entries haven't"} finished
          syncing to the server yet. They&rsquo;re saved on this device and will try again the next
          time you sign in here — nothing will be deleted.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={isPending}>
            Stay signed in
          </Button>
          <Button variant="destructive-ghost" onClick={doSignOut} disabled={isPending}>
            {isPending ? "Signing out…" : "Sign out anyway"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
