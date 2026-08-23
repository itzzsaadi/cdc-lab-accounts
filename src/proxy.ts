import { NextResponse, type NextRequest } from "next/server";

/**
 * Phase 8A — enforced, nonce-based Content-Security-Policy (NFR-SEC-06).
 *
 * `proxy.ts` is Next 16's replacement for `middleware.ts` (the middleware
 * convention is deprecated and renamed — see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
 * It runs before rendering, which is the only point at which a fresh
 * per-request nonce can be generated *and* handed to Next.js in time for
 * it to stamp onto the framework, bundle, and inline hydration scripts it
 * emits.
 *
 * **Enforced from the start, never report-only.** A report-only policy
 * would ship a release whose security depends on someone reading reports,
 * which is not a control. The cost of enforcing is that a genuine
 * violation breaks a page rather than being logged — so this is proven by
 * a real browser test (`tests/e2e/security-headers.spec.ts`) that loads
 * every screen and fails on any console CSP violation, rather than by
 * inspecting the header string alone.
 *
 * `'strict-dynamic'` means the nonce on Next's own bootstrap script is
 * what authorises the bundles it then loads, so no host allowlist is
 * needed and no `'unsafe-inline'` appears anywhere in `script-src`. The
 * `'unsafe-inline'` that browsers ignore in the presence of a nonce is
 * deliberately *not* included as a legacy fallback: every browser this
 * system supports (NFR-CMP-01/02) understands nonces.
 *
 * `'unsafe-eval'` is development-only, required because React's dev build
 * uses `eval` to reconstruct server-side error stacks in the browser.
 * Production never gets it.
 *
 * Two pages are excluded via the matcher below and carry a static policy
 * from `src/lib/security/headers.ts` instead — see `STATIC_PAGE_CSP`
 * there for why, and for the bounded exposure that creates.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Dev needs 'unsafe-inline' because Next's dev-mode style injection
    // is not nonce-stamped; production styles are nonce-stamped like the
    // scripts. Self-hosted fonts mean no external stylesheet host is ever
    // needed (Phase 3A vendored Inter and Material Symbols locally).
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    // blob:/data: cover the runtime-generated PWA icons (next/og) and any
    // inline SVG data URI in the design system.
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // Same-origin only: every API call this app makes is to its own
    // /api/* routes. No third-party endpoint is ever contacted.
    "connect-src 'self'",
    // public/sw.js.
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Server Actions post back to this origin only.
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Every document route except:
     *  - api            — JSON responses; CSP is a document-level control,
     *                     and these already carry the global headers from
     *                     next.config.ts.
     *  - _next/static,
     *    _next/image    — immutable build output, no inline script.
     *  - offline,
     *    offline-entry  — deliberately statically generated so the service
     *                     worker can precache and serve them with zero
     *                     connectivity; a nonce cannot exist for a page
     *                     rendered at build time. See STATIC_PAGE_CSP.
     *  - sw.js,
     *    manifest.webmanifest,
     *    icons/favicon  — static assets served from public/ or generated
     *                     at build time.
     *
     * Prefetches are skipped too: a `next/link` prefetch does not render a
     * document, so paying for a nonce there is pure cost.
     */
    {
      source:
        "/((?!api|_next/static|_next/image|offline|offline-entry|sw\\.js|manifest\\.webmanifest|manifest-icons|icon|apple-icon|favicon\\.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
