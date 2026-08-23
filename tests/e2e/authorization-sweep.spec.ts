import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
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
 * Field and value names that must never appear in a response body sent to
 * a caller who was denied. Chosen from what the SRS actually withholds
 * from an Operator (FR-AUTH-04, NFR-SEC-04, FR-RPT-09): profit, loss,
 * partner investment, and the profit split. Deliberately *not* generic
 * words like "amount" — an Operator legitimately sees amounts on their own
 * entry screens, so asserting on those would produce a test that fails for
 * the wrong reason.
 */
const RESTRICTED_MARKERS = [
  "netResult",
  "netProfit",
  "totalIncome",
  "totalExpenses",
  "splitAPercent",
  "splitBPercent",
  "shareA",
  "shareB",
  "investmentTotal",
  "partnerInvestment",
];

function assertNoRestrictedFields(body: string, context: string) {
  const leaked = RESTRICTED_MARKERS.filter((marker) => body.includes(marker));
  expect(leaked, `${context} leaked restricted field(s) in its response body`).toEqual([]);
}

/** Every route handler in the app, with the minimum role that may reach it. */
const API_ROUTES: {
  path: string;
  method: "GET" | "POST";
  minimumRole: "OPERATOR" | "PARTNER" | "ADMIN";
}[] = [
  { path: "/api/sync/ping", method: "GET", minimumRole: "OPERATOR" },
  { path: "/api/sync/reference", method: "GET", minimumRole: "OPERATOR" },
  { path: "/api/sync/upload", method: "POST", minimumRole: "OPERATOR" },
  {
    path: "/api/reports/monthly-summary/pdf?from=2026-07-01&to=2026-07-31",
    method: "GET",
    minimumRole: "PARTNER",
  },
  {
    path: "/api/reports/monthly-summary/excel?from=2026-07-01&to=2026-07-31",
    method: "GET",
    minimumRole: "PARTNER",
  },
  { path: "/api/admin/import/preview", method: "POST", minimumRole: "ADMIN" },
  { path: "/api/admin/import/commit", method: "POST", minimumRole: "ADMIN" },
];

/** Every authenticated page route, with the minimum role that may reach it. */
const PAGE_ROUTES: { path: string; minimumRole: "OPERATOR" | "PARTNER" | "ADMIN" }[] = [
  { path: "/home", minimumRole: "OPERATOR" },
  { path: "/daily-expenses", minimumRole: "OPERATOR" },
  { path: "/party-income", minimumRole: "OPERATOR" },
  { path: "/counter-income", minimumRole: "OPERATOR" },
  { path: "/sync-center", minimumRole: "OPERATOR" },
  { path: "/monthly-expenses", minimumRole: "PARTNER" },
  { path: "/assets", minimumRole: "PARTNER" },
  { path: "/investment", minimumRole: "PARTNER" },
  { path: "/party-income-monthly", minimumRole: "PARTNER" },
  { path: "/dashboard", minimumRole: "PARTNER" },
  { path: "/monthly-summary", minimumRole: "PARTNER" },
  { path: "/party-income-report", minimumRole: "PARTNER" },
  { path: "/audit-log", minimumRole: "PARTNER" },
  { path: "/parties", minimumRole: "ADMIN" },
  { path: "/expense-items", minimumRole: "ADMIN" },
  { path: "/expense-categories", minimumRole: "ADMIN" },
  { path: "/vendors", minimumRole: "ADMIN" },
  { path: "/profit-split", minimumRole: "ADMIN" },
  { path: "/import", minimumRole: "ADMIN" },
  { path: "/users", minimumRole: "ADMIN" },
];

const RANK = { OPERATOR: 0, PARTNER: 1, ADMIN: 2 } as const;

async function callRoute(request: APIRequestContext, route: (typeof API_ROUTES)[number]) {
  return route.method === "GET"
    ? request.get(route.path)
    : request.post(route.path, { data: {}, failOnStatusCode: false });
}

