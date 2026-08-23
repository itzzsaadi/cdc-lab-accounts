import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createActivatedUser } from "./helpers/create-user";
import { verifyPartyIncomeRowByNote } from "./helpers/verify-party-income-row";
import { touchDailyExpenseByDescription } from "./helpers/touch-daily-expense";

/**
 * Phase 3B — Operator transaction workflows, end-to-end against the real
 * running app. Fixtures follow the same pattern as auth.spec.ts/shell.spec.ts
 * (`scripts/e2e-create-user.ts` via `tsx`, no test-only HTTP route).
 *
 * The dev database these tests run against is shared and persistent across
 * runs (unlike `tests/integration/**`, which truncates a dedicated `_test`
 * database between tests) — so assertions here deliberately never depend
 * on a month's cumulative total or row count, only on the presence and own
 * values of *this test's own* uniquely-labelled row (a random marker in the
 * description/note field). This mirrors why `tests/integration/helpers/
 * test-db.ts` refuses to run against anything but a `_test` database in the
 * first place — the same non-isolation risk, worked around here instead by
 * making every assertion self-contained.
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

/**
 * Submits the Counter Income form and, if FR-CINC-04's duplicate-date
 * warning happens to appear (a real possibility here: the dev database is
 * shared across parallel test workers, so another test's own counter
 * income entry for "today" may already exist when this one runs),
 * confirms through it — this keeps every *other* test's assertions
 * focused on its own row rather than on whether a warning fired, while the
 * warning's own behavior is exercised deterministically in the dedicated
 * test below.
 */
async function saveCounterIncome(
  page: import("@playwright/test").Page,
  amount: string,
  note: string,
) {
  await page.locator("#counter-income-amount").fill(amount);
  await page.locator("#counter-income-note").fill(note);
  await page.getByRole("button", { name: "Save Counter Income" }).click();
  const confirmButton = page.getByRole("button", { name: "Record Anyway" });
  try {
    await confirmButton.waitFor({ state: "visible", timeout: 2000 });
    await confirmButton.click();
  } catch {
    // No duplicate warning appeared — this was a normal, direct create.
  }
}

test.describe("Daily Expenses (FR-DEXP-01/05/06/09)", () => {
  test("an Operator records a Business-funded expense and sees it in the list", async ({
    page,
  }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);
    const description = marker();

    await page.goto("/daily-expenses");
    await page.getByRole("button", { name: "Add Expense" }).click();
    await expect(page.locator("dialog[open]")).toBeVisible();

    await page.locator("#expense-amount").fill("4500");
    await page.locator("#expense-item").selectOption({ label: "Other (type below)" });
    await page.locator("#expense-custom-description").fill(description);
    await page.getByRole("button", { name: "Save Expense" }).click();

    await expect(page.locator("dialog[open]")).toBeHidden();
    // The dialog closes synchronously (setOpen(false)) but the table row
    // only appears once the unawaited router.refresh() triggered in
    // DailyExpenseDrawer's handleSubmit has actually completed its RSC
    // re-fetch and React has committed the refreshed tree. This project's
    // `next dev` (Turbopack, first-hit compilation, no production
    // optimization) has been directly measured, in this sandbox, to
    // occasionally take longer than the suite's default 15s expect
    // timeout to finish that one round trip (see playwright.config.ts's
    // own note on this class of failure) — an explicit, wider timeout on
    // just this assertion is the targeted fix, not a global wait for
    // "networkidle" (which this app's own background link-prefetching
    // and service-worker traffic can keep unresolved far longer than the
    // refresh itself actually takes, and was measured to make this
    // specific test slower, not more reliable).
    const row = page.locator("tr:visible", { hasText: description });
    await expect(row).toBeVisible({ timeout: 45_000 });
    await expect(row).toContainText("4,500.00");
    await expect(row).toContainText("Business");
  });

  test("a Partner-funded expense requires naming the partner (DR-07)", async ({ page }) => {
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);
    const description = marker();

    await page.goto("/daily-expenses");
    await page.getByRole("button", { name: "Add Expense" }).click();
    await page.locator("#expense-amount").fill("12000");
    await page.locator("#expense-item").selectOption({ label: "Other (type below)" });
    await page.locator("#expense-custom-description").fill(description);
    await page.locator("dialog[open]").getByText("Partner", { exact: true }).click();
    await page.locator("#expense-funding-source-partner").selectOption({ label: partner.fullName });
    await page.getByRole("button", { name: "Save Expense" }).click();

    await expect(page.locator("dialog[open]")).toBeHidden();
    // See the identical comment in the test above — same unawaited
    // router.refresh() race against this sandbox's measured `next dev`
    // latency; this is the test where it was actually observed to flake.
    const row = page.locator("tr:visible", { hasText: description });
    await expect(row).toContainText(`Partner: ${partner.fullName}`, { timeout: 45_000 });
  });
});

