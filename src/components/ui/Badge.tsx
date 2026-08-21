/** Generic "dot + text" badge shape (DESIGN.md's sync/status badge pattern) — the color is caller-supplied since real sync-state colors are a Phase 6 concern; this phase only provides the reusable shape. */
export function Badge({ dotColor, children }: { dotColor: string; children: React.ReactNode }) {
  return (
    <span className="text-on-surface-variant inline-flex items-center gap-1.5 text-sm">
      <span className="rounded-pill inline-block h-2 w-2" style={{ backgroundColor: dotColor }} />
      {children}
    </span>
  );
}
