/** Reduced-motion-aware skeleton block — the pulse animation is disabled globally under prefers-reduced-motion (globals.css). */
export function LoadingSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`bg-surface-container-high animate-pulse rounded-lg ${className}`}
    />
  );
}
