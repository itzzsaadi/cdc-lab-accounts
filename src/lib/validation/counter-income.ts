import { z } from "zod";
import { decimalAmountSchema } from "./money";
import { calendarDateSchema } from "./calendar-date";

/**
 * FR-CINC-01/04. `counter_income.amount` is the one exception to
 * "amounts are never zero" — its CHECK constraint is `>= 0`
 * (`counter_income_amount_non_negative`), unlike daily/monthly expenses and
 * party income, which are all strictly `> 0`. `confirmedDuplicate` is the
 * two-step FR-CINC-04 flow: a first submission omits it (or sends `false`);
 * if a non-archived counter-income row already exists for that date, the
 * server action returns a warning instead of creating a second row; the
 * client re-submits the same input with `confirmedDuplicate: true` to
 * proceed anyway. This is a non-blocking warning (FR-CINC-04 says "warn,
 * without blocking"), never a hard rejection.
 */
export const createCounterIncomeSchema = z.object({
  clientUuid: z.string().uuid(),
  incomeDate: calendarDateSchema,
  amount: decimalAmountSchema({ allowZero: true }),
  note: z.string().trim().max(300).optional(),
  confirmedDuplicate: z.boolean().optional(),
});

export const updateCounterIncomeSchema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  amount: decimalAmountSchema({ allowZero: true }),
  note: z.string().trim().max(300).optional(),
});

export const archiveCounterIncomeSchema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

export const listCounterIncomeSchema = z.object({
  from: calendarDateSchema,
  to: calendarDateSchema,
});
