import { test, expect, type Page } from "@playwright/test";
import { createActivatedUser } from "./helpers/create-user";

const TEST_PASSWORD = "correct-horse-battery-staple";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

/**
 * Collects every Content-Security-Policy violation the browser reports,
 * from both channels: `securitypolicyviolation` events (the authoritative
 * signal — fired for each blocked resource) and console messages, since
 * some blocks surface only as console errors.
 */
function collectCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/Content Security Policy|Refused to (execute|load|apply)/i.test(text)) {
      violations.push(text);
    }
  });
  void page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      // Surfaced through console so the Node-side listener above sees it.
      console.error(
        `Content Security Policy violation: ${event.violatedDirective} blocked ${event.blockedURI}`,
      );
    });
  });
  return violations;
}

/**
 * Phase 8A (NFR-SEC-01/06). The CSP is **enforced**, not report-only, so
 * a mistake in it breaks a page rather than filing a report nobody reads.
 * That makes a real-browser check mandatory: asserting the header string
 * looks right proves nothing about whether the app still runs under it.
 */
test.describe("Security headers", () => {
  test("every response carries the non-CSP security headers", async ({ request }) => {
    const response = await request.get("/sign-in");
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  });

  test("HSTS is absent over plain HTTP — it is production-only and never preloaded", async ({
    request,
  }) => {
    // Playwright runs against http://localhost, i.e. NODE_ENV !== production.
    // Emitting HSTS here would pin a developer's browser to HTTPS for
    // localhost across every project on the machine.
    const response = await request.get("/sign-in");
    expect(response.headers()["strict-transport-security"]).toBeUndefined();
  });

  test("the CSP is nonce-based and contains no unsafe-inline for scripts", async ({ request }) => {
    const response = await request.get("/sign-in");
    const csp = response.headers()["content-security-policy"];
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/script-src [^;]*'nonce-[^']+'/);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");

    const scriptSrc = csp.split(";").find((part) => part.trim().startsWith("script-src")) ?? "";
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  test("each request gets a fresh nonce — a nonce is never reused across responses", async ({
    request,
  }) => {
    const readNonce = async () => {
      const csp = (await request.get("/sign-in")).headers()["content-security-policy"];
      return /'nonce-([^']+)'/.exec(csp)?.[1];
    };
    const first = await readNonce();
    const second = await readNonce();
    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });

  test("the two static offline pages carry their own documented policy", async ({ request }) => {
    for (const path of ["/offline", "/offline-entry"]) {
      const csp = (await request.get(path)).headers()["content-security-policy"];
      // These are the deliberate exception (src/lib/security/headers.ts):
      // statically generated so the service worker can precache them, so
      // no nonce can exist and inline hydration scripts need allowing.
      expect(csp).toContain("'unsafe-inline'");
      // The allowance is still bounded — no wildcard host, no eval.
      expect(csp).not.toContain("*");
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).toContain("frame-ancestors 'none'");
    }
  });
});

/**
 * The real proof: load each screen in a browser under the enforced policy
 * and fail on any violation. `/` and the 404 page are covered separately —
 * see the last test for the one documented exclusion.
 */
test.describe("No CSP violations on real screens", () => {
  test("unauthenticated screens render cleanly under the enforced policy", async ({ page }) => {
    const violations = collectCspViolations(page);
    for (const path of ["/", "/sign-in", "/forgot-password", "/offline-entry"]) {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
    }
    expect(violations).toEqual([]);
  });

  test("authenticated Partner screens render cleanly under the enforced policy", async ({
    page,
  }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    const violations = collectCspViolations(page);
    await signIn(page, partner.email);
    for (const path of [
      "/home",
      "/daily-expenses",
      "/party-income",
      "/counter-income",
      "/monthly-expenses",
      "/assets",
      "/investment",
      "/dashboard",
      "/monthly-summary",
      "/audit-log",
      "/sync-center",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
    }
    expect(violations).toEqual([]);
  });

  test("authenticated Admin screens render cleanly under the enforced policy", async ({ page }) => {
    const admin = await createActivatedUser("ADMIN", TEST_PASSWORD);
    const violations = collectCspViolations(page);
    await signIn(page, admin.email);
    for (const path of [
      "/parties",
      "/expense-items",
      "/expense-categories",
      "/vendors",
      "/profit-split",
      "/import",
      "/users",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
    }
    expect(violations).toEqual([]);
  });

  test("documented exclusion: the unmatched-route 404 page's hydration scripts are CSP-blocked", async ({
    page,
  }) => {
    // Asserted rather than skipped, so this stays honest and so the day
    // Next.js starts passing the nonce through to the not-found render
    // path, this test fails and the limitation note in
    // src/app/not-found.tsx can be deleted. The page itself must still
    // work — server-rendered content and a plain anchor, no JS needed.
    const violations = collectCspViolations(page);
    const response = await page.goto("/definitely-not-a-route");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Return to the start" })).toBeVisible();
    expect(violations.length).toBeGreaterThan(0);
  });
});
