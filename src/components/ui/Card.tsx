import type { HTMLAttributes } from "react";

/** The white/outline-variant/rounded card primitive used across every Stitch screen (docs/UI_REQUIREMENTS.md §9). */
export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-surface-container-lowest border-outline-variant rounded-lg border shadow-[0px_1px_2px_rgba(18,48,71,0.08)] ${className}`}
      {...rest}
    />
  );
}
