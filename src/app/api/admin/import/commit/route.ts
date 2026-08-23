import { NextRequest, NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { z } from "zod";
import { prisma } from "../../../../../server/prisma";
import { getAuthenticatedUser } from "../../../../../server/session";
import { PermissionDeniedError } from "../../../../../lib/permissions/guard";
import { commitImport } from "../../../../../server/import/commit";

const commitRequestSchema = z.object({ importSessionId: z.string().uuid() });

/**
 * FR-IMP-02/03. Takes only `importSessionId` — the request body never
 * carries parsed row data, so there is nothing here for a client to have
 * tampered with between preview and commit; `commitImport` re-parses the
 * exact bytes claimed from `ImportSession` from scratch.
 */
export async function POST(request: NextRequest) {
  const currentUser = await getAuthenticatedUser(await nextHeaders());

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const parsed = commitRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await commitImport(prisma, currentUser, parsed.data.importSessionId);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    throw error;
  }
}
