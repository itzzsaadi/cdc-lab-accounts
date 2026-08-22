import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { appendBusinessAudit } from "../../lib/audit";
import { isUniqueConstraintViolationOn } from "../../lib/prisma-errors";
import { Decimal } from "../../lib/domain/money";
import { parseCalendarDate } from "../../lib/domain/calendar-date";
import {
  createMonthlyExpenseSchema,
  updateMonthlyExpenseSchema,
  archiveMonthlyExpenseSchema,
  generateInstalmentLinesSchema,
  applyRecurringPrefillSchema,
} from "../../lib/validation/monthly-expense";
import {
  listInstalmentGenerationCandidates,
  listRecurringPrefillCandidates,
} from "../queries/monthly-expenses";

export type CreateResult =
  | { ok: true; id: string; replayed: boolean }
  | { ok: false; error: string }
  | { ok: false; requiresConfirmation: true };
export type MutationResult = { ok: true } | { ok: false; error: string };
export type BatchResult =
  { ok: true; created: number; alreadyExisted: number } | { ok: false; error: string };

/**
 * Framework-independent core (see the same note in
 * `mutations/daily-expenses.ts`). FR-MEXP-01/05/08's two-step
 * same-category-in-month non-blocking warning — same shape as Counter
 * Income's `confirmedDuplicate` flow. `client_uuid` idempotency is checked
 * first and independently, exactly like every other Phase 3B/4 entity.
 */
