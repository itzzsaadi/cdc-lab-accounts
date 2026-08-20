import localFont from "next/font/local";

/**
 * Self-hosted via `next/font/local` — no request to Google Fonts at
 * runtime or build time (approved Phase 3A decision, supersedes the
 * `next/font/google` option considered during planning). Font files and
 * their OFL-1.1 licenses live under
 * `public/design-assets/fonts/` — see `PROVENANCE.md` there for source,
 * version, license, and checksum of each file.
 */
export const inter = localFont({
  src: [
    {
      path: "../../public/design-assets/fonts/inter/inter-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/design-assets/fonts/inter/inter-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/design-assets/fonts/inter/inter-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/design-assets/fonts/inter/inter-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-inter",
  display: "swap",
  fallback: ["system-ui", "arial", "sans-serif"],
});

/**
 * Material Symbols Outlined — weight 400 only, matching this phase's
 * shell icon usage (no filled/active-state icon variant is used yet; see
 * PROVENANCE.md for why the variable FILL/GRAD/opsz axes aren't vendored).
 * Consumed the same way the Stitch handoff's icons are: a `<span
 * className="material-symbols-outlined">icon_name</span>` ligature, styled
 * via `globals.css`'s `.material-symbols-outlined` rule referencing this
 * variable.
 */
export const materialSymbolsOutlined = localFont({
  src: "../../public/design-assets/fonts/material-symbols-outlined/material-symbols-outlined-latin-400-normal.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-material-symbols-outlined",
  display: "block",
  fallback: ["sans-serif"],
});
