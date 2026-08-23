"use client";

import { inter } from "../lib/fonts";
import "./globals.css";

/**
 * NFR-SEC-10, root-level. `(app)/error.tsx` only catches failures inside
 * the `(app)` route group's own subtree; a failure in the *root layout*
 * itself (or anywhere outside a group that has its own boundary) escapes
 * it entirely and would otherwise render Next.js's built-in error page.
 * `global-error.tsx` is the only boundary that replaces the root layout,
 * so it must supply its own `<html>`/`<body>`.
 *
 * The `error` prop is deliberately not rendered in any form — not its
 * `message`, not its `digest`. A digest is a server-side correlation id,
 * and while it is not itself a secret, showing it invites a support flow
 * where users read internal identifiers aloud; the server-side structured
 * log (src/lib/observability/logger.ts) is where that correlation belongs.
 */
export default function GlobalError() {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-surface text-on-surface font-sans antialiased">
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-on-surface-variant max-w-md text-sm">
            The application could not load. Please try again. If this keeps happening, contact your
            system administrator.
          </p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error replaces the root layout when rendering has already failed; next/link needs the router context that may be exactly what broke, so a full page load is the only reliable escape from this state. */}
          <a
            href="/"
            className="bg-primary text-on-primary rounded-lg px-4 py-2 text-sm font-medium"
          >
            Return to the start
          </a>
        </main>
      </body>
    </html>
  );
}
