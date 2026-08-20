import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "destructive-ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-primary hover:bg-primary-container text-on-primary",
  secondary:
    "border border-secondary text-secondary hover:bg-secondary-container/20 bg-transparent",
  "destructive-ghost": "text-error hover:bg-error-container/40 bg-transparent",
};

/** Extracted from the existing Sign In screen's ad hoc button classes (docs/ui/stitch-export) — not redesigned, just made reusable. */
export function Button({
  variant = "primary",
  className = "",
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`flex min-h-touch-target-min items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${className}`}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
