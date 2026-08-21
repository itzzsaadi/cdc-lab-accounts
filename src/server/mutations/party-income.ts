import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { appendBusinessAudit } from "../../lib/audit";
import { isUniqueConstraintViolationOn } from "../../lib/prisma-errors";
import { Decimal } from "../../lib/domain/money";
import { parseCalendarDate } from "../../lib/domain/calendar-date";
import {
  createDailyPartyIncomeCellSchema,
  updateDailyPartyIncomeCellSchema,
  archivePartyIncomeSchema,
  createCashReceiptSchema,
} from "../../lib/validation/party-income";

export type CreateResult =
  { ok: true; id: string; replayed: boolean } | { ok: false; error: string };
export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * Framework-independent core (see the same note in
 * `mutations/daily-expenses.ts`). Party Income grid cell create
 * (FR-PINC-02/07). Same concurrent-safe idempotency shape as Daily
 * Expense: `client_uuid` is the only P2002 ever treated as a replay. A
 * violation of `party_income_active_daily_cell_unique` instead — a
 * *different* `clientUuid` racing to fill the same party/day cell — is a
 * genuine conflict, reported as a normal error, never silently treated as
 * success.
 */
export async function createDailyPartyIncomeCell(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<CreateResult> {
  const user = requirePermission(currentUser, "entry:party-income");

  const parsed = createDailyPartyIncomeCellSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const existing = await prisma.partyIncome.findUnique({ where: { clientUuid: data.clientUuid } });
  if (existing) {
    return { ok: true, id: existing.id, replayed: true };
  }

  const incomeDate = parseCalendarDate(data.incomeDate);
  if (!incomeDate) {
    return { ok: false, error: "Invalid date." };
  }

  const id = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.partyIncome.create({
        data: {
          id,
          clientUuid: data.clientUuid,
          partyId: data.partyId,
          incomeDate,
          amount: new Decimal(data.amount),
          receiptType: "DAILY",
          capturedAt: new Date(),
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      });
      await appendBusinessAudit(tx, {
        actorUserId: user.id,
        action: "CREATE",
        entityType: "party_income",
        entityId: id,
        newValues: { partyId: data.partyId, incomeDate: data.incomeDate, amount: data.amount },
      });
    });
    return { ok: true, id, replayed: false };
  } catch (error) {
    if (isUniqueConstraintViolationOn(error, ["client_uuid"])) {
      const winner = await prisma.partyIncome.findUniqueOrThrow({
        where: { clientUuid: data.clientUuid },
      });
      return { ok: true, id: winner.id, replayed: true };
    }
    if (isUniqueConstraintViolationOn(error, ["party_id", "income_date"])) {
      return {
        ok: false,
        error: "A value already exists for this party and day. Reload the grid and try again.",
      };
    }
    throw error;
  }
}

export async function updateDailyPartyIncomeCell(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "entry:party-income");

  const parsed = updateDailyPartyIncomeCellSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const before = await tx.partyIncome.findUnique({ where: { id: data.id } });
    const result = await tx.partyIncome.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), isArchived: false },
      data: { amount: new Decimal(data.amount), updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      return { ok: false, error: "This cell was changed elsewhere. Reload it and try again." };
    }
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: "UPDATE",
      entityType: "party_income",
      entityId: data.id,
      oldValues: before ? { amount: before.amount.toString() } : undefined,
      newValues: { amount: data.amount },
    });
    return { ok: true };
  });
}

/** Clearing a saved cell archives the row (CLAUDE.md §11) — party_income has no stored-zero representation (party_income_amount_positive is a strict CHECK > 0). */
export async function archivePartyIncome(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "entry:party-income");

  const parsed = archivePartyIncomeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const result = await tx.partyIncome.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), isArchived: false },
      data: { isArchived: true, updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      return { ok: false, error: "This cell was already changed elsewhere." };
    }
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: "ARCHIVE",
      entityType: "party_income",
      entityId: data.id,
    });
    return { ok: true };
  });
}

/** FR-PINC-06: direct cash receipt — `receiptType: "CASH_DIRECT"`, never restricted by the grid's daily-cell unique index (scoped to `receiptType = 'DAILY'` only). Same client_uuid idempotency shape. */
export async function createCashReceipt(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<CreateResult> {
  const user = requirePermission(currentUser, "entry:cash-receipt");

  const parsed = createCashReceiptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const existing = await prisma.partyIncome.findUnique({ where: { clientUuid: data.clientUuid } });
  if (existing) {
    return { ok: true, id: existing.id, replayed: true };
  }

  const incomeDate = parseCalendarDate(data.incomeDate);
  if (!incomeDate) {
    return { ok: false, error: "Invalid date." };
  }

  const id = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.partyIncome.create({
        data: {
          id,
          clientUuid: data.clientUuid,
          partyId: data.partyId,
          incomeDate,
          amount: new Decimal(data.amount),
          receiptType: "CASH_DIRECT",
          note: data.note,
          capturedAt: new Date(),
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      });
      await appendBusinessAudit(tx, {
        actorUserId: user.id,
        action: "CREATE",
        entityType: "party_income",
        entityId: id,
        newValues: {
          partyId: data.partyId,
          incomeDate: data.incomeDate,
          amount: data.amount,
          receiptType: "CASH_DIRECT",
        },
      });
    });
    return { ok: true, id, replayed: false };
  } catch (error) {
    if (isUniqueConstraintViolationOn(error, ["client_uuid"])) {
      const winner = await prisma.partyIncome.findUniqueOrThrow({
        where: { clientUuid: data.clientUuid },
      });
      return { ok: true, id: winner.id, replayed: true };
    }
    throw error;
  }
}
