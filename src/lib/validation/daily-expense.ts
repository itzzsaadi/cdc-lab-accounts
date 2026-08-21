import { z } from "zod";
import { decimalAmountSchema } from "./money";
import { calendarDateSchema } from "./calendar-date";

/**
 * FR-DEXP-01/02/05/06. Exactly one of `expenseItemId` (a managed-list
 * selection) or `customDescription` (free text, FR-DEXP-02) is required —
 * never both, never neither. `fundingSource = "PARTNER"` requires
 * `fundedByUserId` and `"BUSINESS"` forbids it, mirroring the database's
 * own bidirectional CHECK constraint (`daily_expenses_funding_source_partner_check`)
 * so a bad request is rejected with a field-level Zod error before it ever
 * reaches Postgres.
 */
const dailyExpenseFields = {
  expenseDate: calendarDateSchema,
  expenseItemId: z.string().uuid().optional(),
  customDescription: z.string().trim().min(1).max(300).optional(),
  amount: decimalAmountSchema({ allowZero: false }),
  fundingSource: z.enum(["BUSINESS", "PARTNER"]),
  fundedByUserId: z.string().uuid().optional(),
};

function refineItemAndFunding<
  T extends z.ZodType<{
    expenseItemId?: string;
    customDescription?: string;
    fundingSource: "BUSINESS" | "PARTNER";
    fundedByUserId?: string;
  }>,
>(schema: T) {
  return schema.superRefine((data, ctx) => {
    if (Boolean(data.expenseItemId) === Boolean(data.customDescription)) {
      ctx.addIssue({
        code: "custom",
        message: "Choose an item from the list, or enter a description — not both, not neither.",
        path: ["customDescription"],
      });
    }
    if (data.fundingSource === "PARTNER" && !data.fundedByUserId) {
      ctx.addIssue({
        code: "custom",
        message: "A partner must be named when the funding source is Partner.",
        path: ["fundedByUserId"],
      });
    }
    if (data.fundingSource === "BUSINESS" && data.fundedByUserId !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "A partner cannot be named when the funding source is Business.",
        path: ["fundedByUserId"],
      });
    }
  });
}

export const createDailyExpenseSchema = refineItemAndFunding(
  z.object({
    clientUuid: z.string().uuid(),
    ...dailyExpenseFields,
  }),
);

export const updateDailyExpenseSchema = refineItemAndFunding(
  z.object({
    id: z.string().uuid(),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    ...dailyExpenseFields,
  }),
);

export const archiveDailyExpenseSchema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

export const listDailyExpensesSchema = z.object({
  from: calendarDateSchema,
  to: calendarDateSchema,
  expenseItemId: z.string().uuid().optional(),
  fundingSource: z.enum(["BUSINESS", "PARTNER"]).optional(),
});
