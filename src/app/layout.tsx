import type { Metadata, Viewport } from "next";
import { inter, materialSymbolsOutlined } from "../lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "CDC Lab Accounts System",
  description: "Lab Accounts & Asset Management System — CDC Laboratories, Gujranwala.",
};

/** Matches the design system's own `--color-primary` (globals.css) and
 * app/manifest.ts's theme_color — the PWA install/status-bar chrome uses
 * the same teal as the rest of the app, never a default browser color. */
export const viewport: Viewport = {
  themeColor: "#005c55",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${materialSymbolsOutlined.variable}`}>
      <body className="font-sans antialiased">
        <a
          href="#main-content"
          className="bg-primary text-on-primary focus:outline-none sr-only rounded-lg px-4 py-2 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100]"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
