import { test, expect } from "@playwright/test";
import { createActivatedUser } from "./helpers/create-user";

/**
 * Phase 3A shared shell — role-specific navigation, direct-URL protection
 * independent of navigation, mobile drawer keyboard/focus behavior, user
 * menu/sign-out, skip-navigation, and the "no external font/icon request"
 * proof (Phase 3A required verification items 1-7).
 */

const TEST_PASSWORD = "correct-horse-battery-staple";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
}

test.describe("Role-specific navigation — incremental, presentational only", () => {
  test("an Operator's sidebar shows only Home", async ({ page }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, user.email);
    await expect(page).toHaveURL(/\/home$/);

    // Two `nav[aria-label="Primary"]` elements exist by design — the
    // always-present desktop sidebar and the mobile drawer's copy (a
    // closed native <dialog>'s content is present in the DOM but not
    // rendered/visible, per the UA stylesheet's `dialog:not([open])
    // {display:none}`) — so only the visible one is queried here, at the
    // default desktop viewport.
    const links = page.locator('nav[aria-label="Primary"] a:visible');
    await expect(links).toHaveCount(1);
    await expect(links.first()).toContainText("Home");

    // Absent from the DOM entirely — not merely hidden — in *both* the
    // desktop nav and the (currently closed) mobile drawer's markup.
    await expect(page.locator('nav[aria-label="Primary"] a:has-text("Dashboard")')).toHaveCount(0);
    await expect(page.locator('nav[aria-label="Primary"] a:has-text("Users")')).toHaveCount(0);
  });

  test("a Partner's sidebar shows Home and Dashboard, never Users", async ({ page }) => {
    const user = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, user.email);
    await expect(page).toHaveURL(/\/home$/);

    const links = page.locator('nav[aria-label="Primary"] a:visible');
    await expect(links).toHaveCount(2);
    await expect(page.locator('nav[aria-label="Primary"] a:visible:has-text("Users")')).toHaveCount(
      0,
    );
  });

  test("an Admin's sidebar shows Home, Dashboard, and Users", async ({ page }) => {
    const user = await createActivatedUser("ADMIN", TEST_PASSWORD);
    await signIn(page, user.email);
    await expect(page).toHaveURL(/\/home$/);

    const links = page.locator('nav[aria-label="Primary"] a:visible');
    await expect(links).toHaveCount(3);
  });
});

test.describe("Direct URL access stays protected independently of navigation", () => {
  test("a Partner is denied direct navigation to the Admin-only Users route", async ({ page }) => {
    const user = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, user.email);
    await expect(page).toHaveURL(/\/home$/);

    await page.goto("/users");
    await expect(page).toHaveURL(/\/forbidden$/);
  });
});

test.describe("Mobile drawer — keyboard and focus behavior", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("opens via the hamburger, is keyboard-operable, closes on Escape, and returns focus", async ({
    page,
  }) => {
    const user = await createActivatedUser("ADMIN", TEST_PASSWORD);
    await signIn(page, user.email);
    await expect(page).toHaveURL(/\/home$/);

    const menuButton = page.getByRole("button", { name: "Open navigation menu" });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    const drawer = page.locator('dialog[aria-label="Navigation menu"]');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator("a", { hasText: "Home" })).toBeVisible();

    // Tab stays inside the open dialog (native focus trap).
    await page.keyboard.press("Tab");
    const activeInsideDialog = await page.evaluate(() => {
      const dialog = document.querySelector('dialog[aria-label="Navigation menu"]');
      return dialog?.contains(document.activeElement) ?? false;
    });
    expect(activeInsideDialog).toBe(true);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menuButton).toBeFocused();
  });

  test("no horizontal page scrolling at mobile width", async ({ page }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, user.email);
    await expect(page).toHaveURL(/\/home$/);

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });
});

test.describe("User menu and sign-out", () => {
  test("opens via the avatar, is keyboard-closable, and signs out", async ({ page }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, user.email);
    await expect(page).toHaveURL(/\/home$/);

    const trigger = page.getByRole("button", { name: /Operator/ });
    await trigger.click();
    const menu = page.locator('dialog[aria-label="User menu"]');
    await expect(menu).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(menu).toBeVisible();
    await menu.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});

test.describe("Skip-navigation", () => {
  test("the skip link is the first focusable element and targets #main-content", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toHaveAttribute("href", "#main-content");
    await expect(page.locator("#main-content")).toHaveCount(1);
  });
});

test.describe("No external font/icon requests, no console errors", () => {
  test("sign-in and the authenticated shell load with no external font request and no console errors", async ({
    page,
  }) => {
    const externalFontRequests: string[] = [];
    const consoleErrors: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) {
        externalFontRequests.push(url);
      }
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    const user = await createActivatedUser("ADMIN", TEST_PASSWORD);
    await signIn(page, user.email);
    await expect(page).toHaveURL(/\/home$/);
    await page.goto("/dashboard");
    await page.goto("/users");

    expect(externalFontRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
