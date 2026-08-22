import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { listActiveExpenseItems } from "./daily-expenses";
import { listActiveExpenseCategories, listActiveVendors } from "./monthly-expenses";
import { listActivePartiesForCashReceipt } from "./party-income";
import { listActivePartners } from "./capital-contributions";

export interface OfflineReferenceSnapshot {
  parties: {
    id: string;
    name: string;
    billingMode: string;
    isActive: boolean;
    sortOrder: number;
  }[];
  partnerUsers: { id: string; fullName: string }[];
  expenseItems: { id: string; name: string; isActive: boolean }[];
  expenseCategories: {
    id: string;
    name: string;
    expenseGroup: string;
    isActive: boolean;
  }[];
  vendors: { id: string; name: string; isActive: boolean }[];
}

/**
 * FR-OFF's offline reference-data cache (parties, partner users, expense
 * items, expense categories, vendors) — one call, refreshed by the client
 * on sign-in and after every successful sync (src/lib/offline/reference-
 * cache.ts). Reuses the same "active only" queries every online create/
 * edit form already calls, so there is exactly one source of truth for
 * which reference rows are pickable — never a second, separately-
 * maintained active-row query.
 */
export async function getOfflineReferenceSnapshot(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
): Promise<OfflineReferenceSnapshot> {
  requirePermission(currentUser, "offline:sync-center");

  const [parties, partnerUsers, expenseItems, expenseCategories, vendors] = await Promise.all([
    listActivePartiesForCashReceipt(prisma),
    listActivePartners(prisma),
    listActiveExpenseItems(prisma),
    listActiveExpenseCategories(prisma),
    listActiveVendors(prisma),
  ]);

  return {
    parties: parties.map((p) => ({
      id: p.id,
      name: p.name,
      billingMode: p.billingMode,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
    })),
    partnerUsers: partnerUsers.map((u) => ({ id: u.id, fullName: u.fullName })),
    expenseItems: expenseItems.map((i) => ({ id: i.id, name: i.name, isActive: i.isActive })),
    expenseCategories: expenseCategories.map((c) => ({
      id: c.id,
      name: c.name,
      expenseGroup: c.expenseGroup,
      isActive: c.isActive,
    })),
    vendors: vendors.map((v) => ({ id: v.id, name: v.name, isActive: v.isActive })),
  };
}
