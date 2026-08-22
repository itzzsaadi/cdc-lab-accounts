import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createActivatedUser } from "./helpers/create-user";

/**
 * Phase 6 — offline sync end-to-end, against the real running app and a
 * real Chromium IndexedDB. `context.setOffline(true)` blocks all network
 * requests at the browser level (not just a UI flag), so a Server Action
 * call genuinely fails the way it would with no connectivity, exercising
 * the real `isLikelyOfflineError` fallback path rather than a mock.
 */

const TEST_PASSWORD = "correct-horse-battery-staple";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: /^Sign out/ }).click();
  const confirmSignOut = page.getByRole("button", { name: "Sign out anyway" });
  if (await confirmSignOut.isVisible().catch(() => false)) {
    await confirmSignOut.click();
  }
  await expect(page).toHaveURL(/\/sign-in/);
}

test.describe("Offline Sync — Sync Center and queueing", () => {
  test("Sync Center shows nothing to sync for a fresh account", async ({ page }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, user.email);
    await page.goto("/sync-center");
    await expect(page.getByText("Nothing to sync")).toBeVisible();
  });

  test("an entry made while offline is queued, shown as pending, and syncs automatically once back online", async ({
    page,
    context,
  }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, user.email);
    await page.goto("/counter-income");

    await context.setOffline(true);

    await page.getByLabel("Amount (PKR)").fill("777");
    await page.getByLabel("Note (optional)").fill(`E2E offline note ${Date.now()}`);
    await page.getByRole("button", { name: "Save Counter Income" }).click();

    await expect(page.getByText(/Saved offline/)).toBeVisible({ timeout: 15_000 });
    // The header indicator reflects the queued item without a page reload
    // — checked on the already-loaded page, since navigating to a not-yet-
    // prefetched dynamic route (Sync Center is server-rendered per
    // request) genuinely cannot complete while offline in a Next.js App
    // Router SPA; that is a platform constraint, not part of what FR-OFF
    // requires (offline *data entry*, not full offline app navigation).
    await expect(page.getByText(/1 pending/)).toBeVisible();

    await context.setOffline(false);

    // The `online` event triggers an automatic sync (mandatory decision
    // #2's verified-reconnect path) — no manual "Sync now" click required.
    // Sync Center is reached only now, while genuinely online.
    await page.getByRole("link", { name: "Sync Center" }).click();
    await expect(page.getByText("Nothing to sync")).toBeVisible({ timeout: 20_000 });
  });

  test("signing out with unsynced entries shows a heads-up, not a destructive-deletion warning", async ({
    page,
    context,
  }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, user.email);
    await page.goto("/counter-income");

    await context.setOffline(true);
    await page.getByLabel("Amount (PKR)").fill("321");
    await page.getByLabel("Note (optional)").fill(`E2E signout ${Date.now()}`);
    await page.getByRole("button", { name: "Save Counter Income" }).click();
    await expect(page.getByText(/Saved offline/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: /^Sign out/ }).click();

    await expect(page.getByText("You have entries that haven't synced yet")).toBeVisible();
    await expect(page.getByText(/nothing will be deleted/)).toBeVisible();

    await page.getByRole("button", { name: "Stay signed in" }).click();
    await expect(page).toHaveURL(/\/counter-income$/);

    await context.setOffline(false);
  });

  test("a different user signing in on the same browser never sees the prior user's queue", async ({
    page,
    context,
  }) => {
    const userA = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    const userB = await createActivatedUser("OPERATOR", TEST_PASSWORD);

    await signIn(page, userA.email);
    await page.goto("/counter-income");
    await context.setOffline(true);
    await page.getByLabel("Amount (PKR)").fill("111");
    await page.getByLabel("Note (optional)").fill(`E2E isolation ${Date.now()}`);
    await page.getByRole("button", { name: "Save Counter Income" }).click();
    await expect(page.getByText(/Saved offline/)).toBeVisible({ timeout: 15_000 });
    await context.setOffline(false);

    await signOut(page);
    await signIn(page, userB.email);
    await page.goto("/sync-center");
    await expect(page.getByText("Nothing to sync")).toBeVisible();
  });
});
