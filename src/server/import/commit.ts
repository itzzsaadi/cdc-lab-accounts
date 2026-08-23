import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { appendBusinessAudit } from "../../lib/audit";
import { Decimal } from "../../lib/domain/money";
import {
  parseCalendarDate,
  parseYearMonth,
  noonKarachiUtcForDate,
} from "../../lib/domain/calendar-date";
import { parseImportWorkbook, MalformedImportFileError, type ParsedImportResult } from "./parse";
import { buildMasterDataResolvers } from "./resolvers";

export type ImportCommitResult =
  | { ok: true; batchId: string; importedRows: number }
  | { ok: false; error: string; issues?: { sheet: string; row: number; message: string }[] };

/**
 * FR-IMP-02/03: takes only `importSessionId` — never anything the browser
 * echoes back from its own preview render. Step 1 (the claim) is its own,
 * already-committed statement, deliberately *outside* the later
 * all-or-nothing business transaction (mandatory correction #1): if the
 * business transaction later fails and rolls back, the claim itself
 * survives (the session is left CLAIMED, never silently reusable as
 * PENDING again) — a single conditional `updateMany` is what makes a
 * concurrent or retried commit against the same session impossible,
 * regardless of what happens afterward.
 */
export async function commitImport(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  importSessionId: string,
): Promise<ImportCommitResult> {
  const user = requirePermission(currentUser, "historical-import:run");

  // Phase 8A (approved decision 4): the claim is scoped to `createdBy`, so
  // one Admin can never claim a session another Admin uploaded. Being an
  // Admin is not the same as owning this particular upload — without this
  // clause, knowing (or guessing) a session id was enough to commit
  // someone else's workbook under your own name, and the audit rows would
  // then credit the wrong actor. Enforced in the same conditional
  // `updateMany` as the status/expiry test so ownership is checked
  // atomically with the claim, never as a separate readable-then-stale
  // lookup.
  const claim = await prisma.importSession.updateMany({
    where: {
      id: importSessionId,
      createdBy: user.id,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    data: { status: "CLAIMED", claimedAt: new Date() },
  });
  if (claim.count !== 1) {
    // Deliberately one message for every rejection — wrong owner, already
    // claimed, expired, or nonexistent. Distinguishing them would tell a
    // caller whether a session id they do not own exists.
    return {
      ok: false,
      error: "This import session is no longer valid (already used or expired).",
    };
  }

  const session = await prisma.importSession.findUniqueOrThrow({ where: { id: importSessionId } });
  const fileBytes = session.fileBytes;
  if (!fileBytes) {
    await failSession(prisma, session.id, session.batchId, "Session had no stored file bytes.");
    return { ok: false, error: "This import session could not be completed." };
  }

  let parsed: ParsedImportResult;
  try {
    const resolvers = await buildMasterDataResolvers(prisma);
    parsed = await parseImportWorkbook(fileBytes as Uint8Array, resolvers);
  } catch (error) {
    const message =
      error instanceof MalformedImportFileError ? error.message : "This file could not be re-read.";
    await failSession(prisma, session.id, session.batchId, message);
    return { ok: false, error: message };
  }

  if (parsed.issues.length > 0) {
    // Re-validation at commit time found new problems (e.g. a party was
    // archived after preview) — reject cleanly, never a partial import.
    await failSession(
      prisma,
      session.id,
      session.batchId,
      "Re-validation at commit found errors.",
      parsed.issues,
    );
    return {
      ok: false,
      error: "This file no longer validates cleanly — re-run the preview.",
      issues: parsed.issues,
    };
  }

  try {
    const importedRows = await prisma.$transaction(async (tx) => {
      let count = 0;
      count += await commitDailyExpenses(tx, user.id, parsed);
      count += await commitMonthlyExpenses(tx, user.id, parsed);
      count += await commitPartyIncomeDaily(tx, user.id, parsed);
      count += await commitPartyIncomeMonthlyBill(tx, user.id, parsed);
      count += await commitCounterIncome(tx, user.id, parsed);
      count += await commitCapitalContributions(tx, user.id, parsed);

      await tx.importBatch.update({
        where: { id: session.batchId },
        data: {
          status: "COMMITTED",
          importedRows: count,
          completedAt: new Date(),
          resultSummary: { importedRows: count } as unknown as Prisma.InputJsonValue,
        },
      });
      // Single-use: the session's job is done. Its row (and the only copy
      // of the workbook bytes) is gone the instant this transaction
      // commits — never retained past completion (mandatory correction #2).
      await tx.importSession.delete({ where: { id: session.id } });

      return count;
    });
    return { ok: true, batchId: session.batchId, importedRows };
  } catch (error) {
    await failSession(
      prisma,
      session.id,
      session.batchId,
      "The import transaction failed and was rolled back.",
    );
    throw error;
  }
}

async function failSession(
  prisma: PrismaClient,
  sessionId: string,
  batchId: string,
  message: string,
  issues?: unknown,
): Promise<void> {
  await prisma.$transaction([
    prisma.importSession.update({
      where: { id: sessionId },
      data: { status: "FAILED", fileBytes: null },
    }),
    prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        resultSummary: { error: message, issues } as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);
}

async function commitDailyExpenses(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  parsed: ParsedImportResult,
): Promise<number> {
  for (const row of parsed.dailyExpenses) {
    const id = randomUUID();
    const capturedAt = noonKarachiUtcForDate(row.expenseDate);
    await tx.dailyExpense.create({
      data: {
        id,
        clientUuid: randomUUID(),
        expenseDate: parseCalendarDate(row.expenseDate)!,
        expenseItemId: row.expenseItemId,
        customDescription: row.customDescription,
        amount: new Decimal(row.amount),
        fundingSource: row.fundingSource,
        fundedByUserId: row.fundedByUserId,
        capturedAt,
        syncedAt: capturedAt,
        createdBy: actorUserId,
        updatedBy: actorUserId,
        updatedAt: new Date(),
      },
    });
    await appendBusinessAudit(tx, {
      actorUserId,
      action: "IMPORT",
      entityType: "daily_expense",
      entityId: id,
      newValues: { source: "historical_import", row: row.row },
    });
  }
  return parsed.dailyExpenses.length;
}

async function commitMonthlyExpenses(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  parsed: ParsedImportResult,
): Promise<number> {
  for (const row of parsed.monthlyExpenses) {
    const id = randomUUID();
    const { year, month } = parseYearMonth(row.periodMonth)!;
    const periodMonth = new Date(Date.UTC(year, month - 1, 1));
    const capturedAt = noonKarachiUtcForDate(`${row.periodMonth}-01`);
    await tx.monthlyExpense.create({
      data: {
        id,
        clientUuid: randomUUID(),
        periodMonth,
        categoryId: row.categoryId,
        vendorId: row.vendorId,
        amount: new Decimal(row.amount),
        fundingSource: row.fundingSource,
        fundedByUserId: row.fundedByUserId,
        capturedAt,
        syncedAt: capturedAt,
        createdBy: actorUserId,
        updatedBy: actorUserId,
        updatedAt: new Date(),
      },
    });
    await appendBusinessAudit(tx, {
      actorUserId,
      action: "IMPORT",
      entityType: "monthly_expense",
      entityId: id,
      newValues: { source: "historical_import", row: row.row },
    });
  }
  return parsed.monthlyExpenses.length;
}

async function commitPartyIncomeDaily(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  parsed: ParsedImportResult,
): Promise<number> {
  for (const row of parsed.partyIncomeDaily) {
    const id = randomUUID();
    const capturedAt = noonKarachiUtcForDate(row.incomeDate);
    await tx.partyIncome.create({
      data: {
        id,
        clientUuid: randomUUID(),
        partyId: row.partyId,
        incomeDate: parseCalendarDate(row.incomeDate)!,
        amount: new Decimal(row.amount),
        receiptType: "DAILY",
        capturedAt,
        syncedAt: capturedAt,
        createdBy: actorUserId,
        updatedBy: actorUserId,
        updatedAt: new Date(),
      },
    });
    await appendBusinessAudit(tx, {
      actorUserId,
      action: "IMPORT",
      entityType: "party_income",
      entityId: id,
      newValues: { source: "historical_import", row: row.row },
    });
  }
  return parsed.partyIncomeDaily.length;
}

async function commitPartyIncomeMonthlyBill(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  parsed: ParsedImportResult,
): Promise<number> {
  for (const row of parsed.partyIncomeMonthlyBill) {
    const id = randomUUID();
    const { year, month } = parseYearMonth(row.periodMonth)!;
    const incomeDate = new Date(Date.UTC(year, month - 1, 1));
    const capturedAt = noonKarachiUtcForDate(`${row.periodMonth}-01`);
    await tx.partyIncome.create({
      data: {
        id,
        clientUuid: randomUUID(),
        partyId: row.partyId,
        incomeDate,
        amount: new Decimal(row.amount),
        receiptType: "MONTHLY",
        capturedAt,
        syncedAt: capturedAt,
        createdBy: actorUserId,
        updatedBy: actorUserId,
        updatedAt: new Date(),
      },
    });
    await appendBusinessAudit(tx, {
      actorUserId,
      action: "IMPORT",
      entityType: "party_income",
      entityId: id,
      newValues: { source: "historical_import", row: row.row },
    });
  }
  return parsed.partyIncomeMonthlyBill.length;
}

async function commitCounterIncome(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  parsed: ParsedImportResult,
): Promise<number> {
  for (const row of parsed.counterIncome) {
    const id = randomUUID();
    const capturedAt = noonKarachiUtcForDate(row.incomeDate);
    await tx.counterIncome.create({
      data: {
        id,
        clientUuid: randomUUID(),
        incomeDate: parseCalendarDate(row.incomeDate)!,
        amount: new Decimal(row.amount),
        note: row.note,
        capturedAt,
        syncedAt: capturedAt,
        createdBy: actorUserId,
        updatedBy: actorUserId,
        updatedAt: new Date(),
      },
    });
    await appendBusinessAudit(tx, {
      actorUserId,
      action: "IMPORT",
      entityType: "counter_income",
      entityId: id,
      newValues: { source: "historical_import", row: row.row },
    });
  }
  return parsed.counterIncome.length;
}

async function commitCapitalContributions(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  parsed: ParsedImportResult,
): Promise<number> {
  for (const row of parsed.capitalContributions) {
    const id = randomUUID();
    await tx.capitalContribution.create({
      data: {
        id,
        partnerUserId: row.partnerUserId,
        entryDate: parseCalendarDate(row.entryDate)!,
        amount: new Decimal(row.amount),
        contributionType: row.contributionType,
        createdBy: actorUserId,
        updatedBy: actorUserId,
        updatedAt: new Date(),
      },
    });
    await appendBusinessAudit(tx, {
      actorUserId,
      action: "IMPORT",
      entityType: "capital_contribution",
      entityId: id,
      newValues: { source: "historical_import", row: row.row },
    });
  }
  return parsed.capitalContributions.length;
}
