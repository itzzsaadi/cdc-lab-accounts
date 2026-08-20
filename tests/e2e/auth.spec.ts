import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * End-to-end proof against the real running app (Phase 2 plan §12).
 * Fixtures are created through a test-only route
 * (`src/app/api/test/seed-user/route.ts`) that exercises the app's real
 * invitation-acceptance code path against the same database the dev
 * server connects to — never a separate mocked backend, and never a
 * direct cross-runtime import of server modules into the Playwright
 * process (which hits an unrelated ESM/CJS interop mismatch specific to
 * Playwright's own TypeScript transform).
 */

const TEST_PASSWORD = "correct-horse-battery-staple";

async function makeActivatedUser(
  request: APIRequestContext,
  role: "OPERATOR" | "PARTNER" | "ADMIN",
) {
  const response = await request.post("/api/test/seed-user", {
    data: { role, password: TEST_PASSWORD },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { email: string; id: string };
}

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

  test("unknown email and wrong password show the identical generic error", async ({
    page,
    request,
  }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email Address").fill("no-such-account@example.test");
    await page.getByLabel("Password", { exact: true }).fill("whatever12345");
    await page.getByRole("button", { name: "Sign In" }).click();
    const unknownEmailError = await page.getByRole("alert").textContent();

    const user = await makeActivatedUser(request, "OPERATOR");
    await page.goto("/sign-in");
    await page.getByLabel("Email Address").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("the-wrong-password");
    await page.getByRole("button", { name: "Sign In" }).click();
    const wrongPasswordError = await page.getByRole("alert").textContent();

    expect(unknownEmailError).toBe(wrongPasswordError);
  });

  test("valid sign-in reaches the role-appropriate placeholder home", async ({ page, request }) => {
    const user = await makeActivatedUser(request, "OPERATOR");
    await page.goto("/sign-in");
    await page.getByLabel("Email Address").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: "Operator Home" })).toBeVisible();
  });
});

test.describe("Authorization — server-side, not just hidden UI", () => {
  test("an Operator is denied direct navigation to an Admin-only route", async ({
    page,
    request,
  }) => {
    const user = await makeActivatedUser(request, "OPERATOR");
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
  test("the session cookie is HttpOnly and SameSite=Lax", async ({ page, context, request }) => {
    const user = await makeActivatedUser(request, "OPERATOR");
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
