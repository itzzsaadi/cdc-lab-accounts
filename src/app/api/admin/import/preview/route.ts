import { NextRequest, NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { prisma } from "../../../../../server/prisma";
import { getAuthenticatedUser } from "../../../../../server/session";
import { PermissionDeniedError } from "../../../../../lib/permissions/guard";
import { previewImport } from "../../../../../server/import/preview";

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

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await previewImport(prisma, currentUser, {
      name: file.name,
      size: file.size,
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
