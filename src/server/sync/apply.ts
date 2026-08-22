import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import { PermissionDeniedError, type AuthenticatedUser } from "../../lib/permissions/guard";
import type { OfflineEntityType } from "../../lib/offline/types";
import * as dailyExpenses from "../mutations/daily-expenses";
import * as monthlyExpenses from "../mutations/monthly-expenses";
import * as counterIncome from "../mutations/counter-income";
import * as partyIncome from "../mutations/party-income";

export interface IncomingSyncOperation {
  operationId: string;
  entityType: OfflineEntityType;
  action: "CREATE" | "UPDATE" | "ARCHIVE";
  clientUuid: string;
  payload: Record<string, unknown>;
}

export type ApplyOutcome =
  | { status: "APPLIED"; body: Record<string, unknown> }
  | {
      status: "CONFLICT";
      body: { current: Record<string, unknown>; currentVersion: string };
    }
  | { status: "REJECTED"; body: { error: string; code?: string } };

/**
 * Routes one already-fingerprint-checked offline operation to the correct
 * existing mutation function, running it against the caller's transaction
 * (`tx`) so the business write, its audit row, and the `sync_operations`
 * receipt this function's caller writes afterward all commit atomically
 * (CLAUDE.md Phase 6 mandatory decision #3) — this function itself opens
 * no transaction of its own.
 */
export async function applySyncOperation(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  tx: Prisma.TransactionClient,
  op: IncomingSyncOperation,
): Promise<ApplyOutcome> {
  try {
    if (op.action === "CREATE") {
      return await applyCreate(prisma, currentUser, tx, op);
    }
    if (op.action === "UPDATE") {
      return await applyUpdate(prisma, currentUser, tx, op);
    }
    return await applyArchive(prisma, currentUser, tx, op);
  } catch (error) {
    // Per-operation authorization (mandatory batch/security limit): a
    // caller lacking the specific entity permission never aborts the rest
    // of the batch — every other operation in the batch is still tried on
    // its own merits (partial success is expected and normal).
    if (error instanceof PermissionDeniedError) {
      return { status: "REJECTED", body: { error: error.message, code: "PERMISSION_DENIED" } };
    }
    throw error;
  }
}

async function applyCreate(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  tx: Prisma.TransactionClient,
  op: IncomingSyncOperation,
): Promise<ApplyOutcome> {
  const result = await (async () => {
    switch (op.entityType) {
      case "daily_expense":
        return dailyExpenses.createDailyExpense(prisma, currentUser, op.payload, tx);
      case "monthly_expense":
        return monthlyExpenses.createMonthlyExpense(prisma, currentUser, op.payload, tx);
      case "counter_income":
        return counterIncome.createCounterIncome(prisma, currentUser, op.payload, tx);
      case "party_income_daily":
        return partyIncome.createDailyPartyIncomeCell(prisma, currentUser, op.payload, tx);
      case "party_income_cash_receipt":
        return partyIncome.createCashReceipt(prisma, currentUser, op.payload, tx);
      case "party_income_monthly_bill":
        return partyIncome.createMonthlyPartyBill(prisma, currentUser, op.payload, tx);
    }
  })();

  if (result.ok) {
    return { status: "APPLIED", body: { id: result.id, replayed: result.replayed } };
  }
  if ("error" in result) {
    return { status: "REJECTED", body: { error: result.error } };
  }
  // Only remaining shape: `{ ok: false; requiresConfirmation: true }`. The
  // two-step non-blocking-duplicate-warning flow (FR-CINC-04/FR-MEXP-08)
  // has no live user to prompt mid-sync — the offline entry form must
  // decide `confirmedDuplicate` before this operation is ever queued.
  // Surfaced as a distinct, non-retriable rejection rather than silently
  // dropped or endlessly retried.
  return {
    status: "REJECTED",
    body: {
      error: "A possible duplicate was detected and needs confirmation before this can sync.",
      code: "DUPLICATE_REQUIRES_CONFIRMATION",
    },
  };
}

async function applyUpdate(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  tx: Prisma.TransactionClient,
  op: IncomingSyncOperation,
): Promise<ApplyOutcome> {
  if (op.entityType === "party_income_cash_receipt") {
    return {
      status: "REJECTED",
      body: { error: "Direct cash receipts cannot be edited.", code: "INVALID_OPERATION" },
    };
  }

  const result = await (async () => {
    switch (op.entityType) {
      case "daily_expense":
        return dailyExpenses.updateDailyExpense(prisma, currentUser, op.payload, tx);
      case "monthly_expense":
        return monthlyExpenses.updateMonthlyExpense(prisma, currentUser, op.payload, tx);
      case "counter_income":
        return counterIncome.updateCounterIncome(prisma, currentUser, op.payload, tx);
      case "party_income_daily":
        return partyIncome.updateDailyPartyIncomeCell(prisma, currentUser, op.payload, tx);
      case "party_income_monthly_bill":
        return partyIncome.updateMonthlyPartyBill(prisma, currentUser, op.payload, tx);
      default:
        throw new Error(`Unreachable entityType for UPDATE: ${String(op.entityType)}`);
    }
  })();

  if (result.ok) {
    return { status: "APPLIED", body: {} };
  }
  return classifyUpdateOrArchiveFailure(tx, op, result.error);
}

