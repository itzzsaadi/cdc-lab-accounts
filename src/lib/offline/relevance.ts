import type { QueuedOperation } from "./types";
import { monthBounds } from "../domain/calendar-date";

/**
 * FR-OFF-12: every operation still sitting in the local queue (any status
 * — `QUEUED`/`SYNCING`/`FAILED`/`CONFLICT`; a synced one is deleted by
 * `markSynced`, see queue.ts) has, by definition, NOT yet reached the
 * server's authoritative total for whatever date/month its payload
 * belongs to. This computes the single calendar-day (entry-level entities)
 * or full-month (`periodMonth`-keyed entities) range one operation
 * affects, so a results screen can tell whether it overlaps the period
 * it's currently displaying.
 */
export function operationAffectedRange(op: QueuedOperation): { from: string; to: string } | null {
  const payload = op.payload;
  switch (op.entityType) {
    case "daily_expense": {
      const date = payload.expenseDate;
      return typeof date === "string" ? { from: date, to: date } : null;
    }
    case "counter_income":
    case "party_income_daily":
    case "party_income_cash_receipt": {
      const date = payload.incomeDate;
      return typeof date === "string" ? { from: date, to: date } : null;
    }
    case "monthly_expense":
    case "party_income_monthly_bill": {
      const periodMonth = payload.periodMonth;
      if (typeof periodMonth !== "string") return null;
      const bounds = monthBounds(periodMonth);
      return { from: bounds.firstDay, to: bounds.lastDay };
    }
    default:
      return null;
  }
}

/** Inclusive overlap between two `YYYY-MM-DD` ranges — plain string
 * comparison is safe since ISO calendar dates sort lexicographically. */
function rangesOverlap(a: { from: string; to: string }, b: { from: string; to: string }): boolean {
  return a.from <= b.to && b.from <= a.to;
}

/**
 * Every still-queued operation whose affected date range overlaps
 * `[from, to]` — i.e. every entry that could change the totals currently
 * displayed for that period once it finishes syncing (or once a conflict
 * is resolved). An operation with no determinable date (a malformed
 * payload, which server-side Zod validation would reject on upload
 * anyway) is excluded rather than assumed relevant.
 */
export function operationsAffectingRange(
  operations: QueuedOperation[],
  from: string,
  to: string,
): QueuedOperation[] {
  const period = { from, to };
  return operations.filter((op) => {
    const range = operationAffectedRange(op);
    return range !== null && rangesOverlap(range, period);
  });
}
