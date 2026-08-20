import type { InputHTMLAttributes, ReactNode } from "react";

/** Extracted from the existing Sign In form fields — persistent (non-floating) label per docs/UI_REQUIREMENTS.md §14. */
export function TextInput({
  id,
  label,
  error,
  trailing,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-on-surface block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`border-outline-variant text-on-surface bg-surface-container-lowest focus:ring-primary focus:border-primary h-11 block w-full rounded-lg border px-3 py-2.5 text-sm transition-colors focus:ring-2 ${trailing ? "pr-10" : ""} ${className}`}
          {...rest}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">{trailing}</div>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-error text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
