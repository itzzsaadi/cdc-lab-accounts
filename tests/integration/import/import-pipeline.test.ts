import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser, createTestExpenseItem, createTestParty } from "../helpers/fixtures";
import {
  buildImportWorkbook,
  DAILY_EXPENSES_HEADERS,
  PARTY_INCOME_DAILY_HEADERS,
  COUNTER_INCOME_HEADERS,
} from "../helpers/import-workbook";
import type { AuthenticatedUser } from "../../../src/lib/permissions/guard";
import { MAX_IMPORT_ROWS_PER_SHEET } from "../../../src/lib/validation/import";
import { previewImport } from "../../../src/server/import/preview";
import { commitImport } from "../../../src/server/import/commit";

const prisma = getTestPrismaClient();

function asAdmin(id: string): AuthenticatedUser {
  return { id, role: "ADMIN", isPartner: false, isActive: true };
}

async function createAdmin() {
  return createTestUser({ role: "ADMIN" });
}

// This file commits real business rows dated within July 2026 (the exact
// range tests/integration/fixtures/july-2026-reconciliation.test.ts
// verifies) — an `afterEach` alongside the existing per-describe
// `beforeEach` ensures the very last test in this file never leaves a row
// behind for whichever file Vitest happens to run next.
afterEach(async () => {
  await resetDatabase();
});

