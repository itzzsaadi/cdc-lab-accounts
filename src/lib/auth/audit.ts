import type { PrismaClient, Prisma } from "../../../generated/prisma/client";
import type { AuditAction } from "../../../generated/prisma/enums";

/**
 * The one place in the codebase that writes authentication-related
 * `audit_log` rows (Phase 2 plan §9) — same repository-boundary discipline
 * Phase 1 established for the append-only trigger: this module only ever
 * calls `prisma.auditLog.create`, never `.update`/`.delete`. Never pass a
 * password, hash, session token, cookie, reset token, invitation token, or
 * a full reset/invitation URL in `oldValues`/`newValues` — only
 * non-secret identifiers.
 */
export async function appendAuthAudit(
  prisma: PrismaClient,
  entry: {
    actorUserId: string | null;
    action: AuditAction;
    entityType: string;
    entityId: string;
    newValues?: Record<string, unknown>;
  },
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      newValues: (entry.newValues ?? undefined) as Prisma.InputJsonValue | undefined,
      capturedAt: new Date(),
    },
  });
}
