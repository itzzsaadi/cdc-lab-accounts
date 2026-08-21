import type { TextareaHTMLAttributes } from "react";

/** Same visual language as TextInput/Select — used for the one free-form note field the schema actually has (Cash Receipt's required note, Counter Income's optional note). */
export function Textarea({
  id,
  label,
  error,
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { id: string; label: string; error?: string }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-on-surface block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`border-outline-variant text-on-surface bg-surface-container-lowest focus:ring-primary focus:border-primary block w-full resize-none rounded-lg border px-3 py-2.5 text-sm transition-colors focus:ring-2 ${className}`}
        {...rest}
      />
      {error ? (
        <p id={`${id}-error`} className="text-error text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
