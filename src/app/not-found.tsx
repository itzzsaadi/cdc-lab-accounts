import Link from "next/link";

/**
 * NFR-SEC-10. `(app)/not-found.tsx` only serves unmatched paths *inside*
 * the authenticated `(app)` group; a URL matching no route at all (e.g.
 * `/nonexistent`) resolves against the root, which previously fell through
 * to Next.js's built-in 404. This one renders without the authenticated
 * shell, since an unmatched URL has no session context to render it from,
 * and reveals nothing about which routes do exist.
 */
/**
 * **Known, bounded CSP limitation (measured, not assumed).** Next.js
 * serves the unmatched-route 404 through a path that never receives the
 * per-request nonce `src/proxy.ts` sets, so this page's inline
 * `self.__next_f.push(...)` hydration scripts are blocked by the enforced
 * policy. Two fixes were tried against a real production server and
 * neither worked: `export const dynamic = "force-dynamic"` here (the
 * route did become `ƒ /_not-found`, but still rendered with
 * `"nonce":"$undefined"`), and a root `[...notFound]` catch-all calling
 * `notFound()` (same result, and it widened routing blast radius for no
 * gain, so it was removed). Left statically prerendered, which is
 * strictly faster given the nonce does not arrive either way.
 *
 * The exposure is nil and the page still works: everything below is
 * server-rendered HTML, the only interactive element is a plain anchor
 * that needs no JavaScript, and no data of any kind is rendered.
 * `tests/e2e/security-headers.spec.ts` asserts zero CSP violations on
 * every real screen and documents this one exclusion rather than
 * silently skipping it.
 */

export default function RootNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-on-surface text-xl font-semibold">Page not found</h1>
      <p className="text-on-surface-variant max-w-md text-sm">
        The page you&rsquo;re looking for doesn&rsquo;t exist.
      </p>
      <Link
        href="/"
        className="bg-primary text-on-primary rounded-lg px-4 py-2 text-sm font-medium"
      >
        Return to the start
      </Link>
    </main>
  );
}
