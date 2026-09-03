import type { NextConfig } from "next";
import { SECURITY_HEADERS, STATIC_PAGE_CSP } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  // Self-contained server bundle (server.js + a traced node_modules
  // subset) for the Docker runtime image — see Dockerfile. Vercel's own
  // build pipeline detects and handles this output shape correctly; it
  // does not change how Vercel deploys the app (Vercel docs confirm
  // `output: "standalone"` is compatible with, and ignored in favor of,
  // Vercel's own optimized build output).
  output: "standalone",

  // pdfkit reads its .afm font metrics files relative to its own package
  // directory at runtime (`__dirname`) — bundling it rewrites that path and
  // breaks the lookup (ENOENT on Helvetica.afm). Opting it out of bundling
  // makes the route handler `require("pdfkit")` natively instead, so its
  // real on-disk path is preserved (FR-RPT-06/07). This also ensures the
  // package's own files (including its non-JS .afm assets) are copied into
  // the standalone output by Next's file tracer, not left behind.
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
