"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * Contextual information tooltip — renders a small "ⓘ" icon that shows a
 * tooltip on hover (desktop) or tap (mobile).
 *
 * Positioning is automatic: the tooltip renders below by default, but flips
 * above / adjusts horizontally if it would overflow the viewport.
 *
 * Accessible: the trigger is a `<button>` with `aria-describedby` linking to
 * the tooltip content panel which has `role="tooltip"`.
 */
export function InfoTip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Position state — computed on open
  const [pos, setPos] = useState<{ top?: string; bottom?: string; left: string; transformX: string }>({
    left: "50%",
    transformX: "-50%",
    top: "calc(100% + 6px)",
  });

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const tRect = trigger.getBoundingClientRect();
    const ttRect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Vertical: prefer below, flip above if not enough space
    const spaceBelow = vh - tRect.bottom;
    const placeAbove = spaceBelow < ttRect.height + 12 && tRect.top > ttRect.height + 12;

    // Horizontal: center, but shift if clipping viewport
    let leftPx = tRect.left + tRect.width / 2;
    let transformX = "-50%";
    const halfTt = ttRect.width / 2;

    if (leftPx - halfTt < 8) {
      // Clipping left edge
      leftPx = 8;
      transformX = "0%";
    } else if (leftPx + halfTt > vw - 8) {
      // Clipping right edge
      leftPx = vw - 8;
      transformX = "-100%";
    }

    // Convert to relative positioning (parent is `relative`)
    setPos(
      placeAbove
        ? { bottom: "calc(100% + 6px)", left: "50%", transformX }
        : { top: "calc(100% + 6px)", left: "50%", transformX },
    );
  }, []);

  // Recompute position when opening
  useEffect(() => {
    if (!open) return;
    // Wait one frame for the tooltip to render & measure
    const raf = requestAnimationFrame(computePosition);
    return () => cancelAnimationFrame(raf);
  }, [open, computePosition]);

  // Close on outside click (mobile)
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function clearHoverTimeout() {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
  }

  return (
    <span className="relative inline-flex items-center align-middle">
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={open ? tooltipId : undefined}
        aria-label="More information"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => {
          clearHoverTimeout();
          hoverTimeout.current = setTimeout(() => setOpen(true), 200);
        }}
        onMouseLeave={() => {
          clearHoverTimeout();
          hoverTimeout.current = setTimeout(() => setOpen(false), 150);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-on-surface-variant hover:text-primary focus-visible:text-primary ml-1 inline-flex cursor-help items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        <span className="material-symbols-outlined text-[16px]" aria-hidden>
          info
        </span>
      </button>
      {open && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          onMouseEnter={() => clearHoverTimeout()}
          onMouseLeave={() => {
            hoverTimeout.current = setTimeout(() => setOpen(false), 150);
          }}
          className="bg-inverse-surface text-inverse-on-surface absolute z-50 w-64 rounded-lg px-3 py-2 text-xs leading-relaxed shadow-lg"
          style={{
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            transform: `translateX(${pos.transformX})`,
          }}
        >
          {children}
        </div>
      )}
    </span>
  );
}
