import { z } from "zod";
import { decimalAmountSchema } from "./money";
import { calendarDateSchema, yearMonthSchema } from "./calendar-date";

/**
 * Party Income daily grid (FR-PINC-02/07). `receiptType` is never supplied
 * by the client — the grid server action always writes `"DAILY"` and the
 * Cash Receipt server action always writes `"CASH_DIRECT"` (two distinct
 * schemas below, not one generic one), so a client request can never
 * mislabel which kind of `party_income` row it is creating.
 *
 * `amount` never allows zero — `party_income_amount_positive` is a strict
 * `CHECK ("amount" > 0)`, identical to daily/monthly expenses and unlike
 * `counter_income`'s `>= 0`. There is no stored-zero representation for
 * "entered as zero"; FR-PINC-09's "shown as zero" applies only to a
 * computed range total when no row exists at all. Clearing a saved cell is
 * an archive of that row (see `archivePartyIncomeSchema`), never a write
 * of `amount: "0"`.
 */
export const createDailyPartyIncomeCellSchema = z.object({
  clientUuid: z.string().uuid(),
  partyId: z.string().uuid(),
  incomeDate: calendarDateSchema,
  amount: decimalAmountSchema({ allowZero: false }),
  /** Offline sync only — see the same field on createDailyExpenseSchema. */
  capturedAt: z.string().datetime({ offset: true }).optional(),
});

export const updateDailyPartyIncomeCellSchema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  amount: decimalAmountSchema({ allowZero: false }),
});

export const archivePartyIncomeSchema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

/** FR-PINC-06: date, amount, and a note are all required for a direct cash receipt — unlike the grid cell, where a note has no place in the workbook's daily layout. */
export const createCashReceiptSchema = z.object({
  clientUuid: z.string().uuid(),
  partyId: z.string().uuid(),
  incomeDate: calendarDateSchema,
  amount: decimalAmountSchema({ allowZero: false }),
  note: z.string().trim().min(1, "A note is required for a direct cash receipt.").max(300),
  /** Offline sync only — see the same field on createDailyExpenseSchema. */
  capturedAt: z.string().datetime({ offset: true }).optional(),
});

export const partyIncomeGridQuerySchema = z.object({
  yearMonth: yearMonthSchema,
});

/**
 * FR-PINC-03 (Partner-only, UC-07): one figure per monthly-billing party per
 * month. `incomeDate` is always the first day of `periodMonth` — enforced
 * by the mutation, not the client — matching `receiptType: "MONTHLY"` and
 * the Phase 4 partial unique index
 * (`party_income_active_monthly_party_month_unique`).
 */
export const createMonthlyPartyBillSchema = z.object({
  clientUuid: z.string().uuid(),
  partyId: z.string().uuid(),
  periodMonth: yearMonthSchema,
  amount: decimalAmountSchema({ allowZero: false }),
  /** Offline sync only — see the same field on createDailyExpenseSchema. */
  capturedAt: z.string().datetime({ offset: true }).optional(),
});

export const updateMonthlyPartyBillSchema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  amount: decimalAmountSchema({ allowZero: false }),
});

export const archiveMonthlyPartyBillSchema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});
