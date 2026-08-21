import type { PrismaClient } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { redactSensitiveValues } from "../../lib/audit-redaction";
import {
  parseCalendarDate,
  currentYearMonthInKarachi,
  previousYearMonth,
} from "../../lib/domain/calendar-date";

export interface AuditLogFilter {
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  /** The previous page's last row id (BigInt as a string) — strictly-less-than keyset pagination, never OFFSET. */
  cursor?: string;
  limit?: number;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: unknown;
  newValues: unknown;
  capturedAt: string;
  /** FR-AUD-06 (Should): true when the entity's own business date (not `capturedAt`) is more than one calendar month in the past. `null` when no known date field is present in this entry's values — not every entity type logs one (see docs/adr/0007-...md). */
  isEntryOverOneMonthOld: boolean | null;
}

const DATE_FIELD_CANDIDATES = ["expenseDate", "incomeDate", "periodMonth", "entryDate"] as const;

function extractEntityYearMonth(values: unknown): string | null {
  if (!values || typeof values !== "object") return null;
  const record = values as Record<string, unknown>;
  for (const field of DATE_FIELD_CANDIDATES) {
    const raw = record[field];
    if (typeof raw === "string" && /^\d{4}-\d{2}/.test(raw)) {
      return raw.slice(0, 7);
    }
  }
  return null;
}

/** "More than one month in the past" at whole-month granularity: the entry's own month must be strictly earlier than last month's — an entry from last month or this month is not flagged. */
function isOverOneMonthOld(entryYearMonth: string | null, referenceDate: Date): boolean | null {
  if (!entryYearMonth) return null;
  const cutoff = previousYearMonth(currentYearMonthInKarachi(referenceDate));
  return entryYearMonth < cutoff;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function toAuditLogEntry(
  row: {
    id: bigint;
    actorUserId: string | null;
    actor: { fullName: string } | null;
    action: string;
    entityType: string;
    entityId: string;
    oldValues: unknown;
    newValues: unknown;
    capturedAt: Date;
  },
  referenceDate: Date,
): AuditLogEntry {
  const redactedOld = redactSensitiveValues(row.oldValues);
  const redactedNew = redactSensitiveValues(row.newValues);
  const entryYearMonth =
    extractEntityYearMonth(row.newValues) ?? extractEntityYearMonth(row.oldValues);
  return {
    id: row.id.toString(),
    actorUserId: row.actorUserId,
    actorName: row.actor?.fullName ?? null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    oldValues: redactedOld,
    newValues: redactedNew,
    capturedAt: row.capturedAt.toISOString(),
    isEntryOverOneMonthOld: isOverOneMonthOld(entryYearMonth, referenceDate),
  };
}

/** FR-AUD-04: read-only, filterable by user/date/record type, keyset-paginated (never OFFSET — `audit_log.id` is a `BigInt` autoincrement, so "strictly less than the last row seen" is exact and index-backed regardless of table size). */
export async function listAuditLog(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  filter: AuditLogFilter,
): Promise<{ items: AuditLogEntry[]; nextCursor: string | null }> {
  requirePermission(currentUser, "audit-log:view");

  const limit = Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const fromDate = filter.from ? parseCalendarDate(filter.from) : null;
  const toDate = filter.to ? parseCalendarDate(filter.to) : null;
  const toDateExclusive = toDate ? new Date(toDate.getTime() + 24 * 60 * 60 * 1000) : null;

  const rows = await prisma.auditLog.findMany({
    where: {
      ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(fromDate || toDateExclusive
        ? {
            capturedAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDateExclusive ? { lt: toDateExclusive } : {}),
            },
          }
        : {}),
      ...(filter.cursor ? { id: { lt: BigInt(filter.cursor) } } : {}),
    },
    include: { actor: { select: { id: true, fullName: true } } },
    orderBy: { id: "desc" },
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const now = new Date();

  return {
    items: page.map((row) => toAuditLogEntry(row, now)),
    nextCursor: hasMore ? page[page.length - 1].id.toString() : null,
  };
}

/** FR-AUD-04's actor filter dropdown — every user who has ever authored an entry, not just currently-active ones (a deactivated user's past actions must remain filterable). */
export async function listAuditActors(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
): Promise<{ id: string; fullName: string }[]> {
  requirePermission(currentUser, "audit-log:view");
  return prisma.user.findMany({
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
}

/** FR-AUD-05: an individual record's own change history, from that record's own screen — oldest first for readability. */
export async function getEntityHistory(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  entityType: string,
  entityId: string,
): Promise<AuditLogEntry[]> {
  requirePermission(currentUser, "audit-log:view");

  const rows = await prisma.auditLog.findMany({
    where: { entityType, entityId },
    include: { actor: { select: { id: true, fullName: true } } },
    orderBy: { id: "asc" },
  });
  const now = new Date();
  return rows.map((row) => toAuditLogEntry(row, now));
}
