import { z } from "zod";
import { decimalAmountSchema } from "./money";
import { calendarDateSchema } from "./calendar-date";

/**
 * FR-INV-03/04. `amount` is always a positive `Decimal` — `contributionType`
 * (never a stored sign) is what `partnerInvestmentTotal`
 * (`src/lib/domain/investment.ts`) treats as subtracting for `DRAWING`,
 * matching `capital_contributions_amount_positive`'s strict `CHECK > 0`.
 * No `client_uuid` — `capital_contributions` deliberately has none
 * (ADR-0002 decision 7, not offline-enterable); a plain authenticated
 * create is the correct shape here, not a speculative idempotency column.
 */
export const createCapitalContributionSchema = z.object({
  partnerUserId: z.string().uuid(),
  entryDate: calendarDateSchema,
  amount: decimalAmountSchema({ allowZero: false }),
  contributionType: z.enum(["INITIAL", "INJECTION", "DRAWING"]),
  note: z.string().trim().max(500).optional(),
});

export const archiveCapitalContributionSchema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});
