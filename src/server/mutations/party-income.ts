import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "../../../generated/prisma/client";
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
  createMonthlyPartyBillSchema,
  updateMonthlyPartyBillSchema,
  archiveMonthlyPartyBillSchema,
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
 *
 * `tx`: optional caller-supplied transaction client (used by the sync
 * engine, `src/server/sync/apply.ts`, so that the business write, the audit
 * row, and the `sync_operations` receipt all commit in a single database
 * transaction — CLAUDE.md mandatory decision #3). When omitted, this
 * function opens its own transaction exactly as before; every existing
 * online call site is unaffected.
 */
export async function createDailyPartyIncomeCell(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
  tx?: Prisma.TransactionClient,
): Promise<CreateResult> {
  const user = requirePermission(currentUser, "entry:party-income");

  const parsed = createDailyPartyIncomeCellSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;
  const reader = tx ?? prisma;

  const existing = await reader.partyIncome.findUnique({ where: { clientUuid: data.clientUuid } });
  if (existing) {
    return { ok: true, id: existing.id, replayed: true };
  }

  const incomeDate = parseCalendarDate(data.incomeDate);
  if (!incomeDate) {
    return { ok: false, error: "Invalid date." };
  }

  const id = randomUUID();
  // CLAUDE.md Phase 6 mandatory decision #4 — see the identical comment in
  // mutations/daily-expenses.ts.
  const syncedAt = new Date();
  const capturedAt = data.capturedAt ? new Date(data.capturedAt) : syncedAt;
  const run = async (client: Prisma.TransactionClient) => {
    await client.partyIncome.create({
      data: {
        id,
        clientUuid: data.clientUuid,
        partyId: data.partyId,
        incomeDate,
        amount: new Decimal(data.amount),
        receiptType: "DAILY",
        capturedAt,
        syncedAt,
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await appendBusinessAudit(client, {
      actorUserId: user.id,
      action: "CREATE",
      entityType: "party_income",
      entityId: id,
      newValues: { partyId: data.partyId, incomeDate: data.incomeDate, amount: data.amount },
    });
  };
  try {
    if (tx) {
      await run(tx);
    } else {
      await prisma.$transaction(run);
    }
    return { ok: true, id, replayed: false };
  } catch (error) {
    if (isUniqueConstraintViolationOn(error, ["client_uuid"])) {
      const winner = await reader.partyIncome.findUniqueOrThrow({
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
  tx?: Prisma.TransactionClient,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "entry:party-income");

  const parsed = updateDailyPartyIncomeCellSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const run = async (client: Prisma.TransactionClient): Promise<MutationResult> => {
    const before = await client.partyIncome.findUnique({ where: { id: data.id } });
    const result = await client.partyIncome.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), isArchived: false },
      data: { amount: new Decimal(data.amount), updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      return { ok: false, error: "This cell was changed elsewhere. Reload it and try again." };
    }
    await appendBusinessAudit(client, {
      actorUserId: user.id,
      action: "UPDATE",
      entityType: "party_income",
      entityId: data.id,
      oldValues: before ? { amount: before.amount.toString() } : undefined,
      newValues: { amount: data.amount },
    });
    return { ok: true };
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

/** Clearing a saved cell archives the row (CLAUDE.md §11) — party_income has no stored-zero representation (party_income_amount_positive is a strict CHECK > 0). */
export async function archivePartyIncome(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
  tx?: Prisma.TransactionClient,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "entry:party-income");

  const parsed = archivePartyIncomeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const run = async (client: Prisma.TransactionClient): Promise<MutationResult> => {
    const result = await client.partyIncome.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), isArchived: false },
      data: { isArchived: true, updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      return { ok: false, error: "This cell was already changed elsewhere." };
    }
    await appendBusinessAudit(client, {
      actorUserId: user.id,
      action: "ARCHIVE",
      entityType: "party_income",
      entityId: data.id,
    });
    return { ok: true };
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

/** FR-PINC-06: direct cash receipt — `receiptType: "CASH_DIRECT"`, never restricted by the grid's daily-cell unique index (scoped to `receiptType = 'DAILY'` only). Same client_uuid idempotency shape. */
export async function createCashReceipt(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
  tx?: Prisma.TransactionClient,
): Promise<CreateResult> {
  const user = requirePermission(currentUser, "entry:cash-receipt");

  const parsed = createCashReceiptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;
  const reader = tx ?? prisma;

  const existing = await reader.partyIncome.findUnique({ where: { clientUuid: data.clientUuid } });
  if (existing) {
    return { ok: true, id: existing.id, replayed: true };
  }

  const incomeDate = parseCalendarDate(data.incomeDate);
  if (!incomeDate) {
    return { ok: false, error: "Invalid date." };
  }

  const id = randomUUID();
  // CLAUDE.md Phase 6 mandatory decision #4 — see the identical comment in
  // mutations/daily-expenses.ts.
  const syncedAt = new Date();
  const capturedAt = data.capturedAt ? new Date(data.capturedAt) : syncedAt;
  const run = async (client: Prisma.TransactionClient) => {
    await client.partyIncome.create({
      data: {
        id,
        clientUuid: data.clientUuid,
        partyId: data.partyId,
        incomeDate,
        amount: new Decimal(data.amount),
        receiptType: "CASH_DIRECT",
        note: data.note,
        capturedAt,
        syncedAt,
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await appendBusinessAudit(client, {
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
  };
  try {
    if (tx) {
      await run(tx);
    } else {
      await prisma.$transaction(run);
    }
    return { ok: true, id, replayed: false };
  } catch (error) {
    if (isUniqueConstraintViolationOn(error, ["client_uuid"])) {
      const winner = await reader.partyIncome.findUniqueOrThrow({
        where: { clientUuid: data.clientUuid },
      });
      return { ok: true, id: winner.id, replayed: true };
    }
    throw error;
  }
}

/**
 * FR-PINC-03 (Partner-only, UC-07): one figure per monthly-billing party
 * per month. `incomeDate` is always normalized to the first day of
 * `periodMonth` — never client-supplied — matching the Phase 4 partial
 * unique index (`party_income_active_monthly_party_month_unique`). Same
 * `client_uuid` replay-safety shape as every other `party_income` write; a
 * collision on the monthly unique index instead (a *different* clientUuid
 * racing to record the same party/month) is a genuine conflict, reported
 * as a normal error, never silently treated as success — correcting an
 * already-recorded month's figure is an ordinary edit
 * (`updateMonthlyPartyBill`), never a second create.
 */
export async function createMonthlyPartyBill(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
  tx?: Prisma.TransactionClient,
): Promise<CreateResult> {
  const user = requirePermission(currentUser, "party-income:monthly-bill");

  const parsed = createMonthlyPartyBillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;
  const reader = tx ?? prisma;

  const existing = await reader.partyIncome.findUnique({ where: { clientUuid: data.clientUuid } });
  if (existing) {
    return { ok: true, id: existing.id, replayed: true };
  }

  const incomeDate = parseCalendarDate(`${data.periodMonth}-01`);
  if (!incomeDate) {
    return { ok: false, error: "Invalid period month." };
  }

  const id = randomUUID();
  // CLAUDE.md Phase 6 mandatory decision #4 — see the identical comment in
  // mutations/daily-expenses.ts.
  const syncedAt = new Date();
  const capturedAt = data.capturedAt ? new Date(data.capturedAt) : syncedAt;
  const run = async (client: Prisma.TransactionClient) => {
    await client.partyIncome.create({
      data: {
        id,
        clientUuid: data.clientUuid,
        partyId: data.partyId,
        incomeDate,
        amount: new Decimal(data.amount),
        receiptType: "MONTHLY",
        capturedAt,
        syncedAt,
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await appendBusinessAudit(client, {
      actorUserId: user.id,
      action: "CREATE",
      entityType: "party_income",
      entityId: id,
      newValues: {
        partyId: data.partyId,
        periodMonth: data.periodMonth,
        amount: data.amount,
        receiptType: "MONTHLY",
      },
    });
  };
  try {
    if (tx) {
      await run(tx);
    } else {
      await prisma.$transaction(run);
    }
    return { ok: true, id, replayed: false };
  } catch (error) {
    if (isUniqueConstraintViolationOn(error, ["client_uuid"])) {
      const winner = await reader.partyIncome.findUniqueOrThrow({
        where: { clientUuid: data.clientUuid },
      });
      return { ok: true, id: winner.id, replayed: true };
    }
    if (isUniqueConstraintViolationOn(error, ["party_id", "income_date"])) {
      return {
        ok: false,
        error:
          "This party already has a monthly bill for this month. Edit the existing figure instead.",
      };
    }
    throw error;
  }
}

export async function updateMonthlyPartyBill(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
  tx?: Prisma.TransactionClient,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "party-income:monthly-bill");

  const parsed = updateMonthlyPartyBillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const run = async (client: Prisma.TransactionClient): Promise<MutationResult> => {
    const before = await client.partyIncome.findUnique({ where: { id: data.id } });
    const result = await client.partyIncome.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), isArchived: false },
      data: { amount: new Decimal(data.amount), updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      return { ok: false, error: "This bill was changed elsewhere. Reload it and try again." };
    }
    await appendBusinessAudit(client, {
      actorUserId: user.id,
      action: "UPDATE",
      entityType: "party_income",
      entityId: data.id,
      oldValues: before ? { amount: before.amount.toString() } : undefined,
      newValues: { amount: data.amount },
    });
    return { ok: true };
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

export async function archiveMonthlyPartyBill(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
  tx?: Prisma.TransactionClient,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "party-income:monthly-bill");

  const parsed = archiveMonthlyPartyBillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const run = async (client: Prisma.TransactionClient): Promise<MutationResult> => {
    const result = await client.partyIncome.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), isArchived: false },
      data: { isArchived: true, updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      return { ok: false, error: "This bill was already changed or archived elsewhere." };
    }
    await appendBusinessAudit(client, {
      actorUserId: user.id,
      action: "ARCHIVE",
      entityType: "party_income",
      entityId: data.id,
    });
    return { ok: true };
  };
  return tx ? run(tx) : prisma.$transaction(run);
}
