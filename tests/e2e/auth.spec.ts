import { test, expect } from "@playwright/test";
import { createActivatedUser } from "./helpers/create-user";

/**
 * End-to-end proof against the real running app (Phase 2 plan §12).
 * Fixtures are created via `tests/e2e/helpers/create-user.ts`, which runs
 * `scripts/e2e-create-user.ts` through `tsx` as a child process — a real
 * invitation-acceptance code path exercised against the same database the
 * dev server connects to, with **no test-only HTTP route compiled into
 * the Next.js app** (Phase 2 closure: the earlier `/api/test/seed-user`
 * route was removed once this safer mechanism was in place — see
 * docs/adr/0003-phase-2-authentication.md).
 */

const TEST_PASSWORD = "correct-horse-battery-staple";

test.describe("Sign In screen", () => {
  test("reproduces the approved Stitch design elements", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByText("CDC Laboratories")).toBeVisible();
    await expect(page.getByText("Secure Access Gateway")).toBeVisible();
    await expect(page.getByLabel("Email Address")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("Remember me is checked and non-interactive — no second session duration is implied", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    const checkbox = page.locator("#remember-me");
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeDisabled();
  });

  test("unknown email and wrong password show the identical generic error", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email Address").fill("no-such-account@example.test");
    await page.getByLabel("Password", { exact: true }).fill("whatever12345");
    await page.getByRole("button", { name: "Sign In" }).click();
    const unknownEmailError = await page.getByRole("alert").textContent();

    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await page.goto("/sign-in");
    await page.getByLabel("Email Address").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("the-wrong-password");
    await page.getByRole("button", { name: "Sign In" }).click();
    const wrongPasswordError = await page.getByRole("alert").textContent();

    expect(unknownEmailError).toBe(wrongPasswordError);
  });

  test("valid sign-in reaches the role-appropriate Operator Home", async ({ page }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await page.goto("/sign-in");
    await page.getByLabel("Email Address").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: "Quick Actions" })).toBeVisible();
  });
});

test.describe("Authorization — server-side, not just hidden UI", () => {
  test("an Operator is denied direct navigation to an Admin-only route", async ({ page }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await page.goto("/sign-in");
    await page.getByLabel("Email Address").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/home$/);

    await page.goto("/users");
    await expect(page).toHaveURL(/\/forbidden$/);
  });

  test("an unauthenticated direct request to a protected API route reveals no session", async ({
    request,
  }) => {
    const response = await request.get("/api/auth/get-session");
    const body = await response.json().catch(() => null);
    expect(body === null || body.session == null).toBeTruthy();
  });
});

test.describe("Cookie and origin security", () => {
  test("the session cookie is HttpOnly and SameSite=Lax", async ({ page, context }) => {
    const user = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await page.goto("/sign-in");
    await page.getByLabel("Email Address").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/home$/);

    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name.toLowerCase().includes("session"));
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie!.httpOnly).toBe(true);
    expect(sessionCookie!.sameSite).toBe("Lax");
  });

  test("a cross-origin POST to the auth API is rejected (CSRF/origin protection)", async ({
    request,
  }) => {
    const response = await request.post("/api/auth/sign-out", {
      headers: { origin: "https://not-this-app.example" },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
