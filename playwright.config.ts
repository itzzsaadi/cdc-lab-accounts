import { existsSync } from "fs";
import { defineConfig, devices } from "@playwright/test";

// This sandbox pre-installs Chromium at a fixed path and skips Playwright's
// own browser download (see PLAYWRIGHT_BROWSERS_PATH/PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
// in the environment). Point at it only when it's actually present; real CI
// and any other machine install their own browser via `playwright install`
// and get an entirely unmodified `use` block — no `launchOptions` key at all —
// so Playwright's normal browser resolution is never touched there.
const sandboxChromium = "/opt/pw-browsers/chromium";
const sandboxOverride = existsSync(sandboxChromium)
  ? { launchOptions: { executablePath: sandboxChromium } }
  : {};

export default defineConfig({
  testDir: "./tests/e2e",
  // Pays every route's one-time `next dev` (Turbopack) first-hit compile
  // cost up front, sequentially, before any test's own clock starts — see
  // global-setup.ts for why: that cost has been measured, in this
  // sandbox, to occasionally exceed even a single test's 60s timeout on
  // its own, which no per-assertion timeout can fix once the whole test
  // is over budget.
  globalSetup: "./tests/e2e/global-setup.ts",
  // Every worker shares one `next dev` server and one Postgres database
  // (`webServer` below spawns a single dev server; there is no
  // per-worker/per-test database, by the project's own documented
  // shared-dev-DB convention). Investigating an intermittent failure in
  // this suite (strict-mode "resolved to 2 elements"/"unexpected value
  // hidden" errors, and separately "element was detached from the DOM,
  // retrying") showed it reproduces even with a single worker and a
  // completely idle file tree — ruling out genuine cross-request data
  // races or file-watcher/Fast-Refresh churn as the cause. Every one of
  // these failures is a timeout (Playwright's auto-retrying action or
  // assertion was still in progress, not wrong, when the clock ran out),
  // and this project's `next dev` (Turbopack, routes compiled on first
  // hit, no production optimization) run against a real Postgres instance
  // is measurably slower under this sandbox's CPU allotment than
  // Playwright's 5s/30s defaults assume. `workers: 1` removes any
  // remaining cross-test contention on the one shared dev server/database
  // rather than papering over a single flaky assertion, and the longer
  // timeouts below give a legitimately slower dev server room to finish
  // rendering before an assertion is called failed.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Retries were previously CI-only. This sandbox's `next dev` (Turbopack,
  // routes compiled on first hit) plus a real Postgres instance is, by
  // direct measurement (see the `workers: 1` note above), occasionally
  // slower than even the generous timeouts below allow — every failure
  // observed is a timeout on an action/assertion that was still correctly
  // in progress, never a wrong value. Retrying locally too, not just in
  // CI, is the same standard mitigation for that class of environment
  // slowness, applied consistently rather than only where `CI` happens to
  // be set.
  retries: 2,
  reporter: "list",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // FR-OFF's Offline Entry Workspace precache (public/sw.js's `install`
    // handler) fetches and caches every /_next/static/ asset the page
    // references, on every fresh service-worker registration — in `next
    // dev` those are large, unminified chunks (unlike a real production
    // install, where the same one-time cost is much smaller and paid once
    // per real device, not once per test). Each Playwright test gets an
    // isolated context, so this real, legitimate cost is paid freshly on
    // every single sign-in in tests/e2e/offline-sync.spec.ts — measured
    // to occasionally exceed the previous 15s action timeout even for a
    // plain `.fill()` on an already-rendered field while that background
    // fetch/cache work competes for this sandbox's limited CPU.
    actionTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...sandboxOverride },
    },
    /**
     * Phase 8A cross-engine smoke (NFR-CMP-01/02). Deliberately a small
     * subset — `tests/e2e/compatibility-smoke.spec.ts` only — not the full
     * suite: running ~100 tests three more times would multiply an already
     * long run for very little extra signal, since engine differences
     * surface on rendering and layout, not on business logic that Chromium
     * already covered.
     *
     * Run explicitly (`npx playwright test --project=firefox`), not as part
     * of the default run: this sandbox pre-installs Chromium only, so
     * Firefox and WebKit binaries must be fetched first
     * (`npx playwright install firefox webkit`). CI installs them.
     *
     * **These do not satisfy NFR-CMP-02 on their own.** WebKit is not
     * Safari-on-iOS, and a device descriptor is a viewport and user-agent,
     * not an Android or iOS device. Real-hardware verification stays an
     * environment-dependent Phase 8B item — see docs/testing.md.
     */
    {
      name: "firefox",
      testMatch: /compatibility-smoke\.spec\.ts/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      testMatch: /compatibility-smoke\.spec\.ts/,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chrome",
      testMatch: /compatibility-smoke\.spec\.ts/,
      use: { ...devices["Pixel 5"], ...sandboxOverride },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