describe("historical import pipeline (FR-IMP-01/02, mandatory corrections #1/#2/#6)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("happy path: preview validates cleanly, commit creates rows, marks the batch COMMITTED, and deletes the session", async () => {
    const admin = await createAdmin();
    const item = await createTestExpenseItem();
    const bytes = await buildImportWorkbook({
      "Daily Expenses": {
        headers: DAILY_EXPENSES_HEADERS,
        rows: [["2026-07-15", item.name, undefined, "500.00", "BUSINESS", undefined]],
      },
    });

    const preview = await previewImport(prisma, asAdmin(admin.id), {
      name: "test.xlsx",
      size: bytes.length,
      bytes,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.valid).toBe(true);
    expect(preview.issues).toHaveLength(0);
    expect(preview.totalRows).toBe(1);

    const commit = await commitImport(prisma, asAdmin(admin.id), preview.importSessionId);
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;
    expect(commit.importedRows).toBe(1);

    const createdRows = await prisma.dailyExpense.findMany();
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0]!.amount.toNumber()).toBe(500);

    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: commit.batchId } });
    expect(batch.status).toBe("COMMITTED");
    expect(batch.importedRows).toBe(1);

    const session = await prisma.importSession.findUnique({
      where: { id: preview.importSessionId },
    });
    expect(session).toBeNull(); // single-use — deleted on successful commit

    const auditRows = await prisma.auditLog.findMany({
      where: { entityType: "daily_expense", action: "IMPORT" },
    });
    expect(auditRows).toHaveLength(1);
  });

  it("rejects a malformed (non-Excel) file before ever handing it to exceljs", async () => {
    const admin = await createAdmin();
    const bytes = Buffer.from("not an excel file at all");
    const preview = await previewImport(prisma, asAdmin(admin.id), {
      name: "fake.xlsx",
      size: bytes.length,
      bytes,
    });
    expect(preview.ok).toBe(false);
  });

  it("rejects a file over the 5 MB limit without parsing it", async () => {
    const admin = await createAdmin();
    const bytes = Buffer.from("small");
    const preview = await previewImport(prisma, asAdmin(admin.id), {
      name: "huge.xlsx",
      size: 6 * 1024 * 1024,
      bytes,
    });
    expect(preview.ok).toBe(false);
    if (preview.ok) return;
    expect(preview.error).toMatch(/5 MB limit/);
  });

  it("rejects a formula cell (formula-injection protection)", async () => {
    const admin = await createAdmin();
    const item = await createTestExpenseItem();
    const bytes = await buildImportWorkbook({
      "Daily Expenses": {
        headers: DAILY_EXPENSES_HEADERS,
        rows: [["2026-07-15", item.name, undefined, "500.00", "BUSINESS", undefined]],
      },
    });
    // Overwrite the Amount cell (column 4) of the one data row with a real formula shape.
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    // exceljs's own ambient Buffer type doesn't structurally match this project's @types/node Buffer<ArrayBufferLike> — same documented mismatch as src/server/import/parse.ts.
    await workbook.xlsx.load(bytes as any);
    const sheet = workbook.getWorksheet("Daily Expenses")!;
    sheet.getRow(2).getCell(4).value = { formula: "=1+1", result: 2 } as unknown as string;
    const tampered = Buffer.from(await workbook.xlsx.writeBuffer());

    const preview = await previewImport(prisma, asAdmin(admin.id), {
      name: "formula.xlsx",
      size: tampered.length,
      bytes: tampered,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.valid).toBe(false);
    expect(preview.issues.some((i) => /formula/i.test(i.message))).toBe(true);
  });

  it("rejects an unsupported sheet name", async () => {
    const admin = await createAdmin();
    const bytes = await buildImportWorkbook({
      // @ts-expect-error — deliberately an unsupported sheet name for this test
      "Not A Real Sheet": { headers: ["A"], rows: [["1"]] },
    });
    const preview = await previewImport(prisma, asAdmin(admin.id), {
      name: "bad-sheet.xlsx",
      size: bytes.length,
      bytes,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.valid).toBe(false);
    expect(preview.issues.some((i) => /Unsupported sheet/.test(i.message))).toBe(true);
  });

  it("rejects a reference to an archived expense item", async () => {
    const admin = await createAdmin();
    const item = await createTestExpenseItem();
    await prisma.expenseItem.update({ where: { id: item.id }, data: { isActive: false } });
    const bytes = await buildImportWorkbook({
      "Daily Expenses": {
        headers: DAILY_EXPENSES_HEADERS,
        rows: [["2026-07-15", item.name, undefined, "500.00", "BUSINESS", undefined]],
      },
    });
    const preview = await previewImport(prisma, asAdmin(admin.id), {
      name: "archived.xlsx",
      size: bytes.length,
      bytes,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.valid).toBe(false);
    expect(preview.issues.some((i) => /archived/i.test(i.message))).toBe(true);
  });

  it("rejects a within-file duplicate party+date row for daily-billing party income", async () => {
    const admin = await createAdmin();
    const party = await createTestParty({ billingMode: "DAILY" });
    const bytes = await buildImportWorkbook({
      "Party Income (Daily)": {
        headers: PARTY_INCOME_DAILY_HEADERS,
        rows: [
          ["2026-07-15", party.name, "1000"],
          ["2026-07-15", party.name, "2000"],
        ],
      },
    });
    const preview = await previewImport(prisma, asAdmin(admin.id), {
      name: "dupe.xlsx",
      size: bytes.length,
      bytes,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.valid).toBe(false);
    expect(preview.issues.some((i) => /Duplicate entry/.test(i.message))).toBe(true);
  });

  it("rejects a sheet exceeding the 5,000-row-per-sheet limit", async () => {
    const admin = await createAdmin();
    const rows = Array.from({ length: MAX_IMPORT_ROWS_PER_SHEET + 1 }, () => [
      "2026-07-15",
      "100",
      undefined,
    ]);
    const bytes = await buildImportWorkbook({
      "Counter Income": { headers: COUNTER_INCOME_HEADERS, rows },
    });
    const preview = await previewImport(prisma, asAdmin(admin.id), {
      name: "too-many-rows.xlsx",
      size: bytes.length,
      bytes,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.valid).toBe(false);
    expect(preview.issues.some((i) => /more than.*rows/.test(i.message))).toBe(true);
  });

  it("advisory repeated-file warning appears on a second preview of an already-committed file, without blocking commit", async () => {
    const admin = await createAdmin();
    const bytes = await buildImportWorkbook({
      "Counter Income": {
        headers: COUNTER_INCOME_HEADERS,
        rows: [["2026-07-15", "500", undefined]],
      },
    });

    const first = await previewImport(prisma, asAdmin(admin.id), {
      name: "counter.xlsx",
      size: bytes.length,
      bytes,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.repeatedFileWarning).toBeUndefined();
    const firstCommit = await commitImport(prisma, asAdmin(admin.id), first.importSessionId);
    expect(firstCommit.ok).toBe(true);

    const second = await previewImport(prisma, asAdmin(admin.id), {
      name: "counter.xlsx",
      size: bytes.length,
      bytes,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.repeatedFileWarning).toBeDefined();
  });
});

describe("import session claim atomicity (mandatory correction #1 — claim survives a rollback, prevents concurrent/repeated commits)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("under two concurrent commit attempts against the same session, exactly one succeeds", async () => {
    const admin = await createAdmin();
    const bytes = await buildImportWorkbook({
      "Counter Income": {
        headers: COUNTER_INCOME_HEADERS,
        rows: [["2026-07-15", "500", undefined]],
      },
    });
    const preview = await previewImport(prisma, asAdmin(admin.id), {
      name: "race.xlsx",
      size: bytes.length,
      bytes,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const [first, second] = await Promise.all([
      commitImport(prisma, asAdmin(admin.id), preview.importSessionId),
      commitImport(prisma, asAdmin(admin.id), preview.importSessionId),
    ]);
    const outcomes = [first.ok, second.ok];
    expect(outcomes.filter(Boolean)).toHaveLength(1);

    const createdRows = await prisma.counterIncome.findMany();
    expect(createdRows).toHaveLength(1); // never double-imported
  });

  it("rejects committing an already-committed session a second time", async () => {
    const admin = await createAdmin();
    const bytes = await buildImportWorkbook({
      "Counter Income": {
        headers: COUNTER_INCOME_HEADERS,
        rows: [["2026-07-15", "500", undefined]],
      },
    });
    const preview = await previewImport(prisma, asAdmin(admin.id), {
      name: "twice.xlsx",
      size: bytes.length,
      bytes,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const first = await commitImport(prisma, asAdmin(admin.id), preview.importSessionId);
    expect(first.ok).toBe(true);
    const secondAttempt = await commitImport(prisma, asAdmin(admin.id), preview.importSessionId);
    expect(secondAttempt.ok).toBe(false);
  });

  it("rejects committing an expired session and never leaves its bytes retained (mandatory correction #2)", async () => {
    const admin = await createAdmin();
    const bytes = await buildImportWorkbook({
      "Counter Income": {
        headers: COUNTER_INCOME_HEADERS,
        rows: [["2026-07-15", "500", undefined]],
      },
    });
    const preview = await previewImport(prisma, asAdmin(admin.id), {
      name: "expired.xlsx",
      size: bytes.length,
      bytes,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    await prisma.importSession.update({
      where: { id: preview.importSessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const commit = await commitImport(prisma, asAdmin(admin.id), preview.importSessionId);
    expect(commit.ok).toBe(false);

    // A second preview call sweeps expired sessions and nulls their bytes.
    await previewImport(prisma, asAdmin(admin.id), {
      name: "unrelated.xlsx",
      size: bytes.length,
      bytes: await buildImportWorkbook({
        "Counter Income": {
          headers: COUNTER_INCOME_HEADERS,
          rows: [["2026-08-01", "100", undefined]],
        },
      }),
    });
    const swept = await prisma.importSession.findUniqueOrThrow({
      where: { id: preview.importSessionId },
    });
    expect(swept.status).toBe("EXPIRED");
    expect(swept.fileBytes).toBeNull();
  });

  it("rejects a nonexistent import session id", async () => {
    const admin = await createAdmin();
    const commit = await commitImport(prisma, asAdmin(admin.id), randomUUID());
    expect(commit.ok).toBe(false);
  });

  it("refuses to let one Admin claim another Admin's session, and leaves it usable by its owner", async () => {
    // Phase 8A (approved decision 4). Being an Admin does not mean owning
    // this particular upload: before the `createdBy` clause was added to
    // the claim, knowing a session id was enough to commit someone else's
    // workbook, and the IMPORT audit rows would have credited the wrong
    // actor.
    const owner = await createAdmin();
    const otherAdmin = await createAdmin();
    const bytes = await buildImportWorkbook({
      "Counter Income": {
        headers: COUNTER_INCOME_HEADERS,
        rows: [["2026-07-22", "900", undefined]],
      },
    });

    const preview = await previewImport(prisma, asAdmin(owner.id), {
      name: "owned.xlsx",
      size: bytes.length,
      bytes,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const stolen = await commitImport(prisma, asAdmin(otherAdmin.id), preview.importSessionId);
    expect(stolen.ok).toBe(false);
    expect(await prisma.counterIncome.count()).toBe(0);

    // The refusal must not have consumed the claim — the rightful owner
    // can still commit, so a probe by another Admin cannot be used to
    // deny service either.
    const stillPending = await prisma.importSession.findUniqueOrThrow({
      where: { id: preview.importSessionId },
    });
    expect(stillPending.status).toBe("PENDING");

    const byOwner = await commitImport(prisma, asAdmin(owner.id), preview.importSessionId);
    expect(byOwner.ok).toBe(true);
    expect(await prisma.counterIncome.count()).toBe(1);
  });

  it("re-validates at commit time: an item archived after preview causes a clean rejection with no rows written and no partial import", async () => {
    const admin = await createAdmin();
    const item = await createTestExpenseItem();
    const bytes = await buildImportWorkbook({
      "Daily Expenses": {
        headers: DAILY_EXPENSES_HEADERS,
        rows: [["2026-07-15", item.name, undefined, "500.00", "BUSINESS", undefined]],
      },
    });
    const preview = await previewImport(prisma, asAdmin(admin.id), {
      name: "race-archive.xlsx",
      size: bytes.length,
      bytes,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.valid).toBe(true);

    // The item is archived after preview but before commit.
    await prisma.expenseItem.update({ where: { id: item.id }, data: { isActive: false } });

    const commit = await commitImport(prisma, asAdmin(admin.id), preview.importSessionId);
    expect(commit.ok).toBe(false);

    expect(await prisma.dailyExpense.count()).toBe(0);
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: preview.batchId } });
    expect(batch.status).toBe("FAILED");
    const session = await prisma.importSession.findUniqueOrThrow({
      where: { id: preview.importSessionId },
    });
    expect(session.status).toBe("FAILED");
    expect(session.fileBytes).toBeNull(); // never retained past failure
  });
});
