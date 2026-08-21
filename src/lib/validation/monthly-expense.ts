import { z } from "zod";
import { decimalAmountSchema } from "./money";
import { yearMonthSchema } from "./calendar-date";

/**
 * FR-MEXP-01/05/07/08. `fundingSource = "PARTNER"` requires `fundedByUserId`
 * and `"BUSINESS"` forbids it — the same bidirectional rule as Daily
 * Expenses (DR-07 applies equally to monthly expenses, mirrored by the
 * identical `monthly_expenses_funding_source_partner_check` DB constraint).
 * `assetId` is never part of this schema — the ordinary create/edit form
 * never sets it; only the system's own instalment-generation function
 * (`src/server/mutations/monthly-expenses.ts`) writes an `assetId`, using a
 * plain object literal, not this schema.
 */
const monthlyExpenseFields = {
  periodMonth: yearMonthSchema,
  categoryId: z.string().uuid(),
  vendorId: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(300).optional(),
  amount: decimalAmountSchema({ allowZero: false }),
  fundingSource: z.enum(["BUSINESS", "PARTNER"]),
  fundedByUserId: z.string().uuid().optional(),
};

function refineFunding<
  T extends z.ZodType<{
    fundingSource: "BUSINESS" | "PARTNER";
    fundedByUserId?: string;
  }>,
>(schema: T) {
  return schema.superRefine((data, ctx) => {
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

/** FR-MEXP-08: `confirmedDuplicate` mirrors Counter Income's two-step non-blocking-warning flow — a first submission for a category already recorded this month returns a warning; the client resubmits identically with `confirmedDuplicate: true`, same `clientUuid`, to proceed. */
export const createMonthlyExpenseSchema = refineFunding(
  z.object({
    clientUuid: z.string().uuid(),
    confirmedDuplicate: z.boolean().optional(),
    ...monthlyExpenseFields,
  }),
);

export const updateMonthlyExpenseSchema = refineFunding(
  z.object({
    id: z.string().uuid(),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    ...monthlyExpenseFields,
  }),
);

export const archiveMonthlyExpenseSchema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

export const listMonthlyExpensesSchema = z.object({
  periodMonth: yearMonthSchema,
});

/** FR-AST-04: the Partner-triggered, selected-month, preview-then-confirm instalment-generation action. */
export const generateInstalmentLinesSchema = z.object({
  periodMonth: yearMonthSchema,
});

/** FR-MEXP-06: recurring-line pre-fill — the Partner reviews and may edit each proposed line before confirming; nothing saves until this is submitted. */
export const applyRecurringPrefillSchema = z.object({
  periodMonth: yearMonthSchema,
  lines: z
    .array(
      z.object({
        categoryId: z.string().uuid(),
        vendorId: z.string().uuid().optional(),
        description: z.string().trim().min(1).max(300).optional(),
        amount: decimalAmountSchema({ allowZero: false }),
        fundingSource: z.enum(["BUSINESS", "PARTNER"]),
        fundedByUserId: z.string().uuid().optional(),
      }),
    )
    .min(1, "Select at least one recurring line to create."),
});
