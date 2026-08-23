import { NextResponse } from "next/server";
import { prisma } from "../../../server/prisma";
import { logError } from "../../../lib/observability/logger";

/**
 * Liveness + readiness probe (Phase 8A, NFR-REL-07's monitoring basis).
 *
 * Previously this returned a static `{status:"ok"}` without touching
 * Postgres, so it reported healthy while the database was down — an
 * uptime monitor built on it would have stayed green through a total
 * outage. It now runs a trivial `SELECT 1`, bounded by an explicit
 * timeout so a hung connection pool fails the check quickly instead of
 * holding the request open until the platform's own gateway timeout.
 *
 * The response body is deliberately leak-free (NFR-SEC-10): on failure it
 * says only `{status:"error"}` — never the driver message, the host, or
 * the database name. The real cause goes to the structured log, which is
 * not reachable from the network. This route stays unauthenticated
 * because a probe that needs a session cannot report on a system whose
 * session store is the thing that is down.
 */

export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 3000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Health probe timed out.")), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export async function GET() {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, PROBE_TIMEOUT_MS);
    return NextResponse.json({ status: "ok", database: "ok" });
  } catch (error) {
    logError("Health check failed", error, { probe: "database" });
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
