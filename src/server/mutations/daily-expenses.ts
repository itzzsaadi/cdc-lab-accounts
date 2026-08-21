import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { appendBusinessAudit } from "../../lib/audit";
import { isUniqueConstraintViolationOn } from "../../lib/prisma-errors";
import { Decimal } from "../../lib/domain/money";
import { parseCalendarDate } from "../../lib/domain/calendar-date";
import {
  createDailyExpenseSchema,
  updateDailyExpenseSchema,
  archiveDailyExpenseSchema,
} from "../../lib/validation/daily-expense";

export type CreateResult =
  { ok: true; id: string; replayed: boolean } | { ok: false; error: string };
export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * The framework-independent core of every Daily Expense mutation — takes
 * `prisma` and `currentUser` as plain arguments rather than importing the
 * runtime singleton or reading `next/headers` itself, so it is directly
 * callable from Vitest against a real test database (no Next.js request
 * context available there), the same pattern `src/lib/auth/lockout.ts`
 * uses (`signInWithLockout(auth, prisma, ...)`) to stay testable
 * independently of `signInAction`. The thin `"use server"` wrapper in
 * `src/server/actions/daily-expenses.ts` is the only place that resolves
 * `currentUser` from real request headers and passes the real runtime
 * `prisma` singleton — `currentUser` is never accepted as a
 * client-supplied parameter, since that would let a caller assert its own
 * role.
 *
 * FR-DEXP-01/05/06/09. Concurrent-safe create-idempotency (mandatory
 * safeguard #1): the initial `findUnique` short-circuits the common case
 * (a genuine retry after the first response was lost), but the *database's
 * own* unique constraint on `client_uuid` is the final authority — under
 * true concurrency, two requests can both pass the `findUnique` check
 * before either `create` commits, so the `create`'s own P2002 is caught
 * and treated as a replay, never a generic error, and never a second audit
 * row. A P2002 on any *other* constraint is never caught here.
 */
export async function createDailyExpense(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<CreateResult> {
  const user = requirePermission(currentUser, "entry:daily-expense");

  const parsed = createDailyExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const existing = await prisma.dailyExpense.findUnique({
    where: { clientUuid: data.clientUuid },
  });
  if (existing) {
    return { ok: true, id: existing.id, replayed: true };
  }

  const expenseDate = parseCalendarDate(data.expenseDate);
  if (!expenseDate) {
    return { ok: false, error: "Invalid date." };
  }

  const id = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.dailyExpense.create({
        data: {
          id,
          clientUuid: data.clientUuid,
          expenseDate,
          expenseItemId: data.expenseItemId,
          customDescription: data.customDescription,
          amount: new Decimal(data.amount),
          fundingSource: data.fundingSource,
          fundedByUserId: data.fundedByUserId,
          capturedAt: new Date(),
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: new Date(),
        },
      });
      await appendBusinessAudit(tx, {
        actorUserId: user.id,
        action: "CREATE",
        entityType: "daily_expense",
        entityId: id,
        newValues: {
          expenseDate: data.expenseDate,
          amount: data.amount,
          fundingSource: data.fundingSource,
        },
      });
    });
    return { ok: true, id, replayed: false };
  } catch (error) {
    if (isUniqueConstraintViolationOn(error, ["client_uuid"])) {
      const winner = await prisma.dailyExpense.findUniqueOrThrow({
        where: { clientUuid: data.clientUuid },
      });
      return { ok: true, id: winner.id, replayed: true };
    }
    throw error;
  }
}

/**
 * Atomic conditional write (stale-write protection): a single
 * `updateMany` whose `where` includes `id`, the caller's
 * `expectedUpdatedAt`, and `isArchived: false` — never a read-then-write.
 * `result.count === 1` is the sole authority for "this edit was accepted".
 */
export async function updateDailyExpense(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "entry:daily-expense");

  const parsed = updateDailyExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;
  const expenseDate = parseCalendarDate(data.expenseDate);
  if (!expenseDate) {
    return { ok: false, error: "Invalid date." };
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.dailyExpense.findUnique({ where: { id: data.id } });
    const result = await tx.dailyExpense.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), isArchived: false },
      data: {
        expenseDate,
        expenseItemId: data.expenseItemId ?? null,
        customDescription: data.customDescription ?? null,
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
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: "UPDATE",
      entityType: "daily_expense",
      entityId: data.id,
      oldValues: before
        ? {
            expenseDate: before.expenseDate.toISOString(),
            amount: before.amount.toString(),
            fundingSource: before.fundingSource,
          }
        : undefined,
      newValues: {
        expenseDate: data.expenseDate,
        amount: data.amount,
        fundingSource: data.fundingSource,
      },
    });
    return { ok: true };
  });
}

export async function archiveDailyExpense(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "entry:daily-expense");

  const parsed = archiveDailyExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const result = await tx.dailyExpense.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), isArchived: false },
      data: { isArchived: true, updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      return { ok: false, error: "This entry was already changed or archived by someone else." };
    }
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: "ARCHIVE",
      entityType: "daily_expense",
      entityId: data.id,
    });
    return { ok: true };
  });
}
