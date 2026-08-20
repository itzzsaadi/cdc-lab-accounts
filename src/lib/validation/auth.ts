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
