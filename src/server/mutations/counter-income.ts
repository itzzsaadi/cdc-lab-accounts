import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { appendBusinessAudit } from "../../lib/audit";
import { isUniqueConstraintViolationOn } from "../../lib/prisma-errors";
import { Decimal } from "../../lib/domain/money";
import { parseCalendarDate } from "../../lib/domain/calendar-date";
import {
  createCounterIncomeSchema,
  updateCounterIncomeSchema,
  archiveCounterIncomeSchema,
} from "../../lib/validation/counter-income";

export type CreateResult =
  | { ok: true; id: string; replayed: boolean }
  | { ok: false; error: string }
  | { ok: false; requiresConfirmation: true; existingAmount: string };
export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * Framework-independent core (see the same note in
 * `mutations/daily-expenses.ts`). FR-CINC-01/04's two-step
 * duplicate-confirmation flow: a first submission (no `confirmedDuplicate`)
 * that collides with an existing non-archived counter-income row on the
 * same date returns `requiresConfirmation: true` *without creating
 * anything* — a non-blocking warning, never a hard rejection. The client
 * re-submits the identical input with `confirmedDuplicate: true` to
 * proceed. `client_uuid` idempotency is checked first and independently —
 * a retried request (same clientUuid) is always a replay, never re-shown
 * the duplicate warning a second time.
 */
export async function createCounterIncome(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<CreateResult> {
  const user = requirePermission(currentUser, "entry:counter-income");

  const parsed = createCounterIncomeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const existing = await prisma.counterIncome.findUnique({
    where: { clientUuid: data.clientUuid },
  });
  if (existing) {
    return { ok: true, id: existing.id, replayed: true };
  }

  const incomeDate = parseCalendarDate(data.incomeDate);
  if (!incomeDate) {
    return { ok: false, error: "Invalid date." };
  }

  if (!data.confirmedDuplicate) {
    const sameDay = await prisma.counterIncome.findFirst({
      where: { incomeDate, isArchived: false },
    });
    if (sameDay) {
      return { ok: false, requiresConfirmation: true, existingAmount: sameDay.amount.toString() };
    }
  }

  const id = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.counterIncome.create({
        data: {
          id,
          clientUuid: data.clientUuid,
          incomeDate,
          amount: new Decimal(data.amount),
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
        entityType: "counter_income",
        entityId: id,
        newValues: { incomeDate: data.incomeDate, amount: data.amount },
      });
    });
    return { ok: true, id, replayed: false };
  } catch (error) {
    if (isUniqueConstraintViolationOn(error, ["client_uuid"])) {
      const winner = await prisma.counterIncome.findUniqueOrThrow({
        where: { clientUuid: data.clientUuid },
      });
      return { ok: true, id: winner.id, replayed: true };
    }
    throw error;
  }
}

export async function updateCounterIncome(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "entry:counter-income");

  const parsed = updateCounterIncomeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const before = await tx.counterIncome.findUnique({ where: { id: data.id } });
    const result = await tx.counterIncome.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), isArchived: false },
      data: {
        amount: new Decimal(data.amount),
        note: data.note,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    if (result.count !== 1) {
      return { ok: false, error: "This entry was changed elsewhere. Reload it and try again." };
    }
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: "UPDATE",
      entityType: "counter_income",
      entityId: data.id,
      oldValues: before ? { amount: before.amount.toString() } : undefined,
      newValues: { amount: data.amount },
    });
    return { ok: true };
  });
}

export async function archiveCounterIncome(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "entry:counter-income");

  const parsed = archiveCounterIncomeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const result = await tx.counterIncome.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), isArchived: false },
      data: { isArchived: true, updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      return { ok: false, error: "This entry was already changed or archived elsewhere." };
    }
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: "ARCHIVE",
      entityType: "counter_income",
      entityId: data.id,
    });
    return { ok: true };
  });
}
