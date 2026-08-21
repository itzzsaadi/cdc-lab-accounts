import type { InputHTMLAttributes } from "react";

export function Checkbox({
  id,
  label,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string }) {
  return (
    <div className="flex items-center">
      <input
        id={id}
        type="checkbox"
        className={`text-primary border-outline-variant h-4 w-4 rounded ${className}`}
        {...rest}
      />
      <label htmlFor={id} className="text-on-surface-variant ml-2 block text-sm">
        {label}
      </label>
    </div>
  );
}