export async function createMonthlyExpense(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
  tx?: Prisma.TransactionClient,
): Promise<CreateResult> {
  const user = requirePermission(currentUser, "monthly-expense:manage");

  const parsed = createMonthlyExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;
  const reader = tx ?? prisma;

  const existing = await reader.monthlyExpense.findUnique({
    where: { clientUuid: data.clientUuid },
  });
  if (existing) {
    return { ok: true, id: existing.id, replayed: true };
  }

  const periodMonth = parseCalendarDate(`${data.periodMonth}-01`);
  if (!periodMonth) {
    return { ok: false, error: "Invalid period month." };
  }

  if (!data.confirmedDuplicate) {
    const sameCategoryThisMonth = await reader.monthlyExpense.findFirst({
      where: { categoryId: data.categoryId, periodMonth, isArchived: false },
    });
    if (sameCategoryThisMonth) {
      return { ok: false, requiresConfirmation: true };
    }
  }

  const id = randomUUID();
  const run = async (client: Prisma.TransactionClient) => {
    await client.monthlyExpense.create({
      data: {
        id,
        clientUuid: data.clientUuid,
        periodMonth,
        categoryId: data.categoryId,
        vendorId: data.vendorId,
        description: data.description,
        amount: new Decimal(data.amount),
        fundingSource: data.fundingSource,
        fundedByUserId: data.fundedByUserId,
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await appendBusinessAudit(client, {
      actorUserId: user.id,
      action: "CREATE",
      entityType: "monthly_expense",
      entityId: id,
      newValues: {
        periodMonth: data.periodMonth,
        categoryId: data.categoryId,
        amount: data.amount,
        fundingSource: data.fundingSource,
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
      const winner = await reader.monthlyExpense.findUniqueOrThrow({
        where: { clientUuid: data.clientUuid },
      });
      return { ok: true, id: winner.id, replayed: true };
    }
    throw error;
  }
}

export async function updateMonthlyExpense(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
  tx?: Prisma.TransactionClient,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "monthly-expense:manage");

  const parsed = updateMonthlyExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;
  const periodMonth = parseCalendarDate(`${data.periodMonth}-01`);
  if (!periodMonth) {
    return { ok: false, error: "Invalid period month." };
  }

  const run = async (client: Prisma.TransactionClient): Promise<MutationResult> => {
    const before = await client.monthlyExpense.findUnique({ where: { id: data.id } });
    const result = await client.monthlyExpense.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), isArchived: false },
      data: {
        periodMonth,
        categoryId: data.categoryId,
        vendorId: data.vendorId ?? null,
        description: data.description ?? null,
        amount: new Decimal(data.amount),
        fundingSource: data.fundingSource,
        fundedByUserId: data.fundedByUserId ?? null,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    if (result.count !== 1) {
      return {
        ok: false,
        error: "This entry was changed or archived by someone else. Reload it and try again.",
      };
    }
    await appendBusinessAudit(client, {
      actorUserId: user.id,
      action: "UPDATE",
      entityType: "monthly_expense",
      entityId: data.id,
      oldValues: before
        ? {
            categoryId: before.categoryId,
            amount: before.amount.toString(),
            fundingSource: before.fundingSource,
          }
        : undefined,
      newValues: {
        categoryId: data.categoryId,
        amount: data.amount,
        fundingSource: data.fundingSource,
      },
    });
    return { ok: true };
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

export async function archiveMonthlyExpense(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
  tx?: Prisma.TransactionClient,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "monthly-expense:manage");

  const parsed = archiveMonthlyExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const run = async (client: Prisma.TransactionClient): Promise<MutationResult> => {
    const result = await client.monthlyExpense.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), isArchived: false },
      data: { isArchived: true, updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      return { ok: false, error: "This entry was already changed or archived by someone else." };
    }
    await appendBusinessAudit(client, {
      actorUserId: user.id,
      action: "ARCHIVE",
      entityType: "monthly_expense",
      entityId: data.id,
    });
    return { ok: true };
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

/**
 * FR-AST-04/05/08, DR-09. Partner-triggered for whatever `periodMonth` is
 * currently selected (default current month, but a past month may be
 * targeted too — nothing auto-backfills a month nobody generated). One
 * `monthly_expenses` create **per asset, each in its own transaction**
 * paired with its own audit row — never one giant transaction, since a
 * single constraint violation would abort every subsequent statement in a
 * shared Postgres transaction with no cheap per-statement savepoint
 * available here. Concurrency-safe: a duplicate generation attempt for the
 * same asset/month hits the Phase 1 partial unique index
 * (`monthly_expenses_active_instalment_per_asset_month`), is caught as a
 * P2002, and is treated as "already generated" — never an error, never a
 * second row, never a second audit event, exactly like `client_uuid`'s
 * replay-safety pattern elsewhere in this codebase. `client_uuid` here is
 * operation-generated (`randomUUID()`), not browser-supplied — there is no
 * browser step in this action, only a Partner's confirm click, and
 * `monthly_expenses.client_uuid` supports either origin equally (DR-05
 * requires uniqueness, not a specific origin).
 */
export async function generateInstalmentLines(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<BatchResult> {
  const user = requirePermission(currentUser, "monthly-expense:manage");

  const parsed = generateInstalmentLinesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const periodMonthDate = parseCalendarDate(`${parsed.data.periodMonth}-01`);
  if (!periodMonthDate) {
    return { ok: false, error: "Invalid period month." };
  }

  const candidates = await listInstalmentGenerationCandidates(prisma, parsed.data.periodMonth);

  let created = 0;
  let alreadyExisted = 0;
  for (const candidate of candidates) {
    const id = randomUUID();
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.monthlyExpense.create({
          data: {
            id,
            clientUuid: randomUUID(),
            periodMonth: periodMonthDate,
            categoryId: candidate.categoryId,
            assetId: candidate.assetId,
            description: candidate.assetName,
            amount: new Decimal(candidate.amount),
            fundingSource: "BUSINESS",
            capturedAt: new Date(),
            createdBy: user.id,
            updatedBy: user.id,
            updatedAt: new Date(),
          },
        });
        await appendBusinessAudit(tx, {
          actorUserId: user.id,
          action: "CREATE",
          entityType: "monthly_expense",
          entityId: id,
          newValues: {
            periodMonth: parsed.data.periodMonth,
            assetId: candidate.assetId,
            amount: candidate.amount,
            generated: true,
          },
        });
      });
      created += 1;
    } catch (error) {
      if (isUniqueConstraintViolationOn(error, ["asset_id", "period_month"])) {
        alreadyExisted += 1;
        continue;
      }
      throw error;
    }
  }
  return { ok: true, created, alreadyExisted };
}

/** FR-MEXP-06: one create per confirmed recurring line, each in its own transaction, same idempotent-skip shape as `generateInstalmentLines` (a `client_uuid` collision here would mean a genuine double-submit of the same batch, treated as already-applied rather than an error). */
export async function applyRecurringPrefill(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<BatchResult> {
  const user = requirePermission(currentUser, "monthly-expense:manage");

  const parsed = applyRecurringPrefillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const periodMonthDate = parseCalendarDate(`${parsed.data.periodMonth}-01`);
  if (!periodMonthDate) {
    return { ok: false, error: "Invalid period month." };
  }

  // Re-derive the legitimate candidate set server-side rather than trusting
  // the client's submitted line list verbatim — only categories genuinely
  // still missing a live row for this month may be created here.
  const candidates = await listRecurringPrefillCandidates(prisma, parsed.data.periodMonth);
  const candidateByCategory = new Map(candidates.map((c) => [c.categoryId, c]));

  let created = 0;
  let alreadyExisted = 0;
  for (const line of parsed.data.lines) {
    if (!candidateByCategory.has(line.categoryId)) {
      alreadyExisted += 1; // no longer a valid candidate — already created or no longer recurring
      continue;
    }
    const id = randomUUID();
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.monthlyExpense.create({
          data: {
            id,
            clientUuid: randomUUID(),
            periodMonth: periodMonthDate,
            categoryId: line.categoryId,
            vendorId: line.vendorId,
            description: line.description,
            amount: new Decimal(line.amount),
            fundingSource: line.fundingSource,
            fundedByUserId: line.fundedByUserId,
            capturedAt: new Date(),
            createdBy: user.id,
            updatedBy: user.id,
            updatedAt: new Date(),
          },
        });
        await appendBusinessAudit(tx, {
          actorUserId: user.id,
          action: "CREATE",
          entityType: "monthly_expense",
          entityId: id,
          newValues: {
            periodMonth: parsed.data.periodMonth,
            categoryId: line.categoryId,
            amount: line.amount,
            recurringPrefill: true,
          },
        });
      });
      created += 1;
    } catch (error) {
      if (isUniqueConstraintViolationOn(error, ["client_uuid"])) {
        alreadyExisted += 1;
        continue;
      }
      throw error;
    }
  }
  return { ok: true, created, alreadyExisted };
}
