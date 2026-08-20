/** Shared shell for every pre-authentication screen — the same card the Sign In screen uses, reproducing the Stitch design's card/spacing/color, extended (not copied) for states the Stitch handoff didn't include (docs/UI_REQUIREMENTS.md §11 of the Phase 2 plan). */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface min-h-screen flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-[440px] bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-md overflow-hidden">
        <div className="p-8 pb-6 text-center border-b border-outline-variant/20">
          <h1 className="text-2xl font-semibold text-on-surface mb-2">{title}</h1>
          {subtitle ? <p className="text-sm text-on-surface-variant">{subtitle}</p> : null}
        </div>
        <div className="p-8">{children}</div>
      </div>
    </div>
  );
}
