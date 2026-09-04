import type { NextConfig } from "next";
import { SECURITY_HEADERS, STATIC_PAGE_CSP } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  // Self-contained server bundle (server.js + a traced node_modules
  // subset) for the Docker runtime image — see Dockerfile. This is
  // **disabled** when Vercel itself is doing the build (`VERCEL` is a
  // system env var Vercel sets automatically in every build/runtime
  // environment, including `vercel build` CLI invocations — Next.js
  // itself already keys some of its own build behavior off this same
  // variable). `output: "standalone"` genuinely conflicts with `vercel
  // build`'s own packaging step: it changes how/whether Next emits the
  // `.next/next-server.js.nft.json` trace manifest that step reads,
  // causing an ENOENT there (confirmed against a matching, version-
  // specific report — vercel/next.js#43654, "Standalone server does not
  // work with `vercel build` output"). Local `npm run build` and the
  // Docker builder stage (neither sets `VERCEL`) are unaffected.
  output: process.env.VERCEL ? undefined : "standalone",

  // pdfkit reads its .afm font metrics files relative to its own package
  // directory at runtime (`__dirname`) — bundling it rewrites that path and
  // breaks the lookup (ENOENT on Helvetica.afm). Opting it out of bundling
  // makes the route handler `require("pdfkit")` natively instead, so its
  // real on-disk path is preserved (FR-RPT-06/07). This also ensures the
  // package's own files (including its non-JS .afm assets) are included by
  // whichever file tracer is active — Next's own (standalone builds) or
  // Vercel's (Vercel builds) — rather than left behind either way.
  serverExternalPackages: ["pdfkit"],

  /**
   * Phase 8A (NFR-SEC-01/06). Everything here is request-independent; the
   * per-request nonce CSP lives in `src/proxy.ts`. See
   * `src/lib/security/headers.ts` for why HSTS omits `preload`, why it is
   * production-only, and why exactly two static pages carry their own
   * policy instead of a nonce.
   */
  async headers() {
    return [
      { source: "/(.*)", headers: SECURITY_HEADERS },
      {
        source: "/offline",
        headers: [{ key: "Content-Security-Policy", value: STATIC_PAGE_CSP }],
      },
      {
        source: "/offline-entry",
        headers: [{ key: "Content-Security-Policy", value: STATIC_PAGE_CSP }],
      },
    ];
  },
};

export default nextConfig;
