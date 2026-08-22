import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import { computeRequestFingerprint } from "../../lib/offline/fingerprint";
import { applySyncOperation, type IncomingSyncOperation } from "./apply";

export interface OperationResult {
  operationId: string;
  status: string;
  body: unknown;
}

/**
 * The framework-independent core of the offline-sync upload endpoint
 * (see `src/app/api/sync/upload/route.ts`, which only parses/authenticates
 * and calls this) — directly callable from Vitest against a real test
 * database, the same pattern every mutation/query module in this codebase
 * already follows.
 *
 * Each operation is processed inside its own single database transaction:
 * lookup-by-operationId first — not found -> run the mutation, its audit
 * row, and the sync_operations receipt all in that one transaction
 * (CLAUDE.md Phase 6 mandatory decision #3); found with a matching
 * fingerprint -> replay the stored result_body verbatim, never re-running
 * the mutation or a second audit write; found with a *different*
 * fingerprint -> reject as OPERATION_ID_REUSED. One operation's rejection
 * never aborts the rest of the batch.
 */
export async function processSyncBatch(
  prisma: PrismaClient,
  actorUserId: string,
  operations: IncomingSyncOperation[],
): Promise<OperationResult[]> {
  const results: OperationResult[] = [];
  for (const op of operations) {
    results.push(await processOneOperation(prisma, actorUserId, op));
  }
  return results;
}

async function processOneOperation(
  prisma: PrismaClient,
  actorUserId: string,
  op: IncomingSyncOperation,
): Promise<OperationResult> {
  const requestFingerprint = await computeRequestFingerprint({
    entityType: op.entityType,
    action: op.action,
    clientUuid: op.clientUuid,
    payload: op.payload,
  });

  return prisma.$transaction(async (tx) => {
    const existingReceipt = await tx.syncOperation.findUnique({
      where: { operationId: op.operationId },
    });

    if (existingReceipt) {
      if (existingReceipt.requestFingerprint !== requestFingerprint) {
        return {
          operationId: op.operationId,
          status: "REJECTED",
          body: {
            error: "This operation id was already used for different content.",
            code: "OPERATION_ID_REUSED",
          },
        };
      }
      return {
        operationId: op.operationId,
        status: existingReceipt.status,
        body: existingReceipt.resultBody,
      };
    }

    const currentUser = await tx.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, role: true, isPartner: true, isActive: true },
    });
    const outcome = await applySyncOperation(prisma, currentUser, tx, op);

    await tx.syncOperation.create({
      data: {
        operationId: op.operationId,
        actorUserId,
        entityType: op.entityType,
        clientUuid: op.clientUuid,
        action: op.action,
        requestFingerprint,
        status: outcome.status,
        resultBody: outcome.body as Prisma.InputJsonValue,
      },
    });

    return { operationId: op.operationId, status: outcome.status, body: outcome.body };
  });
}
