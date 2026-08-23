/**
 * Phase 8A security headers (NFR-SEC-01, NFR-SEC-06).
 *
 * Split deliberately in two:
 *
 * 1. `SECURITY_HEADERS` — everything that is identical on every response
 *    and needs no per-request value. Applied globally from
 *    `next.config.ts`'s `headers()`.
 * 2. The Content-Security-Policy, which is *not* here for most routes:
 *    it carries a fresh per-request nonce and is therefore built in
 *    `proxy.ts`. The one exception is `STATIC_PAGE_CSP` below.
 *
 * HSTS deliberately omits `preload`. Preloading is effectively
 * irreversible (removal from the browser preload list takes months) and
 * commits *every* subdomain of the final production domain to HTTPS —
 * neither the domain nor its subdomain inventory is settled yet, so this
 * is revisited in Phase 8B once they are. `max-age` is still the full two
 * years and `includeSubDomains` is on, which is the protection that
 * matters; `preload` only removes the very first plaintext request.
 *
 * `Strict-Transport-Security` is emitted in production only. Over plain
 * HTTP (local dev, Playwright) browsers ignore it, but emitting it there
 * would let a stray `http://localhost` HSTS entry pin the developer's own
 * browser to HTTPS for localhost, which breaks every other local project.
 */

const isProduction = process.env.NODE_ENV === "production";

export const SECURITY_HEADERS: { key: string; value: string }[] = [
  // Stops content-type sniffing turning a text response into script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Legacy clickjacking defence; `frame-ancestors 'none'` in the CSP is
  // the modern equivalent and both are set, since older browsers honour
  // only this one.
  { key: "X-Frame-Options", value: "DENY" },
  // Never leak a full authenticated URL (which can carry ids) to a
  // third-party origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This system needs none of these; denying them shrinks the surface a
  // compromised script could reach.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // Explicitly opt out of Chrome's origin-keyed agent cluster ambiguity.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : []),
];

/**
 * The CSP for the two genuinely static, unauthenticated pages that are
 * excluded from `proxy.ts` — `/offline` and `/offline-entry`.
 *
 * **Documented necessity for `'unsafe-inline'` in `script-src` here, and
 * nowhere else in the application:** both pages must remain *statically
 * generated* so `public/sw.js` can precache their HTML at install time
 * and serve them with zero connectivity (FR-OFF-01, ADR-0008 decision
 * 11). A nonce cannot be injected into a statically generated page —
 * there is no request at build time to derive one from — and Next.js
 * emits inline hydration scripts (`self.__next_f.push(...)`) into every
 * rendered document. Forcing these two pages dynamic to obtain a nonce
 * would defeat the precache that is their entire reason to exist.
 *
 * The exposure is bounded and small: neither page performs a session
 * check, reads any financial figure, or renders any server-supplied
 * value. Their only dynamic content is this device's own IndexedDB queue,
 * written by this same origin. Every authenticated, data-bearing route
 * uses the strict nonce policy in `proxy.ts` with no `'unsafe-inline'`
 * at all.
 */
export const STATIC_PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