test.describe("Daily Expense filters (FR-DEXP-07)", () => {
  test("date range, search, and funding-source filters are reflected in the URL, and Reset Filters clears them", async ({
    page,
  }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    const partner = await createActivatedUser("PARTNER", TEST_PASSWORD);
    await signIn(page, operator.email);
    const businessMarker = marker();
    const partnerMarker = marker();

    await page.goto("/daily-expenses");
    await page.getByRole("button", { name: "Add Expense" }).click();
    await page.locator("#expense-amount").fill("1111");
    await page.locator("#expense-item").selectOption({ label: "Other (type below)" });
    await page.locator("#expense-custom-description").fill(businessMarker);
    await page.getByRole("button", { name: "Save Expense" }).click();
    await expect(page.locator("dialog[open]")).toBeHidden();

    await page.getByRole("button", { name: "Add Expense" }).click();
    await page.locator("#expense-amount").fill("2222");
    await page.locator("#expense-item").selectOption({ label: "Other (type below)" });
    await page.locator("#expense-custom-description").fill(partnerMarker);
    await page.locator("dialog[open]").getByText("Partner", { exact: true }).click();
    await page.locator("#expense-funding-source-partner").selectOption({ label: partner.fullName });
    await page.getByRole("button", { name: "Save Expense" }).click();
    await expect(page.locator("dialog[open]")).toBeHidden();

    // Item-or-description search narrows to the matching row only.
    await page.locator("#filter-search").fill(businessMarker);
    await page.getByRole("button", { name: "Apply Filters" }).click();
    await expect(page).toHaveURL(new RegExp(`search=${businessMarker}`));
    await expect(page.locator("tr:visible", { hasText: businessMarker })).toBeVisible();
    await expect(page.locator("tr:visible", { hasText: partnerMarker })).toHaveCount(0);

    // Funding-source filter narrows to Partner-funded rows.
    await page.locator("#filter-search").fill("");
    await page.locator("#filter-funding-source").selectOption("PARTNER");
    await page.getByRole("button", { name: "Apply Filters" }).click();
    await expect(page).toHaveURL(/fundingSource=PARTNER/);
    await expect(page.locator("tr:visible", { hasText: partnerMarker })).toBeVisible();
    await expect(page.locator("tr:visible", { hasText: businessMarker })).toHaveCount(0);

    // Reset Filters returns to the unfiltered current-month view.
    await page.getByRole("link", { name: "Reset Filters" }).click();
    await expect(page).toHaveURL(/\/daily-expenses$/);
    await expect(page.locator("tr:visible", { hasText: businessMarker })).toBeVisible();
    await expect(page.locator("tr:visible", { hasText: partnerMarker })).toBeVisible();
  });

  test("shows an appropriate empty state when no expense matches the filters", async ({ page }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);

    await page.goto(`/daily-expenses?search=${marker()}-never-recorded`);
    await expect(
      page.locator("p:visible", { hasText: "No daily expenses match these filters" }),
    ).toBeVisible();
  });
});

