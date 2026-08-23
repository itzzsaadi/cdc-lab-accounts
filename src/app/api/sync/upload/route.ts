import { NextRequest, NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { prisma } from "../../../../server/prisma";
import { getAuthenticatedUser } from "../../../../server/session";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { syncUploadBatchSchema } from "../../../../lib/validation/sync";
import { processSyncBatch } from "../../../../server/sync/upload";
import { checkRateLimit, SYNC_UPLOAD_RATE_LIMIT } from "../../../../lib/rate-limit";

/** Defensive body-size cap (mandatory batch/security limit) — checked
 * before parsing, since a Route Handler has no implicit size limit of its
 * own the way the old Pages API bodyParser did. 50 operations at a
 * generous per-operation size should never approach this; anything larger
 * is rejected outright rather than parsed. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Batch offline-sync upload (FR-OFF-06/07, DR-05). Authorization and
 * request parsing only — all retry-safe replay/receipt logic lives in
 * `src/server/sync/upload.ts`, directly unit/integration-testable without
 * a running Next.js server.
 */
export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Batch too large." }, { status: 413 });
  }

  const currentUser = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(currentUser, "offline:sync-center");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    throw error;
  }

  // Phase 8A throttle — after authorization, so an unauthenticated probe
  // can never consume a real user's quota. Sized well above NFR-PERF-07's
  // 200-entries-in-30s target (4 batches) so a genuine reconnect after a
  // long offline stretch is never throttled; it bounds a client stuck in
  // a retry loop, not normal use.
  const decision = checkRateLimit(`sync-upload:${currentUser!.id}`, SYNC_UPLOAD_RATE_LIMIT);
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "Too many sync requests. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds) } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = syncUploadBatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid batch.", code: "INVALID_OPERATION" },
      { status: 400 },
    );
  }

  const results = await processSyncBatch(prisma, currentUser!.id, parsed.data.operations);
  return NextResponse.json({ results });
}
