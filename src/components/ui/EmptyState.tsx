export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-outline-variant flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <p className="text-on-surface text-sm font-medium">{title}</p>
      {description ? <p className="text-on-surface-variant text-sm">{description}</p> : null}
    </div>
  );
}
