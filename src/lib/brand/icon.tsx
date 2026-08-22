/**
 * The PWA app icon, derived directly from the existing approved sidebar
 * brand mark (`SidebarBrand` in src/components/layout/ShellChrome.tsx): a
 * rounded square in the design system's own `--color-primary` teal
 * (#005c55) with a white laboratory-flask glyph — never placeholder or
 * stock artwork. The flask is a plain hand-drawn SVG path (no external
 * icon font/asset dependency), evoking the sidebar's Material Symbols
 * "biotech" mark without needing that font's glyph outlines at build
 * time.
 *
 * `padding` controls the safe-zone margin around the glyph — a maskable
 * icon (Android's adaptive-icon spec) needs generous padding so the glyph
 * survives being cropped to a circle/squircle by the OS; a plain icon can
 * use much less.
 */
export const BRAND_PRIMARY = "#005c55";
export const BRAND_ON_PRIMARY = "#ffffff";

export function BrandIcon({
  size,
  padding,
  rounded = true,
}: {
  size: number;
  padding: number;
  rounded?: boolean;
}) {
  const glyphSize = size - padding * 2;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_PRIMARY,
        borderRadius: rounded ? size * 0.22 : 0,
      }}
    >
      <svg
        width={glyphSize}
        height={glyphSize}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* A simple flask: neck + conical body + a liquid fill line. */}
        <path
          d="M10 2h4v5.2l4.6 8.6c.9 1.7-.3 3.7-2.2 3.7H7.6c-1.9 0-3.1-2-2.2-3.7L10 7.2V2z"
          stroke={BRAND_ON_PRIMARY}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <path d="M8.3 14h7.4" stroke={BRAND_ON_PRIMARY} strokeWidth={1.6} />
      </svg>
    </div>
  );
}