async function applyArchive(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  tx: Prisma.TransactionClient,
  op: IncomingSyncOperation,
): Promise<ApplyOutcome> {
  const result = await (async () => {
    switch (op.entityType) {
      case "daily_expense":
        return dailyExpenses.archiveDailyExpense(prisma, currentUser, op.payload, tx);
      case "monthly_expense":
        return monthlyExpenses.archiveMonthlyExpense(prisma, currentUser, op.payload, tx);
      case "counter_income":
        return counterIncome.archiveCounterIncome(prisma, currentUser, op.payload, tx);
      case "party_income_daily":
      case "party_income_cash_receipt":
        return partyIncome.archivePartyIncome(prisma, currentUser, op.payload, tx);
      case "party_income_monthly_bill":
        return partyIncome.archiveMonthlyPartyBill(prisma, currentUser, op.payload, tx);
    }
  })();

  if (result.ok) {
    return { status: "APPLIED", body: {} };
  }
  return classifyUpdateOrArchiveFailure(tx, op, result.error);
}

/**
 * The existing update/archive mutations return one generic error string
 * for every failure — this project's stale-write guard (a single
 * conditional `updateMany`, see mutations/daily-expenses.ts) doesn't itself
 * distinguish "the version moved" from "the row is already archived/gone".
 * Re-reading the current row here (inside the same transaction) tells them
 * apart: a version mismatch is a genuine CONFLICT (the Sync Center's Keep
 * Local/Keep Server prompt); a missing row, or a row whose version already
 * matches, is an ordinary REJECTED business error.
 */
async function classifyUpdateOrArchiveFailure(
  tx: Prisma.TransactionClient,
  op: IncomingSyncOperation,
  errorMessage: string,
): Promise<ApplyOutcome> {
  const id = op.payload["id"];
  const expectedUpdatedAt = op.payload["expectedUpdatedAt"];
  if (typeof id !== "string" || typeof expectedUpdatedAt !== "string") {
    return { status: "REJECTED", body: { error: errorMessage } };
  }

  const current = await fetchCurrentRow(tx, op.entityType, id);
  if (!current) {
    return { status: "REJECTED", body: { error: errorMessage } };
  }
  const currentVersion = current.updatedAt.toISOString();
  if (currentVersion === new Date(expectedUpdatedAt).toISOString()) {
    return { status: "REJECTED", body: { error: errorMessage } };
  }
  return {
    status: "CONFLICT",
    body: { current: serializeRowForConflict(op.entityType, current), currentVersion },
  };
}

interface CurrentRowShape {
  id: string;
  updatedAt: Date;
  isArchived: boolean;
  amount: { toString(): string };
  [key: string]: unknown;
}

async function fetchCurrentRow(
  tx: Prisma.TransactionClient,
  entityType: OfflineEntityType,
  id: string,
): Promise<CurrentRowShape | null> {
  switch (entityType) {
    case "daily_expense":
      return tx.dailyExpense.findUnique({
        where: { id },
      }) as unknown as Promise<CurrentRowShape | null>;
    case "monthly_expense":
      return tx.monthlyExpense.findUnique({
        where: { id },
      }) as unknown as Promise<CurrentRowShape | null>;
    case "counter_income":
      return tx.counterIncome.findUnique({
        where: { id },
      }) as unknown as Promise<CurrentRowShape | null>;
    case "party_income_daily":
    case "party_income_cash_receipt":
    case "party_income_monthly_bill":
      return tx.partyIncome.findUnique({
        where: { id },
      }) as unknown as Promise<CurrentRowShape | null>;
  }
}

/** Only the fields the Keep Local / Keep Server comparison UI needs —
 * money as a string (never a JS number, DR-01), dates as ISO strings. */
function serializeRowForConflict(
  entityType: OfflineEntityType,
  row: CurrentRowShape,
): Record<string, unknown> {
  const base = {
    id: row.id,
    amount: row.amount.toString(),
    isArchived: row.isArchived,
    updatedAt: row.updatedAt.toISOString(),
  };
  switch (entityType) {
    case "daily_expense":
      return { ...base, expenseDate: (row["expenseDate"] as Date).toISOString().slice(0, 10) };
    case "monthly_expense":
      return { ...base, periodMonth: (row["periodMonth"] as Date).toISOString().slice(0, 7) };
    case "counter_income":
    case "party_income_daily":
    case "party_income_cash_receipt":
    case "party_income_monthly_bill":
      return { ...base, incomeDate: (row["incomeDate"] as Date).toISOString().slice(0, 10) };
  }
}
