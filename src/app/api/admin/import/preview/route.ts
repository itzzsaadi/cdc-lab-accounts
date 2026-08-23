import { NextRequest, NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { prisma } from "../../../../../server/prisma";
import { getAuthenticatedUser } from "../../../../../server/session";
import {
  requirePermission,
  PermissionDeniedError,
  type AuthenticatedUser,
} from "../../../../../lib/permissions/guard";
import { previewImport } from "../../../../../server/import/preview";
import { checkRateLimit, IMPORT_PREVIEW_RATE_LIMIT } from "../../../../../lib/rate-limit";
import { MAX_IMPORT_FILE_BYTES } from "../../../../../lib/validation/import";

// Multipart framing adds a small amount around the file itself. This cap
// lets a valid 5 MB workbook through while rejecting an oversized declared
// request before `formData()` allocates memory for it.
const MAX_IMPORT_REQUEST_BYTES = MAX_IMPORT_FILE_BYTES + 64 * 1024;

/**
 * FR-IMP-01/02. Multipart upload via `request.formData()` — never written
 * to disk (Next.js buffers the multipart body in memory for a Route
 * Handler; this project never calls anything that spills it to a temp
 * file). Authorization is checked before any parsing work begins.
 */
export async function POST(request: NextRequest) {
  const currentUser = await getAuthenticatedUser(await nextHeaders());
  return handleImportPreviewRequest(request, currentUser);
}

/** Exported separately so authorization-before-parsing is covered without a browser. */
export async function handleImportPreviewRequest(
  request: NextRequest,
  currentUser: AuthenticatedUser | null,
) {
  let user: AuthenticatedUser;
  try {
    user = requirePermission(currentUser, "historical-import:run");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    throw error;
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const contentLength = Number(declaredLength);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return NextResponse.json({ error: "Invalid Content-Length." }, { status: 400 });
    }
    if (contentLength > MAX_IMPORT_REQUEST_BYTES) {
      return NextResponse.json(
        { error: `File exceeds the ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB limit.` },
        { status: 413 },
      );
    }
  }

  // Throttle before multipart parsing. An authenticated caller may submit
  // malformed data repeatedly too; the limit exists to bound that work as
  // well as valid workbook previews.
  const decision = checkRateLimit(`import-preview:${user.id}`, IMPORT_PREVIEW_RATE_LIMIT);
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "Too many import previews. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds) } },
    );
  }

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

  // Reject the multipart file before copying its payload into a Buffer or
  // parsing Excel. The request-level Content-Length guard above catches a
  // declared oversized upload before multipart parsing; this second check
  // remains authoritative because a client controls its declared length.
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB limit.` },
      { status: 413 },
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await previewImport(prisma, user, {
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
