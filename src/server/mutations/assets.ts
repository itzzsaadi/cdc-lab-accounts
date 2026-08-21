import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { appendBusinessAudit } from "../../lib/audit";
import { Decimal } from "../../lib/domain/money";
import { parseCalendarDate } from "../../lib/domain/calendar-date";
import {
  createAssetSchema,
  updateAssetSchema,
  archiveAssetSchema,
} from "../../lib/validation/asset";

export type CreateResult = { ok: true; id: string } | { ok: false; error: string };
export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * FR-AST-02/06/07, DR-08. No `client_uuid` — `assets` deliberately has none
 * (ADR-0002 decision 7, not offline-enterable), so this is a plain
 * authenticated create, not idempotency-keyed; the UI's own submit-button
 * disable-while-pending is what protects against a double click (there is
 * no retry-safe replay path to fall back on if a double submission slips
 * through, unlike the four `client_uuid`-bearing entities).
 *
 * An instalment asset's `defaultCategoryId` is re-validated here — active
 * and belonging to the Purchasing group — independent of the picker only
 * ever listing such categories client-side (NFR-SEC-05): the database's own
 * FK proves the category *exists*, but neither "active" nor "Purchasing
 * group" is expressible as a `CHECK` across two tables without a new
 * trigger, so this check is the actual enforcement.
 */
async function validateInstalmentCategory(
  prisma: PrismaClient,
  categoryId: string,
): Promise<string | null> {
  const category = await prisma.expenseCategory.findUnique({ where: { id: categoryId } });
  if (!category || !category.isActive || category.expenseGroup !== "PURCHASING") {
    return "The default category for an instalment asset must be an active Purchasing category.";
  }
  return null;
}

export async function createAsset(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<CreateResult> {
  const user = requirePermission(currentUser, "asset:manage");

  const parsed = createAssetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const acquiredOn = data.acquiredOn ? parseCalendarDate(data.acquiredOn) : null;
  if (data.acquiredOn && !acquiredOn) {
    return { ok: false, error: "Invalid date." };
  }

  if (data.acquisitionMode === "INSTALMENT") {
    const categoryError = await validateInstalmentCategory(prisma, data.defaultCategoryId!);
    if (categoryError) {
      return { ok: false, error: categoryError };
    }
  }

  const id = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.asset.create({
      data: {
        id,
        name: data.name,
        classification: data.classification,
        acquisitionMode: data.acquisitionMode,
        vendorId: data.vendorId,
        acquiredOn,
        monthlyInstalment:
          data.acquisitionMode === "INSTALMENT" ? new Decimal(data.monthlyInstalment!) : null,
        defaultCategoryId: data.acquisitionMode === "INSTALMENT" ? data.defaultCategoryId! : null,
        purchasePrice: data.acquisitionMode === "CASH" ? new Decimal(data.purchasePrice!) : null,
        purchasedByUserId: data.acquisitionMode === "CASH" ? data.purchasedByUserId! : null,
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: "CREATE",
      entityType: "asset",
      entityId: id,
      newValues: { name: data.name, acquisitionMode: data.acquisitionMode },
    });
  });
  return { ok: true, id };
}

export async function updateAsset(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "asset:manage");

  const parsed = updateAssetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const acquiredOn = data.acquiredOn ? parseCalendarDate(data.acquiredOn) : null;
  if (data.acquiredOn && !acquiredOn) {
    return { ok: false, error: "Invalid date." };
  }

  if (data.acquisitionMode === "INSTALMENT") {
    const categoryError = await validateInstalmentCategory(prisma, data.defaultCategoryId!);
    if (categoryError) {
      return { ok: false, error: categoryError };
    }
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.asset.findUnique({ where: { id: data.id } });
    const result = await tx.asset.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), status: "ACTIVE" },
      data: {
        name: data.name,
        classification: data.classification,
        acquisitionMode: data.acquisitionMode,
        vendorId: data.vendorId ?? null,
        acquiredOn,
        monthlyInstalment:
          data.acquisitionMode === "INSTALMENT" ? new Decimal(data.monthlyInstalment!) : null,
        defaultCategoryId: data.acquisitionMode === "INSTALMENT" ? data.defaultCategoryId! : null,
        purchasePrice: data.acquisitionMode === "CASH" ? new Decimal(data.purchasePrice!) : null,
        purchasedByUserId: data.acquisitionMode === "CASH" ? data.purchasedByUserId! : null,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
    if (result.count !== 1) {
      return {
        ok: false,
        error: "This asset was changed or archived by someone else. Reload it and try again.",
      };
    }
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: "UPDATE",
      entityType: "asset",
      entityId: data.id,
      oldValues: before
        ? { name: before.name, acquisitionMode: before.acquisitionMode }
        : undefined,
      newValues: { name: data.name, acquisitionMode: data.acquisitionMode },
    });
    return { ok: true };
  });
}

/** FR-AST-08: archiving (`status = 'ARCHIVED'`) stops future instalment-line generation only — `listInstalmentGenerationCandidates` filters to `status: "ACTIVE"` — and never alters any month already recorded. */
export async function archiveAsset(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  input: unknown,
): Promise<MutationResult> {
  const user = requirePermission(currentUser, "asset:manage");

  const parsed = archiveAssetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const result = await tx.asset.updateMany({
      where: { id: data.id, updatedAt: new Date(data.expectedUpdatedAt), status: "ACTIVE" },
      data: { status: "ARCHIVED", updatedBy: user.id, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      return { ok: false, error: "This asset was already changed or archived by someone else." };
    }
    await appendBusinessAudit(tx, {
      actorUserId: user.id,
      action: "ARCHIVE",
      entityType: "asset",
      entityId: data.id,
    });
    return { ok: true };
  });
}
