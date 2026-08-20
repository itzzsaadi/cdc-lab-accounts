"use client";

import { useEffect, useRef } from "react";

/**
 * Native <dialog>-backed modal — browsers handle focus-trapping,
 * Escape-to-close, and focus return to the invoking element for free when
 * `showModal()` is used, so none of that is hand-rolled here (per the
 * "prefer native browser capabilities" instruction).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="bg-surface-container-lowest text-on-surface w-full max-w-lg rounded-xl p-6 shadow-[0px_4px_12px_rgba(18,48,71,0.08)] backdrop:bg-black/40"
    >
      <h2 id="modal-title" className="text-headline-sm mb-4 font-semibold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
