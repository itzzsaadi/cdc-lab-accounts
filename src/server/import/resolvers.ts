import type { PrismaClient } from "../../../generated/prisma/client";
import type { MasterDataResolvers } from "./parse";

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Builds one fresh, in-memory case-insensitive lookup per master-data
 * entity from a single query each — called anew by both preview and
 * commit (never cached/reused across the two), so a party archived (or
 * renamed) between preview and commit is reflected the next time this is
 * built, per the "commit must reparse" requirement.
 */
export async function buildMasterDataResolvers(prisma: PrismaClient): Promise<MasterDataResolvers> {
  const [parties, items, categories, vendors, partners] = await Promise.all([
    prisma.party.findMany({ select: { id: true, name: true, isActive: true } }),
    prisma.expenseItem.findMany({ select: { id: true, name: true, isActive: true } }),
    prisma.expenseCategory.findMany({ select: { id: true, name: true, isActive: true } }),
    prisma.vendor.findMany({ select: { id: true, name: true, isActive: true } }),
    prisma.user.findMany({
      where: { isPartner: true },
      select: { id: true, fullName: true, isActive: true },
    }),
  ]);

  const partyByName = new Map(parties.map((p) => [normalize(p.name), p]));
  const itemByName = new Map(items.map((i) => [normalize(i.name), i]));
  const categoryByName = new Map(categories.map((c) => [normalize(c.name), c]));
  const vendorByName = new Map(vendors.map((v) => [normalize(v.name), v]));
  const partnerByName = new Map(partners.map((u) => [normalize(u.fullName), u]));

  return {
    resolveParty: (name) => partyByName.get(normalize(name)) ?? null,
    resolveExpenseItem: (name) => itemByName.get(normalize(name)) ?? null,
    resolveExpenseCategory: (name) => categoryByName.get(normalize(name)) ?? null,
    resolveVendor: (name) => vendorByName.get(normalize(name)) ?? null,
    resolvePartnerUser: (name) => partnerByName.get(normalize(name)) ?? null,
  };
}
