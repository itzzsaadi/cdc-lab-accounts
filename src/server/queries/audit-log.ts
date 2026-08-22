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
  /** FR-AUD-06 (Should): true when the entity's own business date (not `capturedAt`) is more than one calendar month in the past. Resolved from the audit row's own JSON snapshot for `daily_expense`/`monthly_expense`/`party_income`/`counter_income`, and from a live, batched lookup of the current row for `asset` (`acquiredOn`)/`capital_contribution` (`entryDate`) — see `resolveLiveBusinessYearMonths` and ADR-0007 §13. `null` only when the entity genuinely has no business date at all (an `INSTALMENT` asset whose `acquiredOn` was never set) or the entity type is none of the above. */
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

/** `asset`/`capital_contribution` ids only — used to skip a malformed `entityId` before it ever reaches a `@db.Uuid`-typed query. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `asset`'s `acquiredOn` and `capital_contribution`'s `entryDate` are never
 * written into the audit JSON snapshot (see
 * `src/server/mutations/{assets,capital-contributions}.ts`), so FR-AUD-06
 * resolves their business date from the live row instead — the
 * physical-delete-rejection trigger (CLAUDE.md §11) guarantees that row
 * still exists for every CREATE/UPDATE/ARCHIVE audit entry.
 *
 * Batched (never N+1) resolution of the business year-month for every
 * `asset`/`capital_contribution` row referenced by the given audit rows —
 * at most one `findMany` per entity type, regardless of how many audit
 * rows are on the page. Returns a map keyed `${entityType}:${entityId}`;
 * a present key with a `null` value means the entity has no usable date
 * (e.g. an `INSTALMENT` asset's `acquiredOn` was never set) — still
 * distinct from "this entity type isn't live-looked-up at all," which is
 * simply absent from the map (see `toAuditLogEntry`'s fallback to the
 * JSON-snapshot extraction for every other entity type).
 */
async function resolveLiveBusinessYearMonths(
  prisma: PrismaClient,
  rows: { entityType: string; entityId: string }[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();

  // A malformed/non-UUID entityId (never produced by real mutations, which
  // always pass a genuine row id) must never crash this lookup — the
  // `id` column is `@db.Uuid`, so an invalid value would otherwise throw
  // at the database level. Filtered out here, not caught after the fact.
  const assetIds = Array.from(
    new Set(
      rows
        .filter((r) => r.entityType === "asset" && UUID_PATTERN.test(r.entityId))
        .map((r) => r.entityId),
    ),
  );
  const contributionIds = Array.from(
    new Set(
      rows
        .filter((r) => r.entityType === "capital_contribution" && UUID_PATTERN.test(r.entityId))
        .map((r) => r.entityId),
    ),
  );

  if (assetIds.length > 0) {
    const assets = await prisma.asset.findMany({
      where: { id: { in: assetIds } },
      select: { id: true, acquiredOn: true },
    });
    for (const asset of assets) {
      map.set(
        `asset:${asset.id}`,
        asset.acquiredOn ? asset.acquiredOn.toISOString().slice(0, 7) : null,
      );
    }
  }
  if (contributionIds.length > 0) {
    const contributions = await prisma.capitalContribution.findMany({
      where: { id: { in: contributionIds } },
      select: { id: true, entryDate: true },
    });
    for (const contribution of contributions) {
      map.set(
        `capital_contribution:${contribution.id}`,
        contribution.entryDate.toISOString().slice(0, 7),
      );
    }
  }

  return map;
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
  liveBusinessYearMonths: Map<string, string | null>,
): AuditLogEntry {
  const redactedOld = redactSensitiveValues(row.oldValues);
  const redactedNew = redactSensitiveValues(row.newValues);
  const liveKey = `${row.entityType}:${row.entityId}`;
  const entryYearMonth = liveBusinessYearMonths.has(liveKey)
    ? liveBusinessYearMonths.get(liveKey)!
    : (extractEntityYearMonth(row.newValues) ?? extractEntityYearMonth(row.oldValues));
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
  const liveBusinessYearMonths = await resolveLiveBusinessYearMonths(prisma, page);

  return {
    items: page.map((row) => toAuditLogEntry(row, now, liveBusinessYearMonths)),
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
  const liveBusinessYearMonths = await resolveLiveBusinessYearMonths(prisma, [
    { entityType, entityId },
  ]);
  return rows.map((row) => toAuditLogEntry(row, now, liveBusinessYearMonths));
}
