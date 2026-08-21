import { z } from "zod";
import { decimalAmountSchema } from "./money";
import { calendarDateSchema } from "./calendar-date";

/**
 * FR-AST-02/06/07, DR-08. Mirrors `assets_acquisition_mode_check` exactly
 * (Phase 4 migration): `INSTALMENT` requires `monthlyInstalment` and
 * `defaultCategoryId`, forbids `purchasePrice`/`purchasedByUserId`; `CASH`
 * requires `purchasePrice` and `purchasedByUserId` (approved decision 2b —
 * the purchasing partner is never an optional checkbox), forbids
 * `monthlyInstalment`/`defaultCategoryId`. A single flat schema plus
 * `superRefine` — the same bidirectional-exclusivity style
 * `daily-expense.ts`'s `refineItemAndFunding` already uses — rather than
 * `z.discriminatedUnion` with `z.undefined()` branch fields, which this
 * project's installed Zod version treats a genuinely *absent* key as
 * failing (`z.undefined()` expects the key present with value `undefined`,
 * not simply omitted) — confirmed directly against a real payload, not
 * assumed from the type declaration.
 */
const amountFieldPattern = decimalAmountSchema({ allowZero: false });

const assetFields = {
  name: z.string().trim().min(1).max(200),
  classification: z.enum(["FIXED", "MOVABLE"]),
  vendorId: z.string().uuid().optional(),
  acquiredOn: calendarDateSchema.optional(),
  acquisitionMode: z.enum(["INSTALMENT", "CASH"]),
  monthlyInstalment: z.string().optional(),
  defaultCategoryId: z.string().uuid().optional(),
  purchasePrice: z.string().optional(),
  purchasedByUserId: z.string().uuid().optional(),
};

function refineAcquisitionMode<
  T extends z.ZodType<{
    acquisitionMode: "INSTALMENT" | "CASH";
    monthlyInstalment?: string;
    defaultCategoryId?: string;
    purchasePrice?: string;
    purchasedByUserId?: string;
  }>,
>(schema: T) {
  return schema.superRefine((data, ctx) => {
    if (data.acquisitionMode === "INSTALMENT") {
      const amountCheck = amountFieldPattern.safeParse(data.monthlyInstalment);
      if (!amountCheck.success) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid, positive monthly instalment.",
          path: ["monthlyInstalment"],
        });
      }
      if (!data.defaultCategoryId) {
        ctx.addIssue({
          code: "custom",
          message: "A default expense category is required for an instalment asset.",
          path: ["defaultCategoryId"],
        });
      }
      if (data.purchasePrice !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "An instalment asset cannot have a purchase price.",
          path: ["purchasePrice"],
        });
      }
      if (data.purchasedByUserId !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "An instalment asset carries no partner tag (BR-09).",
          path: ["purchasedByUserId"],
        });
      }
    } else {
      const amountCheck = amountFieldPattern.safeParse(data.purchasePrice);
      if (!amountCheck.success) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid, positive purchase price.",
          path: ["purchasePrice"],
        });
      }
      if (!data.purchasedByUserId) {
        ctx.addIssue({
          code: "custom",
          message: "A purchasing partner is required for a cash-purchased asset.",
          path: ["purchasedByUserId"],
        });
      }
      if (data.monthlyInstalment !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "A cash-purchased asset cannot have a monthly instalment.",
          path: ["monthlyInstalment"],
        });
      }
      if (data.defaultCategoryId !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "A cash-purchased asset has no default category.",
          path: ["defaultCategoryId"],
        });
      }
    }
  });
}

export const createAssetSchema = refineAcquisitionMode(z.object({ ...assetFields }));

export const updateAssetSchema = refineAcquisitionMode(
  z.object({
    id: z.string().uuid(),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    ...assetFields,
  }),
);

export const archiveAssetSchema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

export const listAssetsSchema = z.object({
  classification: z.enum(["FIXED", "MOVABLE"]).optional(),
  acquisitionMode: z.enum(["INSTALMENT", "CASH"]).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});
