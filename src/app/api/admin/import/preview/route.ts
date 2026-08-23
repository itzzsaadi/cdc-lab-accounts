import { NextRequest, NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { prisma } from "../../../../../server/prisma";
import { getAuthenticatedUser } from "../../../../../server/session";
import { PermissionDeniedError } from "../../../../../lib/permissions/guard";
import { previewImport } from "../../../../../server/import/preview";
import { checkRateLimit, IMPORT_PREVIEW_RATE_LIMIT } from "../../../../../lib/rate-limit";
import { MAX_IMPORT_FILE_BYTES } from "../../../../../lib/validation/import";

/**
 * FR-IMP-01/02. Multipart upload via `request.formData()` — never written
 * to disk (Next.js buffers the multipart body in memory for a Route
 * Handler; this project never calls anything that spills it to a temp
 * file). Authorization is checked before any parsing work begins.
 */
export async function POST(request: NextRequest) {
  const currentUser = await getAuthenticatedUser(await nextHeaders());

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Malformed upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  // Phase 8A: reject on the declared size *before* reading the body into
  // memory. `previewImport` also enforces the limit, but it was previously
  // the only check, and by the time it ran the whole oversized file had
  // already been buffered — the exact cost the limit exists to avoid.
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB limit.` },
      { status: 413 },
    );
  }

  // Rate limit only once the caller is known to be authenticated and the
  // request well-formed, so an unauthenticated probe can never consume a
  // real user's quota. `previewImport` still re-checks the permission
  // itself — this is throttling, never authorization.
  if (currentUser) {
    const decision = checkRateLimit(`import-preview:${currentUser.id}`, IMPORT_PREVIEW_RATE_LIMIT);
    if (!decision.allowed) {
      return NextResponse.json(
        { error: "Too many import previews. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds) } },
      );
    }
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await previewImport(prisma, currentUser, {
      name: file.name,
      // The authoritative size is what was actually read, not what the
      // multipart part claimed — a client controls `file.size`.
      size: bytes.byteLength,
      bytes,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    throw error;
  }
}
