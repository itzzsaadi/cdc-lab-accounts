/**
 * The `(auth)` group had no layout of its own — its pages rendered
 * straight under the root layout. This one adds nothing visually; it
 * exists to carry the route-segment config below.
 *
 * Phase 8A: `force-dynamic` is what lets the nonce-based CSP in
 * `src/proxy.ts` work here. Next.js stamps its nonce during server-side
 * rendering, reading it from the request's own CSP header — a statically
 * generated page has no request to read, so its inline hydration scripts
 * would carry no nonce and be blocked by the enforced policy. Sign In,
 * Forgot Password, Reset Password, and Accept Invitation are all
 * per-request screens anyway (each reads a token or query parameter), so
 * nothing is actually lost by rendering them per request.
 */
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
