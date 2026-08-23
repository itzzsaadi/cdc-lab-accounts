/**
 * Warms every distinct route the e2e suite navigates to, once, before any
 * test runs. `next dev` (Turbopack) compiles a route on its first hit —
 * measured directly in this sandbox to occasionally exceed even this
 * suite's 60s per-test timeout on a cold server (playwright.config.ts's
 * own note on `next dev`/CPU-constraint slowness already documented this
 * class of failure; this closes the actual gap rather than widening
 * per-assertion timeouts further, which cannot help once the *whole* test
 * — navigation, compile, hydration, mutation — exceeds its own budget).
 * A plain unauthenticated GET still forces Next.js to compile the route's
 * module graph before any auth-redirect logic runs, so redirects here are
 * expected and irrelevant — only compilation is the point. Sequential,
 * not parallel: hitting the single shared dev server with 15 concurrent
 * cold compiles would make the contention worse, not better.
 */
const ROUTES_TO_WARM = [
  "/sign-in",
  "/",
  "/daily-expenses",
  "/party-income",
  "/counter-income",
  "/sync-center",
  "/offline-entry",
  "/monthly-expenses",
  "/assets",
  "/investment",
  "/party-income-monthly",
  "/dashboard",
  "/monthly-summary",
  "/audit-log",
  "/party-income-report",
  "/users",
];

export default async function globalSetup(): Promise<void> {
  const baseURL = "http://localhost:3000";
  for (const route of ROUTES_TO_WARM) {
    try {
      await fetch(`${baseURL}${route}`, { redirect: "manual" });
    } catch {
      // Best-effort warm-up only — a route that fails to prefetch here
      // just falls back to paying its compile cost during the real test,
      // exactly as it would without this file at all.
    }
  }
}
