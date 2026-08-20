import { Card } from "../ui/Card";

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
    <main
      id="main-content"
      className="bg-surface flex min-h-screen flex-col items-center justify-center p-4"
    >
      <Card className="w-full max-w-[440px] overflow-hidden !rounded-xl !shadow-md">
        <div className="border-outline-variant/20 border-b p-8 pb-6 text-center">
          <h1 className="text-on-surface mb-2 text-2xl font-semibold">{title}</h1>
          {subtitle ? <p className="text-on-surface-variant text-sm">{subtitle}</p> : null}
        </div>
        <div className="p-8">{children}</div>
      </Card>
    </main>
  );
}