/**
 * Phase 8A. Complements the Vitest surface sweep
 * (`tests/integration/authorization/full-surface-sweep.test.ts`, which
 * calls the guarded functions directly) by exercising the *transport*: a
 * real signed-in browser session hitting real HTTP routes. A guard that
 * exists in the function but is never reached by the route — or a route
 * that renders before its guard runs — is only visible from here.
 */
test.describe("Authorization sweep — API route handlers", () => {
  test("an unauthenticated caller reaches no API route and is told nothing about the data", async ({
    request,
  }) => {
    for (const route of API_ROUTES) {
      const response = await callRoute(request, route);
      expect(
        response.status(),
        `${route.method} ${route.path} allowed an anonymous caller`,
      ).not.toBe(200);
      assertNoRestrictedFields(await response.text(), `anonymous ${route.path}`);
    }
  });

  for (const role of ["OPERATOR", "PARTNER"] as const) {
    test(`an ${role} is denied every API route above their level, with no restricted field in the body`, async ({
      page,
      context,
    }) => {
      const user = await createActivatedUser(role, TEST_PASSWORD);
      await signIn(page, user.email);
      // Reuse the browser context's cookies so these are genuinely
      // authenticated requests, not anonymous ones that would pass for the
      // wrong reason.
      const authed = context.request;

      for (const route of API_ROUTES.filter((r) => RANK[r.minimumRole] > RANK[role])) {
        const response = await callRoute(authed, route);
        expect(
          response.status(),
          `${route.method} ${route.path} allowed a ${role}`,
        ).toBeGreaterThanOrEqual(400);
        assertNoRestrictedFields(await response.text(), `${role} ${route.path}`);
      }
    });
  }

  test("an Operator's denied report export returns no file and no financial figure", async ({
    page,
    context,
  }) => {
    // FR-RPT-09 specifically: reports containing profit/loss/investment are
    // unavailable to an Operator. Checked on the actual bytes returned.
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);
    for (const path of [
      "/api/reports/monthly-summary/pdf?from=2026-07-01&to=2026-07-31",
      "/api/reports/monthly-summary/excel?from=2026-07-01&to=2026-07-31",
    ]) {
      const response = await context.request.get(path);
      expect(response.status()).toBeGreaterThanOrEqual(400);
      const body = await response.text();
      assertNoRestrictedFields(body, `Operator ${path}`);
      expect(body).not.toContain("%PDF");
      expect(body).not.toContain("PK");
    }
  });
});

test.describe("Authorization sweep — page routes", () => {
  test("an unauthenticated visitor is redirected to Sign In from every authenticated page", async ({
    page,
  }) => {
    for (const route of PAGE_ROUTES) {
      await page.goto(route.path);
      await expect(page, `${route.path} did not redirect an anonymous visitor`).toHaveURL(
        /\/sign-in/,
      );
    }
  });

  for (const role of ["OPERATOR", "PARTNER"] as const) {
    test(`an ${role} is redirected away from every page above their level`, async ({ page }) => {
      const user = await createActivatedUser(role, TEST_PASSWORD);
      await signIn(page, user.email);
      for (const route of PAGE_ROUTES.filter((r) => RANK[r.minimumRole] > RANK[role])) {
        await page.goto(route.path);
        await expect(page, `${route.path} was reachable by a ${role}`).toHaveURL(/\/forbidden$/);
      }
    });
  }

  for (const role of ["OPERATOR", "PARTNER", "ADMIN"] as const) {
    test(`an ${role} can reach every page at or below their level`, async ({ page }) => {
      // The other half of the guarantee: over-restriction is a broken
      // system, not a safe default. A sweep that only proved denial could
      // pass with everything locked.
      const user = await createActivatedUser(role, TEST_PASSWORD);
      await signIn(page, user.email);
      for (const route of PAGE_ROUTES.filter((r) => RANK[r.minimumRole] <= RANK[role])) {
        await page.goto(route.path);
        await expect(page, `${route.path} was NOT reachable by a ${role}`).not.toHaveURL(
          /\/forbidden$|\/sign-in/,
        );
      }
    });
  }
});
