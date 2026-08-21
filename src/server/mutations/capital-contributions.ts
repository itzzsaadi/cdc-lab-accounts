import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { appendBusinessAudit } from "../../lib/audit";
import { Decimal } from "../../lib/domain/money";
import { parseCalendarDate } from "../../lib/domain/calendar-date";
import {
  createCapitalContributionSchema,
  archiveCapitalContributionSchema,
} from "../../lib/validation/capital-contribution";

export type CreateResult = { ok: true; id: string } | { ok: false; error: string };
export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * FR-INV-03/04, BR-06/BR-11. No `client_uuid` (ADR-0002 decision 7,
 * `capital_contributions` is not offline-enterable) — a plain authenticated
 * create; the UI disables its submit button while pending to protect
 * against a double click, the same way Asset creation does. `amount` is
 * always stored positive (`capital_contributions_amount_positive` CHECK);
 * `contributionType: "DRAWING"` is what `partnerInvestmentTotal` treats as
 * subtracting — never a negative number written here. Multiple
 * contributions/drawings for the same partner and date are allowed; no
 * uniqueness constraint applies (none is required by the SRS, and a
 * partner may legitimately inject or withdraw capital more than once on
 * the same day).
 */
export async function createCapitalContribution(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<CreateResult> {
  const user = requirePermission(currentUser, "investment:manage");

  const parsed = createCapitalContributionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const entryDate = parseCalendarDate(data.entryDate);
  if (!entryDate) {
    return { ok: false, error: "Invalid date." };
  }

  const id = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.capitalContribution.create({
      data: {
        id,
        partnerUserId: data.partnerUserId,
        entryDate,
        amount: new Decimal(data.amount),
        contributionType: data.contributionType,
        note: data.note,
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: "CREATE",
      entityType: "capital_contribution",
      entityId: id,
      newValues: {
        partnerUserId: data.partnerUserId,
        amount: data.amount,
        contributionType: data.contributionType,
      },
    });
  });
  return { ok: true, id };
}

export async function archiveCapitalContribution(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "investment:manage");

  const parsed = archiveCapitalContributionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const result = await tx.capitalContribution.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), isArchived: false },
      data: { isArchived: true, updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      return { ok: false, error: "This entry was already changed or archived by someone else." };
    }
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: "ARCHIVE",
      entityType: "capital_contribution",
      entityId: data.id,
    });
    return { ok: true };
  });
}
