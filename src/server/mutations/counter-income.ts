import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "../../../generated/prisma/client";
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
  tx?: Prisma.TransactionClient,
): Promise<CreateResult> {
  const user = requirePermission(currentUser, "entry:counter-income");

  const parsed = createCounterIncomeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;
  const reader = tx ?? prisma;

  const existing = await reader.counterIncome.findUnique({
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
    const sameDay = await reader.counterIncome.findFirst({
      where: { incomeDate, isArchived: false },
    });
    if (sameDay) {
      return { ok: false, requiresConfirmation: true, existingAmount: sameDay.amount.toString() };
    }
  }

  const id = randomUUID();
  const run = async (client: Prisma.TransactionClient) => {
    await client.counterIncome.create({
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
    await appendBusinessAudit(client, {
      actorUserId: user.id,
      action: "CREATE",
      entityType: "counter_income",
      entityId: id,
      newValues: { incomeDate: data.incomeDate, amount: data.amount },
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
      const winner = await reader.counterIncome.findUniqueOrThrow({
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
  tx?: Prisma.TransactionClient,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "entry:counter-income");

  const parsed = updateCounterIncomeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const run = async (client: Prisma.TransactionClient): Promise<MutationResult> => {
    const before = await client.counterIncome.findUnique({ where: { id: data.id } });
    const result = await client.counterIncome.updateMany({
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
    await appendBusinessAudit(client, {
      actorUserId: user.id,
      action: "UPDATE",
      entityType: "counter_income",
      entityId: data.id,
      oldValues: before ? { amount: before.amount.toString() } : undefined,
      newValues: { amount: data.amount },
    });
    return { ok: true };
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

export async function archiveCounterIncome(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
  tx?: Prisma.TransactionClient,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "entry:counter-income");

  const parsed = archiveCounterIncomeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const run = async (client: Prisma.TransactionClient): Promise<MutationResult> => {
    const result = await client.counterIncome.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), isArchived: false },
      data: { isArchived: true, updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      return { ok: false, error: "This entry was already changed or archived elsewhere." };
    }
    await appendBusinessAudit(client, {
      actorUserId: user.id,
      action: "ARCHIVE",
      entityType: "counter_income",
      entityId: data.id,
    });
    return { ok: true };
  };
  return tx ? run(tx) : prisma.$transaction(run);
}
