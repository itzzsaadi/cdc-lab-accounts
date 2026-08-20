import { test, expect } from "@playwright/test";

// Phase 0 smoke test: proves the Next.js app builds, serves, and renders.
// This is the one Playwright test Phase 0 calls for — real feature e2e
// tests start in Phase 2 onward.
test("health placeholder page loads", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "CDC Lab Accounts & Asset Management System" }),
  ).toBeVisible();
});
