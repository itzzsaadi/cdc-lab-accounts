import type { MetadataRoute } from "next";

/**
 * FR-OFF PWA shell. Icons are locally-derived from the existing approved
 * sidebar brand mark (see src/lib/brand/icon.tsx) — never placeholder or
 * stock art. `theme_color`/`background_color` match the design system's
 * own `--color-primary` teal and light surface tokens (globals.css).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CDC Lab Accounts System",
    short_name: "CDC Lab Accounts",
    description: "Daily income, expenses, and profit tracking for CDC Laboratories.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f9ff",
    theme_color: "#005c55",
    icons: [
      { src: "/manifest-icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/manifest-icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/manifest-icons/512-maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