test.describe("Daily Expense edit and archive (FR-DEXP-09)", () => {
  test("create, edit, and archive lifecycle", async ({ page }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);
    const description = marker();

    await page.goto("/daily-expenses");
    await page.getByRole("button", { name: "Add Expense" }).click();
    await page.locator("#expense-amount").fill("5000");
    await page.locator("#expense-item").selectOption({ label: "Other (type below)" });
    await page.locator("#expense-custom-description").fill(description);
    await page.getByRole("button", { name: "Save Expense" }).click();
    await expect(page.locator("dialog[open]")).toBeHidden();

    const row = page.locator("tr:visible", { hasText: description });
    await expect(row).toBeVisible();

    // Edit opens prefilled with the current values.
    await row.getByRole("button", { name: `Edit ${description}` }).click();
    const editDialog = page.locator("dialog[open]");
    await expect(editDialog).toBeVisible();
    const amountInput = editDialog.locator('input[id$="-amount"]');
    await expect(amountInput).toHaveValue("5000");
    await amountInput.fill("6000");
    await editDialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.locator("dialog[open]")).toBeHidden();
    await expect(row).toContainText("6,000.00");

    // Archive names the exact record in its confirmation, then the row
    // disappears from the active list without being deleted.
    await row.getByRole("button", { name: `Archive ${description}` }).click();
    const archiveDialog = page.locator("dialog[open]");
    await expect(archiveDialog).toContainText(description);
    await archiveDialog.getByRole("button", { name: "Archive" }).click();
    await expect(page.locator("dialog[open]")).toBeHidden();
    await expect(page.locator("tr:visible", { hasText: description })).toHaveCount(0);
  });

  test("editing a row that changed elsewhere shows a reload message and never applies the stale edit", async ({
    page,
  }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);
    const description = marker();

    await page.goto("/daily-expenses");
    await page.getByRole("button", { name: "Add Expense" }).click();
    await page.locator("#expense-amount").fill("1000");
    await page.locator("#expense-item").selectOption({ label: "Other (type below)" });
    await page.locator("#expense-custom-description").fill(description);
    await page.getByRole("button", { name: "Save Expense" }).click();
    await expect(page.locator("dialog[open]")).toBeHidden();

    const row = page.locator("tr:visible", { hasText: description });
    await row.getByRole("button", { name: `Edit ${description}` }).click();
    const editDialog = page.locator("dialog[open]");
    await expect(editDialog).toBeVisible();

    // Someone else changes the row while this edit form is still open.
    await touchDailyExpenseByDescription(description, "9999");

    await editDialog.locator('input[id$="-amount"]').fill("1234");
    await editDialog.getByRole("button", { name: "Save Changes" }).click();

    await expect(editDialog.getByText(/changed or archived/)).toBeVisible();
    await expect(editDialog.getByRole("button", { name: "Reload" })).toBeVisible();
    await editDialog.getByRole("button", { name: "Reload" }).click();

    // The stale edit (1234) never applied — the concurrent change (9999) stands.
    await expect(page.locator("tr:visible", { hasText: description })).toContainText("9,999.00");
  });
});

test.describe("Party Income grid (FR-PINC-02/07)", () => {
  test("a saved grid cell survives a reload", async ({ page }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);

    await page.goto("/party-income");
    const cell = page.locator('input:visible[data-grid-row="4"][data-grid-col="0"]');
    await expect(cell).toBeVisible();
    await cell.fill("1750");
    await cell.blur();
    // A successful save's own `router.refresh()` (kept for accurate
    // row/party/grand totals) remounts this exact cell almost immediately
    // once the server responds, which can outrace an assertion on the
    // transient "Saved" status text — the value persisting is the real
    // proof of a successful save, so that is what is asserted here.
    await expect(cell).toHaveValue("1750", { timeout: 5000 });

    await page.reload();
    await expect(page.locator('input:visible[data-grid-row="4"][data-grid-col="0"]')).toHaveValue(
      "1750",
    );
  });

  test("Enter commits the cell and moves focus to the next day down", async ({ page }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);

    await page.goto("/party-income");
    const cell = page.locator('input:visible[data-grid-row="5"][data-grid-col="1"]');
    await cell.click();
    await cell.fill("900");
    await cell.press("Enter");

    const nextCell = page.locator('input:visible[data-grid-row="6"][data-grid-col="1"]');
    await expect(nextCell).toBeFocused();
  });

  test("recording a cash receipt does not populate a grid cell (receipt_type scoping)", async ({
    page,
  }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);
    const note = marker();

    await page.goto("/party-income");
    const untouchedCell = page.locator('input:visible[data-grid-row="6"][data-grid-col="2"]');
    await expect(untouchedCell).toHaveValue("");

    await page.getByRole("button", { name: "Record Cash Receipt" }).click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    await page.locator("#cash-receipt-amount").fill("2500");
    await page.locator("#cash-receipt-note").fill(note);
    await page.getByRole("button", { name: "Save Receipt" }).click();
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.locator("dialog[open]")).toBeHidden();

    // The grid's own cells are untouched by recording a cash receipt.
    await expect(untouchedCell).toHaveValue("");
  });

  test("Cash Receipt: reachable from the visible UI, shows a visible confirmation, persists as CASH_DIRECT", async ({
    page,
  }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);
    const note = marker();

    // Reachable both from Operator Home's quick action and from the Party
    // Income page's own button (mandatory closure item #4).
    await expect(page.getByRole("link", { name: /Record Cash Receipt/ })).toBeVisible();
    await page.goto("/party-income");
    const receiptButton = page.getByRole("button", { name: "Record Cash Receipt" });
    await expect(receiptButton).toBeVisible();
    await receiptButton.click();

    await page.locator("#cash-receipt-amount").fill("3300");
    await page.locator("#cash-receipt-note").fill(note);
    await page.getByRole("button", { name: "Save Receipt" }).click();

    // Visible confirmation naming the formatted amount, before the dialog closes.
    await expect(page.locator("dialog[open]").getByRole("status")).toContainText("Rs 3,300.00");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.locator("dialog[open]")).toBeHidden();

    const verified = await verifyPartyIncomeRowByNote(note);
    if (!verified.found) {
      throw new Error("Cash receipt row was not found by its note marker.");
    }
    expect(verified.receiptType).toBe("CASH_DIRECT");
    expect(verified.amount).toBe("3300");
    expect(verified.auditCount).toBe(1);
  });
});

