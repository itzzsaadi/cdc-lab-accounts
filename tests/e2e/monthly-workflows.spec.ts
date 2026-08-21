import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createActivatedUser } from "./helpers/create-user";

/**
 * Phase 4 — Monthly Expenses, Asset Register, Monthly Party Bills, Partner
 * Investment. Same shared-dev-database discipline as `entries.spec.ts`:
 * every assertion is scoped to this test's own uniquely-marked row, never a
 * cumulative total. Concurrency, stale-write, and idempotency guarantees
 * are proven at the integration-test layer
 * (`tests/integration/mutations/*.test.ts`) — this file proves the UI is
 * actually reachable, wired correctly, and enforces role permissions.
 */

const TEST_PASSWORD = "correct-horse-battery-staple";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

function marker(): string {
  return `e2e-${randomUUID().slice(0, 8)}`;
}

/** Mirrors `entries.spec.ts`'s `saveCounterIncome` — the shared dev database may already carry another test's entry in the same category this month, triggering FR-MEXP-08's non-blocking duplicate warning; confirm through it so this test's own assertions stay focused on its own row. */
async function saveMonthlyExpense(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Save Expense" }).click();
  const confirmButton = page.getByRole("button", { name: "Record Anyway" });
  try {
    await confirmButton.waitFor({ state: "visible", timeout: 2000 });
    await confirmButton.click();
  } catch {
    // No duplicate warning appeared — this was a normal, direct create.
  }
}

test.describe("Operator denial (FR-AUTH-04) — Phase 4 routes", () => {
  for (const route of ["/monthly-expenses", "/assets", "/investment", "/party-income-monthly"]) {
    test(`an Operator is redirected away from ${route}`, async ({ page }) => {
      const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
      await signIn(page, operator.email);
      await page.goto(route);
      await expect(page).toHaveURL(/\/forbidden$/);
    });
  }
});

test.describe("Asset Register (FR-AST-01/02/06/07, DR-08)", () => {
  test("a Partner creates an Instalment asset and its line appears after Generate Instalment Lines", async ({
    page,
  }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, partner.email);
    const assetName = marker();

    await page.goto("/assets");
    await page.getByRole("button", { name: "Add Asset" }).click();
    await page.locator("#asset-name").fill(assetName);
    // acquisitionMode already defaults to Instalment
    await page.locator("#asset-monthly-instalment").fill("15000");
    await page.locator("#asset-default-category").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Save Asset" }).click();

    const row = page.locator("tr", { hasText: assetName });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Instalment");

    await page.goto("/monthly-expenses");
    await page.getByRole("button", { name: "Generate Instalment Lines" }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toBeVisible();
    // Wait for the preview fetch to resolve (either the asset's own row appears
    // as a candidate, naming it directly, or — if a concurrent run already
    // generated it — the "every asset already has a line" empty state shows).
    await expect(dialog.getByText("Checking active instalment assets…")).toHaveCount(0, {
      timeout: 10000,
    });
    const generateButton = dialog.getByRole("button", { name: /Generate \d+ Line/ });
    if (await generateButton.isVisible().catch(() => false)) {
      await generateButton.click();
      await expect(dialog).toContainText("instalment line(s) created");
      await dialog.getByRole("button", { name: "Close" }).click();
    } else {
      await dialog.getByRole("button", { name: "Close" }).click();
    }
    await page.goto("/monthly-expenses");
    await expect(page.locator("tr", { hasText: assetName })).toBeVisible();
  });

  test("a Partner creates a Cash asset with a purchasing partner; it appears in the Investment statement, never as an expense", async ({
    page,
  }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, partner.email);
    const assetName = marker();

    await page.goto("/assets");
    await page.getByRole("button", { name: "Add Asset" }).click();
    await page.locator("dialog[open]").getByText("Cash", { exact: true }).click();
    await page.locator("#asset-name").fill(assetName);
    await page.locator("#asset-purchase-price").fill("120000");
    await page.locator("#asset-purchased-by").selectOption({ label: partner.fullName });
    await page.getByRole("button", { name: "Save Asset" }).click();

    await expect(page.locator("tr", { hasText: assetName })).toContainText("Cash");

    await page.goto("/investment");
    await expect(page.locator("tr", { hasText: assetName })).toContainText("120,000.00");

    await page.goto("/monthly-expenses");
    await expect(page.locator("tr", { hasText: assetName })).toHaveCount(0);
  });

  test("Cash mode requires a purchasing partner as part of the same required field, never an independent optional checkbox", async ({
    page,
  }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, partner.email);

    await page.goto("/assets");
    await page.getByRole("button", { name: "Add Asset" }).click();
    await page.locator("dialog[open]").getByText("Cash", { exact: true }).click();
    // The purchasing-partner select is a real <select required>, not a checkbox —
    // browser-native validation blocks submission with no partner chosen.
    const select = page.locator("#asset-purchased-by");
    await expect(select).toHaveAttribute("required", "");
  });
});

test.describe("Monthly Expenses (FR-MEXP-01/05/08)", () => {
  test("a Partner records an Administration expense and it appears in the Administration section", async ({
    page,
  }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, partner.email);
    const description = marker();

    await page.goto("/monthly-expenses");
    await page.getByRole("button", { name: "Add Expense" }).click();
    await page.locator("#monthly-expense-category").selectOption({ index: 1 });
    await page.locator("#monthly-expense-description").fill(description);
    await page.locator("#monthly-expense-amount").fill("7500");
    await saveMonthlyExpense(page);

    const row = page.locator("tr", { hasText: description });
    await expect(row).toBeVisible();
    await expect(row).toContainText("7,500.00");
  });
});

test.describe("Monthly Party Bill (FR-PINC-03, Partner-only, UC-07)", () => {
  test("a Partner records a monthly bill for a monthly-billing party", async ({ page }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, partner.email);

    await page.goto("/party-income-monthly");
    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toBeVisible();
    const input = firstRow.locator("input[aria-label^='Monthly bill for']");
    await input.fill("62345");
    await firstRow.getByRole("button", { name: "Save" }).click();
    await expect(firstRow).toContainText("62,345.00");
  });
});

test.describe("Partner Investment (FR-INV-03/04)", () => {
  test("a Partner records a Capital Contribution and a Drawing; both appear in the statement", async ({
    page,
  }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, partner.email);
    const note = marker();

    await page.goto("/investment");
    await page.getByRole("button", { name: "Add Capital / Withdrawal" }).click();
    await page.locator("#capital-type").selectOption("INJECTION");
    await page.locator("#capital-amount").fill("30000");
    await page.locator("#capital-note").fill(note);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("tr", { hasText: note })).toContainText("30,000.00");

    const drawingNote = marker();
    await page.getByRole("button", { name: "Add Capital / Withdrawal" }).click();
    await page.locator("#capital-type").selectOption("DRAWING");
    await page.locator("#capital-amount").fill("5000");
    await page.locator("#capital-note").fill(drawingNote);
    await page.getByRole("button", { name: "Save" }).click();
    const drawingRow = page.locator("tr", { hasText: drawingNote });
    await expect(drawingRow).toContainText("Withdrawal");
    await expect(drawingRow).toContainText("-Rs 5,000.00");
  });
});
