import type { Instrumentation } from "next";
import { logError } from "./lib/observability/logger";

/**
 * NFR-REL-06: capture every uncaught server request error in the host's
 * structured JSON log stream. Next invokes this for Server Components,
 * Route Handlers, Server Actions, and Proxy failures.
 *
 * Request headers and query strings are deliberately excluded: either may
 * contain credentials or reset tokens. Route templates and the pathname
 * provide enough context to locate the failing surface without logging
 * user-supplied values. Alert wiring remains a Phase 8B hosting task.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const pathname = request.path.split(/[?#]/, 1)[0] || "/";
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;

  logError("Unhandled server request error", error, {
    method: request.method,
    pathname,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
    digest,
  });
};
