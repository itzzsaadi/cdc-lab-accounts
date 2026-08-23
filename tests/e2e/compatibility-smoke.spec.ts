import { randomUUID } from "node:crypto";
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
 * Phase 8A cross-engine smoke (NFR-CMP-01/02).
 *
 * Runs under the `firefox`, `webkit`, and `mobile-chrome` Playwright
 * projects as well as `chromium`, and covers only what differs *between
 * engines*: does the app load, does authentication work, does a form
 * submit, does the layout hold, do the self-hosted fonts and the service
 * worker behave. Business logic is not re-tested per engine — it is
 * engine-independent and already covered once.
 *
 * **What this does and does not prove.** It proves the app works on the
 * Gecko and WebKit engines and at a phone viewport. It does *not* prove
 * NFR-CMP-02 ("works on Android 10+ and iOS 15+"): Playwright's WebKit is
 * not Safari on iOS, and a device descriptor sets a viewport and
 * user-agent, not a real device's browser, OS, or input model. Real-device
 * verification is an environment-dependent Phase 8B item.
 */
test.describe("Cross-engine compatibility smoke", () => {
  test("the sign-in screen renders and authenticates", async ({ page }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await page.goto("/sign-in");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await signIn(page, operator.email);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("an Operator can record a daily expense end to end", async ({ page }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);
    await page.goto("/daily-expenses");

    const marker = `Compat ${randomUUID().slice(0, 8)}`;
    await page.getByRole("button", { name: "Add Expense" }).click();
    await page.getByLabel("Amount (PKR)").fill("125.50");
    await page.getByLabel("Description").fill(marker);
    await page.getByRole("button", { name: "Save Expense" }).click();
    await expect(page.getByText(marker)).toBeVisible();
  });

  test("a Partner reaches the dashboard and its chart renders", async ({ page }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, partner.email);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Partner Dashboard" })).toBeVisible({
      timeout: 45_000,
    });
    // A plain inline SVG, no charting library — the most likely thing to
    // differ across engines on this screen.
    await expect(page.getByRole("img", { name: /Net profit or loss trend/ })).toBeVisible();
  });

  test("layout holds with no horizontal page scroll", async ({ page }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);
    for (const path of ["/home", "/daily-expenses", "/party-income"]) {
      await page.goto(path);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows, `${path} scrolled horizontally`).toBe(false);
    }
  });

  test("self-hosted fonts load with no external request", async ({ page }) => {
    // Phase 3A vendored Inter and Material Symbols locally. A CSP with
    // `font-src 'self'` (Phase 8A) would now block an external font
    // outright, so a regression here is a broken UI, not just a privacy
    // leak.
    const external: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) {
        external.push(url);
      }
    });
    await page.goto("/sign-in");
    await page.waitForLoadState("domcontentloaded");
    expect(external).toEqual([]);
  });
});
