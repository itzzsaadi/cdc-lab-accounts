import type { SelectHTMLAttributes } from "react";

export function Select({
  id,
  label,
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { id: string; label: string }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-on-surface block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        className={`border-outline-variant text-on-surface bg-surface-container-lowest focus:ring-primary focus:border-primary h-11 block w-full rounded-lg border px-3 text-sm transition-colors focus:ring-2 ${className}`}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}
