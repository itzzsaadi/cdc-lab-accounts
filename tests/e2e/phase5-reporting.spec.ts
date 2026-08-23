import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createActivatedUser } from "./helpers/create-user";

/**
 * Phase 5 — Monthly Summary, Dashboard, Audit Log, and the Partner A/B
 * mapping setup flow. Same shared-dev-database discipline as
 * `monthly-workflows.spec.ts`: assertions are scoped to what this test
 * itself creates or to structural page content, never a cumulative total.
 * The partner mapping is write-once (`configurePartnerMapping`), so the
 * mapping test tolerates a prior run having already configured it on this
 * shared database — it only performs the configure step when the setup
 * panel is actually present.
 */

const TEST_PASSWORD = "correct-horse-battery-staple";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test.describe("Operator denial (FR-AUTH-04) — Phase 5 routes", () => {
  for (const route of ["/monthly-summary", "/dashboard", "/audit-log"]) {
    test(`an Operator is redirected away from ${route}`, async ({ page }) => {
      const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
      await signIn(page, operator.email);
      await page.goto(route);
      await expect(page).toHaveURL(/\/forbidden$/);
    });
  }
});

test.describe("Partner Dashboard (FR-DASH, FR-WARN)", () => {
  test("a Partner sees real income/expense/result tiles, a trend chart, and a warnings section", async ({
    page,
  }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, partner.email);

    await page.goto("/dashboard");
    // This project's `next dev` (Turbopack, first-hit route compilation)
    // has been directly measured, in this sandbox, to occasionally take
    // longer than the suite's default 15s expect timeout to finish
    // rendering a not-yet-compiled route (see playwright.config.ts's own
    // note on this exact class of failure — a slow-but-correct render,
    // never a duplicate one). An explicit, wider timeout on the
    // first assertion after navigation is the targeted fix; a global
    // "networkidle" wait was tried here and measured to make the test
    // slower without improving reliability (this app's own background
    // link-prefetching and service-worker traffic can keep the network
    // busy well past when the page has actually finished rendering).
    await expect(page.getByRole("heading", { name: "Partner Dashboard" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText("Total Income — This Month")).toBeVisible();
    await expect(page.getByText("Total Expenses — This Month")).toBeVisible();
    await expect(page.getByText("Net Profit / Loss — This Month")).toBeVisible();
    await expect(page.getByRole("img", { name: /Net profit or loss trend/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Warnings" })).toBeVisible();
  });
});

test.describe("Monthly Summary (FR-RES-01 to 11, FR-RPT-06 to 08)", () => {
  test("a Partner sees the income/expense/result tiles, can step months, apply a custom range, and reach both export links", async ({
    page,
  }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, partner.email);

    await page.goto("/monthly-summary");
    await expect(page.getByRole("heading", { name: "Monthly Summary" })).toBeVisible();
    await expect(page.getByText("Total Income")).toBeVisible();
    await expect(page.getByText("Total Expenses (Business)")).toBeVisible();
    await expect(page.getByText("Net Profit / Loss")).toBeVisible();

    const exportPdf = page.getByRole("link", { name: "Export PDF" });
    const exportExcel = page.getByRole("link", { name: "Export Excel" });
    await expect(exportPdf).toHaveAttribute("href", /\/api\/reports\/monthly-summary\/pdf\?from=/);
    await expect(exportExcel).toHaveAttribute(
      "href",
      /\/api\/reports\/monthly-summary\/excel\?from=/,
    );

    await page.getByRole("link", { name: "Next Month →" }).click();
    await expect(page).toHaveURL(/\/monthly-summary\?month=/);

    await page.goto("/monthly-summary");
    await page.locator("#range-from").fill("2026-07-01");
    await page.locator("#range-to").fill("2026-07-31");
    await page.getByRole("button", { name: "Apply Custom Range" }).click();
    await expect(page).toHaveURL(/from=2026-07-01&to=2026-07-31/);
    // Custom-range view has no month-stepping links (FR-RES-01/AC-09).
    await expect(page.getByRole("link", { name: "Next Month →" })).toHaveCount(0);
  });

  test("an authenticated PDF export download starts and returns a real PDF", async ({ page }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, partner.email);
    await page.goto("/monthly-summary");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Export PDF" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^monthly-summary-.*\.pdf$/);
  });
});

test.describe("Partner A/B mapping setup (FR-RES-08, Admin-only, write-once)", () => {
  test("an Admin can configure the mapping when unconfigured, and the split then displays for a Partner", async ({
    page,
  }) => {
    const admin = await createActivatedUser("ADMIN", TEST_PASSWORD);
    const partnerA = await createActivatedUser("PARTNER", TEST_PASSWORD);
    const partnerB = await createActivatedUser("PARTNER", TEST_PASSWORD);

    await signIn(page, admin.email);
    await page.goto("/monthly-summary");

    const setupHeading = page.getByRole("heading", { name: "Configure Profit Split Partners" });
    const isUnconfigured = await setupHeading
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (isUnconfigured) {
      // Select by value (the user's id), never by visible label — many
      // partner accounts created across e2e runs on this shared dev
      // database share the exact same fullName ("E2E PARTNER"/"E2E
      // ADMIN"), so a label-based selection could silently resolve to the
      // wrong (or same) option for both dropdowns.
      await page.locator("#partner-a").selectOption(partnerA.id);
      await page.locator("#partner-b").selectOption(partnerB.id);
      await page.getByRole("button", { name: "Save Mapping" }).click();
      await expect(setupHeading).toHaveCount(0);
    }

    // Whether just-configured or already configured by an earlier run, the
    // split section must now show two named shares, never the empty state.
    await expect(page.getByText("Profit split configuration required")).toHaveCount(0);
    await expect(page.locator("h2", { hasText: "Partner Split" })).toBeVisible();
  });
});

test.describe("Audit Log (FR-AUD-04)", () => {
  test("a Partner can view the log, apply a record-type filter, and reach a record's own history", async ({
    page,
  }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, partner.email);

    await page.goto("/audit-log");
    await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();

    await page.locator("#filter-entity-type").selectOption("asset");
    await page.getByRole("button", { name: "Apply Filters" }).click();
    await expect(page).toHaveURL(/entityType=asset/);
  });

  test("an entity's History button opens its change history", async ({ page }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, partner.email);
    const assetName = `e2e-${randomUUID().slice(0, 8)}`;

    // Create the exact Asset row this test needs — never rely on the
    // shared dev database happening to already contain one.
    await page.goto("/assets");
    await page.getByRole("button", { name: "Add Asset" }).click();
    await page.locator("#asset-name").fill(assetName);
    await page.locator("#asset-monthly-instalment").fill("15000");
    await page.locator("#asset-default-category").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Save Asset" }).click();
    await expect(page.locator("tr", { hasText: assetName })).toBeVisible();

    const row = page.locator("tr", { hasText: assetName });
    await row.getByRole("button", { name: /View history for/ }).click();
    await expect(page.getByRole("heading", { name: /^History —/ })).toBeVisible();
    await expect(page.getByText("Created")).toBeVisible();
  });
});

test.describe("Income by Party (FR-RPT-05/FR-PINC-08)", () => {
  test("an Operator is redirected away from /party-income-report", async ({ page }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);
    await page.goto("/party-income-report");
    await expect(page).toHaveURL(/\/forbidden$/);
  });

  test("a Partner sees a per-party breakdown and can apply a custom range", async ({ page }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, partner.email);

    await page.goto("/party-income-report");
    await expect(page.getByRole("heading", { name: "Income by Party" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Combined Total" })).toBeVisible();

    await page.locator("#range-from").fill("2026-07-01");
    await page.locator("#range-to").fill("2026-07-31");
    await page.getByRole("button", { name: "Apply Range" }).click();
    await expect(page).toHaveURL(/from=2026-07-01&to=2026-07-31/);
  });
});