test.describe("Counter Income (FR-CINC-01/04)", () => {
  test("a second entry for the same date warns without blocking, and confirming records it", async ({
    page,
  }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);
    const noteA = marker();
    const noteB = marker();

    await page.goto("/counter-income");
    // Step one may itself hit another parallel test's same-day entry —
    // confirm through it defensively; this row's own creation, not the
    // warning, is what this first step is proving.
    await saveCounterIncome(page, "8200", noteA);
    await expect(page.locator("tr:visible", { hasText: noteA })).toBeVisible();

    // Step two deterministically re-triggers the warning: noteA was just
    // created for today by this very test, so a second same-day submission
    // is guaranteed to collide with it, regardless of what else is running
    // in parallel.
    await page.locator("#counter-income-amount").fill("500");
    await page.locator("#counter-income-note").fill(noteB);
    await page.getByRole("button", { name: "Save Counter Income" }).click();
    await expect(page.getByText(/already exists for/)).toBeVisible();
    await expect(page.locator("tr:visible", { hasText: noteB })).toHaveCount(0); // not yet created

    await page.getByRole("button", { name: "Record Anyway" }).click();
    const row = page.locator("tr:visible", { hasText: noteB });
    await expect(row).toBeVisible();
    await expect(row).toContainText("500");
  });

  test("accepts a zero amount (the one table with CHECK amount >= 0)", async ({ page }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);
    const note = marker();

    await page.goto("/counter-income");
    await saveCounterIncome(page, "0", note);
    const row = page.locator("tr:visible", { hasText: note });
    await expect(row).toBeVisible();
    await expect(row).toContainText("0");
  });
});

test.describe("Operator Home — real quick actions and recent entries", () => {
  test("shows no per-row sync status on its own content (mandatory safeguard #7) — the header's real FR-OFF-03 indicator, added in Phase 6, is a separate, global concern", async ({
    page,
  }) => {
    const operator = await createActivatedUser("OPERATOR", TEST_PASSWORD);
    await signIn(page, operator.email);

    const main = page.getByRole("main");
    await expect(main.getByText("Pending Uploads")).toHaveCount(0);
    await expect(main.getByText("Synced")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Quick Actions" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Add Daily Expense/ })).toBeVisible();
  });
});

test.describe("Direct-route authorization for the new Phase 3B screens", () => {
  test("an unauthenticated request to Daily Expenses redirects to Sign In", async ({ page }) => {
    await page.goto("/daily-expenses");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("an unauthenticated request to Party Income redirects to Sign In", async ({ page }) => {
    await page.goto("/party-income");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("an unauthenticated request to Counter Income redirects to Sign In", async ({ page }) => {
    await page.goto("/counter-income");
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});
