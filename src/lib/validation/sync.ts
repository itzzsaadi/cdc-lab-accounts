import { z } from "zod";

/** The six offline-syncable entity discriminators — see
 * `src/lib/offline/types.ts` for why Party Income is split into three. */
export const offlineEntityTypeSchema = z.enum([
  "daily_expense",
  "monthly_expense",
  "counter_income",
  "party_income_daily",
  "party_income_cash_receipt",
  "party_income_monthly_bill",
]);

/**
 * The outer envelope for one queued operation. `payload` is intentionally
 * `z.record(z.unknown())` here — its detailed shape is validated by the
 * specific create/update/archive Zod schema the routed mutation function
 * already calls (src/server/sync/apply.ts), so validation logic is never
 * duplicated between the two layers.
 */
export const syncOperationEnvelopeSchema = z.object({
  operationId: z.string().uuid(),
  entityType: offlineEntityTypeSchema,
  action: z.enum(["CREATE", "UPDATE", "ARCHIVE"]),
  clientUuid: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
});

/** FR-OFF batch limit: at most 50 operations per upload request. */
export const syncUploadBatchSchema = z.object({
  operations: z.array(syncOperationEnvelopeSchema).min(1).max(50),
});
