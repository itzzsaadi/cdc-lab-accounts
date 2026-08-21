import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { Decimal, ZERO } from "../../lib/domain/money";

export interface AssetListFilter {
  classification?: "FIXED" | "MOVABLE";
  acquisitionMode?: "INSTALMENT" | "CASH";
  status?: "ACTIVE" | "ARCHIVED";
}

/** FR-AST-09: filterable by classification/mode/status, with a purchase-price total across the *filtered* CASH rows. Archived assets remain listed (never physically removed, CLAUDE.md §11) unless the caller filters `status: "ACTIVE"`. */
export async function listAssets(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  filter: AssetListFilter,
) {
  requirePermission(currentUser, "asset:manage");

  const items = await prisma.asset.findMany({
    where: {
      ...(filter.classification ? { classification: filter.classification } : {}),
      ...(filter.acquisitionMode ? { acquisitionMode: filter.acquisitionMode } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    include: {
      vendor: { select: { id: true, name: true } },
      purchasedBy: { select: { id: true, fullName: true } },
      defaultCategory: { select: { id: true, name: true, isActive: true } },
    },
    orderBy: [{ name: "asc" }],
  });

  const purchasePriceTotal = items
    .filter((asset) => asset.acquisitionMode === "CASH" && asset.purchasePrice)
    .reduce<Decimal>((sum, asset) => sum.plus(asset.purchasePrice!), ZERO);

  return { items, purchasePriceTotal: purchasePriceTotal.toString() };
}

/** Active Purchasing-group categories only — the picker for an instalment asset's `defaultCategoryId` (FR-AST-04's requirement that the category be active and belong to Purchasing). */
export async function listActivePurchasingCategories(prisma: PrismaClient) {
  return prisma.expenseCategory.findMany({
    where: { isActive: true, expenseGroup: "PURCHASING" },
    orderBy: { name: "asc" },
  });
}

export async function listActivePartnersForAsset(prisma: PrismaClient) {
  return prisma.user.findMany({
    where: { isPartner: true, isActive: true },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
}

export async function listActiveVendorsForAsset(prisma: PrismaClient) {
  return prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}
