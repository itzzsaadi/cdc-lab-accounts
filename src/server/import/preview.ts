import { randomUUID, createHash } from "node:crypto";
import type { PrismaClient, Prisma } from "../../../generated/prisma/client";
import { requirePermission, type AuthenticatedUser } from "../../lib/permissions/guard";
import { MAX_IMPORT_FILE_BYTES } from "../../lib/validation/import";
import { parseImportWorkbook, MalformedImportFileError } from "./parse";
import { buildMasterDataResolvers } from "./resolvers";

const IMPORT_SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes (approved default)

/**
 * Best-effort, called opportunistically at the start of every preview
 * request (no separate cron/queue — matching this project's CON-07
 * simplicity mandate, same pattern as the offline-sync retention sweep).
 * Never deletes an `ImportSession` row outright — marks it EXPIRED and
 * nulls `fileBytes`, so bytes never linger past their 15-minute window
 * even if nobody ever calls commit for that session (mandatory correction
 * #1/#2: "mark failed or expired sessions unusable and clean them safely").
 */
async function sweepExpiredImportSessions(prisma: PrismaClient): Promise<void> {
  await prisma.importSession.updateMany({
    where: { status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED", fileBytes: null },
  });
}

export interface ImportPreviewResult {
  ok: true;
  importSessionId: string;
  batchId: string;
  totalRows: number;
  issues: { sheet: string; row: number; message: string }[];
  /** True only when every row parsed cleanly — commit is refused otherwise, but the preview response always includes the row-level issues regardless. */
  valid: boolean;
  /** Advisory only (mandatory correction — not a hard block): an identical file was already committed before. Real duplicate protection is the per-row uniqueness checks in parse.ts, not this. */
  repeatedFileWarning?: { previousBatchId: string; committedAt: string };
}

/**
 * FR-IMP-02: validates fully and marks every error, but writes nothing to
 * any business table — only a durable `ImportBatch` (status PENDING) and
 * an ephemeral `ImportSession` (the exact file bytes, 15-minute expiry)
 * are created. The browser gets back only `importSessionId` — never the
 * parsed row data itself as something it could resubmit at commit time.
 */
export async function previewImport(
  prisma: PrismaClient,
  currentUser: AuthenticatedUser | null,
  file: { name: string; size: number; bytes: Buffer },
): Promise<ImportPreviewResult | { ok: false; error: string }> {
  const user = requirePermission(currentUser, "historical-import:run");
  await sweepExpiredImportSessions(prisma);

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return {
      ok: false,
      error: `File exceeds the ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB limit.`,
    };
  }

  const fileHash = createHash("sha256").update(file.bytes).digest("hex");

  let parsed;
  try {
    const resolvers = await buildMasterDataResolvers(prisma);
    parsed = await parseImportWorkbook(file.bytes, resolvers);
  } catch (error) {
    if (error instanceof MalformedImportFileError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  const repeatedBatch = await prisma.importBatch.findFirst({
    where: { fileHash, status: "COMMITTED" },
    orderBy: { createdAt: "desc" },
  });

  const batchId = randomUUID();
  const sessionId = randomUUID();
  const now = new Date();

  await prisma.$transaction([
    prisma.importBatch.create({
      data: {
        id: batchId,
        fileHash,
        fileName: file.name,
        actorUserId: user.id,
        status: "PENDING",
        totalRows: parsed.totalRows,
        resultSummary: { issues: parsed.issues } as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.importSession.create({
      data: {
        id: sessionId,
        batchId,
        fileHash,
        fileBytes: new Uint8Array(file.bytes),
        status: "PENDING",
        createdBy: user.id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + IMPORT_SESSION_TTL_MS),
      },
    }),
  ]);

  return {
    ok: true,
    importSessionId: sessionId,
    batchId,
    totalRows: parsed.totalRows,
    issues: parsed.issues,
    valid: parsed.issues.length === 0,
    repeatedFileWarning: repeatedBatch
      ? {
          previousBatchId: repeatedBatch.id,
          committedAt: repeatedBatch.completedAt?.toISOString() ?? "",
        }
      : undefined,
  };
}
