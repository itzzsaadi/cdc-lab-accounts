import { z } from "zod";

/**
 * Phase 7 (FR-MST-06): each percentage matches the shared `NUMERIC(5,2)`
 * shape (up to 3 integer digits, 2 decimal places — 100.00 is the only
 * 3-integer-digit value that can ever legitimately appear). The
 * server never trusts a submitted "sums to 100" total — it recomputes
 * the sum itself via `Decimal`, never a native `number` — see
 * src/server/mutations/profit-split.ts. This is a distinct pattern from
 * `decimalAmountSchema` (money.ts): a percentage is not a monetary amount
 * and the column width differs (5,2) vs (14,2).
 */
const PERCENT_STRING_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;
export const percentStringSchema = z
  .string()
  .trim()
  .regex(PERCENT_STRING_PATTERN, "Enter a percentage with up to 2 decimal places.");

/**
 * Phase 5's narrow, Admin-only initial Partner A/B mapping action —
 * explicit identity, never account-creation order or any other implicit
 * fallback. Mirrors the DB's own bidirectional rule (both configured
 * together, never partial) and its distinctness `CHECK`.
 */
export const configurePartnerMappingSchema = z
  .object({
    partnerAUserId: z.string().uuid(),
    partnerBUserId: z.string().uuid(),
  })
  .refine((data) => data.partnerAUserId !== data.partnerBUserId, {
    message: "Partner A and Partner B must be different people.",
    path: ["partnerBUserId"],
  });

/** Phase 7: percent-editing input shape only — the sum-to-100 check itself happens server-side against `Decimal` values (see profit-split.ts), never here against the raw strings. */
export const updateProfitSplitSchema = z.object({
  splitAPercent: percentStringSchema,
  splitBPercent: percentStringSchema,
});
