type Variant = "info" | "warning" | "error";

const VARIANT_CLASSES: Record<Variant, string> = {
  info: "bg-surface-container-low text-on-surface-variant border-outline-variant",
  warning: "bg-[#fff7e6] text-[#7a4a00] border-[#f59e0b]",
  error: "bg-error-container text-on-error-container border-error",
};

/** Generic info/warning/error callout — the shape Monthly Expenses/Partner Dashboard's warning callouts and future validation errors reuse. */
export function Alert({
  variant = "info",
  role,
  children,
}: {
  variant?: Variant;
  role?: "alert" | "status";
  children: React.ReactNode;
}) {
  return (
    <div
      role={role ?? (variant === "error" ? "alert" : "status")}
      className={`rounded-lg border px-3 py-2 text-sm ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </div>
  );
}
