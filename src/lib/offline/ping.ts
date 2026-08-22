/**
 * CLAUDE.md Phase 6 mandatory decision #2: a verified-authenticated
 * reconnect check — 3-second timeout, one retry — never the public
 * `/api/health` route (which only proves the server is reachable, not
 * that this session can still sync) and never bare `navigator.onLine`
 * (which only reflects the OS network interface, not a real, authenticated
 * connection to this server).
 */
const PING_TIMEOUT_MS = 3000;

async function pingOnce(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const response = await fetch("/api/sync/ping", { method: "HEAD", signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** One attempt, one retry on failure — a transient blip doesn't cost the
 * user a full sync cycle, but a second failure means "not really back
 * online yet" rather than retrying indefinitely. */
export async function verifyAuthenticatedConnection(): Promise<boolean> {
  if (await pingOnce()) {
    return true;
  }
  return pingOnce();
}
