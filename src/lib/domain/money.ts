import { Prisma } from "../../../generated/prisma/client";

/**
 * The project's one exact-decimal type (DR-01, CLAUDE.md §9/§10). Every
 * domain function in this directory takes and returns `Decimal`, never a
 * JS `number`, for any monetary value. This is the only file in
 * `src/lib/domain` that references the generated Prisma client, and only
 * for this value type — no PrismaClient, no query, no framework import.
 */
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export const ZERO = new Decimal(0);
