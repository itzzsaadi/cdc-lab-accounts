import { z } from "zod";

/** Server-side validation for every Phase 2 auth input (CLAUDE.md §18) — enforced regardless of any client-side check. */

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(["OPERATOR", "PARTNER", "ADMIN"]),
  isPartner: z.boolean(),
});

export const acceptInvitationSchema = z.object({
  userId: z.string().uuid(),
  token: z.string().min(1),
  newPassword: z.string().min(12),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(12),
});

/** Phase 7 (FR-AUTH-03): role and partner-flag are edited together, since a role change alone can't express "also drop/grant partner eligibility." Both changes are validated as one unit; the last-active-Admin and partner-flag-removal guards below live at the database level (phase7_administration_and_import migration), not here — this schema only checks input shape. */
export const changeUserRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["OPERATOR", "PARTNER", "ADMIN"]),
  isPartner: z.boolean(),
});
