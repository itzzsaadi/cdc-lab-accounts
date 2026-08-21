import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

/**
 * Minimal data-table primitives — sticky header, label-caps uppercase
 * headers, row hover wash (docs/UI_REQUIREMENTS.md §10/§15). Deliberately
 * thin: no sorting/pagination/virtualization — those are business-screen
 * concerns for a later phase, not part of this shell foundation.
 */
export function Table({ className = "", ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-left text-sm ${className}`} {...rest} />
    </div>
  );
}

export function Thead({ className = "", ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={`bg-surface-container-low sticky top-0 ${className}`} {...rest} />;
}

export function Th({ className = "", ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`text-on-surface-variant px-4 py-3 text-xs font-bold tracking-wide uppercase ${className}`}
      {...rest}
    />
  );
}

export function Tbody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function Tr({ className = "", ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={`hover:bg-surface-container-low border-outline-variant/40 border-t ${className}`}
      {...rest}
    />
  );
}

export function Td({ className = "", ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`px-4 py-3 ${className}`} {...rest} />;
}
