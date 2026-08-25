"use client";

import { useEffect, useRef } from "react";

/**
 * Native <dialog>-backed modal — browsers handle focus-trapping,
 * Escape-to-close, and focus return to the invoking element for free when
 * `showModal()` is used, so none of that is hand-rolled here (per the
 * "prefer native browser capabilities" instruction).
 *
 * Two things are made explicit here rather than left to browser defaults,
 * because both defaults break in practice:
 *
 * 1. **Centering.** A `dialog:modal`'s automatic centering relies on the
 *    UA stylesheet's `margin: auto`, which Tailwind's Preflight reset
 *    (`*, ::before, ::after { margin: 0 }`) overrides — without an
 *    explicit `m-auto` here the dialog collapses to the top-left corner.
 *    `fixed inset-0 m-auto` (plus a bounded `max-h`/`max-w` and its own
 *    `overflow-y-auto` for internal scrolling) reproduces true horizontal
 *    *and* vertical centering explicitly, since the UA rule alone only
 *    ever centered vertically to begin with.
 * 2. **Text direction.** A `<dialog>` shown via `showModal()` only moves
 *    to the top layer for *painting* — it remains, for CSS inheritance
 *    purposes, wherever it was declared in the DOM. Every row-action
 *    trigger in this app renders its edit/archive/history `Modal`
 *    alongside the action buttons inside a `<Td className="text-right">`
 *    (the Actions column), so without an explicit reset every label and
 *    line of text inside the dialog silently inherited that cell's
 *    right-alignment. Setting `text-left` here overrides that inherited
 *    value for the dialog and everything inside it, regardless of where
 *    in the page a given `Modal` happens to be mounted.
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
      className="bg-surface-container-lowest text-on-surface fixed inset-0 m-auto max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-xl p-6 text-left shadow-[0px_4px_12px_rgba(18,48,71,0.08)] backdrop:bg-black/40 sm:w-full"
    >
      <h2 id="modal-title" className="text-headline-sm mb-4 font-semibold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
