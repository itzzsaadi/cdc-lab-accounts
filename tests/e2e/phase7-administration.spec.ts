import { randomUUID } from "node:crypto";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { test, expect } from "@playwright/test";
import { createActivatedUser } from "./helpers/create-user";

const TEST_PASSWORD = "correct-horse-battery-staple";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

async function writeWorkbookFile(
  fileName: string,
  sheets: Record<string, { headers: string[]; rows: (string | undefined)[][] }>,
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  for (const [sheetName, sheet] of Object.entries(sheets)) {
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.addRow(sheet.headers);
    for (const row of sheet.rows) worksheet.addRow(row);
  }
  const dir = await mkdtemp(path.join(tmpdir(), "phase7-import-"));
  const filePath = path.join(dir, fileName);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

test.describe("Administration Area — Admin-only route protection (FR-AUTH-04, CLAUDE.md §16)", () => {
  for (const route of [
    "/parties",
    "/expense-items",
    "/expense-categories",
    "/vendors",
    "/profit-split",
    "/import",
  ]) {
    test(`an Operator is redirected away from ${route}`, async ({ page }) => {
      const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
      await signIn(page, operator.email);
      await page.goto(route);
      await expect(page).toHaveURL(/\/forbidden$/);
    });

    test(`a Partner is redirected away from ${route}`, async ({ page }) => {
      const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
      await signIn(page, partner.email);
      await page.goto(route);
      await expect(page).toHaveURL(/\/forbidden$/);
    });
  }
});

test.describe("Master data (FR-MST-01) — Parties", () => {
  test("an Admin can create a party, sees it listed, and a case-insensitive duplicate is rejected", async ({
    page,
  }) => {
    const admin = await createActivatedUser("ADMIN", TEST_PASSWORD);
    await signIn(page, admin.email);
    await page.goto("/parties");
    await expect(page.getByRole("heading", { name: "Administration Area" })).toBeVisible();

    const name = `E2E Party ${randomUUID()}`;
    await page.getByRole("button", { name: "Add Party" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(name)).toBeVisible();

    // Case-insensitive duplicate of the same name is rejected.
    await page.getByRole("button", { name: "Add Party" }).click();
    await page.getByLabel("Name").fill(name.toUpperCase());
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/already exists/i)).toBeVisible();
  });
});

test.describe("Profit split (FR-MST-06, Admin-only)", () => {
  test("an Admin can update the split percentages once the partner mapping is configured", async ({
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
      await page.locator("#partner-a").selectOption(partnerA.id);
      await page.locator("#partner-b").selectOption(partnerB.id);
      await page.getByRole("button", { name: "Save Mapping" }).click();
      await expect(setupHeading).toHaveCount(0);
    }

    await page.goto("/profit-split");
    await expect(page.getByRole("heading", { name: "Profit Split" })).toBeVisible();
    await expect(page.getByText(/Changing these percentages/)).toBeVisible();

    const splitAInput = page.locator("#split-a-percent");
    const splitBInput = page.locator("#split-b-percent");
    await splitAInput.fill("65");
    await splitBInput.fill("35");
    await page.getByRole("button", { name: "Save Split" }).click();
    await expect(page.getByText("Profit split updated.")).toBeVisible();

    // Restore to 50/50 so this shared-dev-database test is repeatable.
    await splitAInput.fill("50");
    await splitBInput.fill("50");
    await page.getByRole("button", { name: "Save Split" }).click();
    await expect(page.getByText("Profit split updated.")).toBeVisible();
  });

  test("rejects percentages that do not sum to 100", async ({ page }) => {
    const admin = await createActivatedUser("ADMIN", TEST_PASSWORD);
    await signIn(page, admin.email);
    await page.goto("/profit-split");
    const setupMessage = page.getByText("Configure the Partner A/B mapping first");
    if (await setupMessage.isVisible().catch(() => false)) {
      test.skip(true, "Partner mapping not yet configured on this run.");
      return;
    }
    await page.locator("#split-a-percent").fill("60");
    await page.locator("#split-b-percent").fill("50");
    await page.getByRole("button", { name: "Save Split" }).click();
    await expect(page.getByText(/add up to exactly 100/)).toBeVisible();
  });
});

test.describe("Historical import (FR-IMP-01/02, mandatory corrections)", () => {
  test("happy path: preview shows zero issues, commit succeeds", async ({ page }) => {
    const admin = await createActivatedUser("ADMIN", TEST_PASSWORD);
    await signIn(page, admin.email);
    await page.goto("/import");
    await expect(page.getByRole("heading", { name: "Historical Import" })).toBeVisible();

    const filePath = await writeWorkbookFile("counter-income.xlsx", {
      "Counter Income": {
        headers: ["Date", "Amount", "Note"],
        rows: [["2026-07-20", "750", undefined]],
      },
    });
    await page.getByLabel("Select import file").setInputFiles(filePath);
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText(/1 row\(s\) parsed\. 0 issue\(s\) found\./)).toBeVisible();

    await page.getByRole("button", { name: "Commit Import" }).click();
    await expect(page.getByText(/Import complete — 1 rows committed\./)).toBeVisible();
  });

  test("rejects a malformed (non-Excel) file", async ({ page }) => {
    const admin = await createActivatedUser("ADMIN", TEST_PASSWORD);
    await signIn(page, admin.email);
    await page.goto("/import");

    const dir = await mkdtemp(path.join(tmpdir(), "phase7-import-bad-"));
    const filePath = path.join(dir, "not-really.xlsx");
    await writeFile(filePath, "this is not an excel file");

    await page.getByLabel("Select import file").setInputFiles(filePath);
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText(/not a valid \.xlsx workbook|could not be read/i)).toBeVisible();
  });

  test("rejects a row referencing an unknown party name", async ({ page }) => {
    const admin = await createActivatedUser("ADMIN", TEST_PASSWORD);
    await signIn(page, admin.email);
    await page.goto("/import");

    const filePath = await writeWorkbookFile("bad-party.xlsx", {
      "Party Income (Daily)": {
        headers: ["Date", "Party Name", "Amount"],
        rows: [["2026-07-20", `Nonexistent Party ${randomUUID()}`, "1000"]],
      },
    });
    await page.getByLabel("Select import file").setInputFiles(filePath);
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText(/does not match any party/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Commit Import" })).toBeDisabled();
  });
});
