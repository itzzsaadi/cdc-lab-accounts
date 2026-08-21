import { z } from "zod";

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
