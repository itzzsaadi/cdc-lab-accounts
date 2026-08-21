import type { Prisma } from "../../generated/prisma/client";
import type { AuditAction } from "../../generated/prisma/enums";

/**
 * The one place in the codebase that writes business/financial `audit_log`
 * rows (CLAUDE.md §17, Phase 3B). Deliberately diverges from
 * `src/lib/auth/audit.ts`'s `appendAuthAudit` (which takes a plain
 * `PrismaClient`): this helper accepts **only** `Prisma.TransactionClient`,
 * so it can never be called outside an interactive `prisma.$transaction`
 * block. Every Daily Expense / Party Income / Counter Income create,
 * update, or archive writes its audit row in the *same* transaction as the
 * business mutation — if the audit write fails, the transaction rolls back
 * and the business mutation never commits either (CLAUDE.md §17's "no
 * mechanism to bypass the audit log" applies to failure paths too, not
 * just to deliberate omission).
 *
 * Same repository-boundary discipline as `appendAuthAudit`: only ever
 * `auditLog.create`, never `.update`/`.delete`. Never pass a raw token,
 * password, or session identifier here — this module only ever sees
 * business-entity fields.
 */
export async function appendBusinessAudit(
  tx: Prisma.TransactionClient,
  entry: {
    actorUserId: string;
    action: AuditAction;
    entityType: string;
    entityId: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValues: (entry.oldValues ?? undefined) as Prisma.InputJsonValue | undefined,
      newValues: (entry.newValues ?? undefined) as Prisma.InputJsonValue | undefined,
      capturedAt: new Date(),
    },
  });
}
