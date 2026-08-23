import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, logInfo } from "../../../src/lib/observability/logger";
import { onRequestError } from "../../../src/instrumentation";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function parseOnlyCall(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  expect(spy).toHaveBeenCalledTimes(1);
  return JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
}

describe("host-native structured JSON logging (NFR-REL-06)", () => {
  it("emits one parseable JSON line and redacts secret-shaped keys recursively", () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logInfo("Import inspected", {
      importSessionId: "must-not-appear",
      workbookRows: 12,
      nested: { resetToken: "must-not-appear-either" },
    } as never);

    const record = parseOnlyCall(output);
    expect(record.level).toBe("info");
    expect(record.message).toBe("Import inspected");
    expect(record.importSessionId).toBe("[REDACTED]");
    expect(record.nested).toEqual({ resetToken: "[REDACTED]" });
    expect(record.timestamp).toEqual(expect.any(String));
  });

  it("omits stacks from production error records by default", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOG_STACKS", "false");
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logError("Database operation failed", new Error("connection refused"), {
      operation: "query",
    });

    const record = parseOnlyCall(output);
    expect(record.errorName).toBe("Error");
    expect(record.errorMessage).toBe("connection refused");
    expect(record).not.toHaveProperty("stack");
  });

  it("redacts credentials embedded in free-text error messages", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logError(
      "Connection failed",
      new Error(
        "postgresql://cdc_user:database-password@db.internal/cdc password=another-secret Bearer signed-token",
      ),
    );

    const record = parseOnlyCall(output);
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("database-password");
    expect(serialized).not.toContain("another-secret");
    expect(serialized).not.toContain("signed-token");
    expect(serialized).toContain("[REDACTED]");
  });

  it("captures uncaught server errors without headers or query-string values", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);

    onRequestError(
      new Error("render failed"),
      {
        path: "/reset-password?token=must-not-be-logged",
        method: "GET",
        headers: { cookie: "must-not-be-logged" },
      },
      {
        routerKind: "App Router",
        routePath: "/reset-password",
        routeType: "render",
        renderSource: "server-rendering",
        revalidateReason: undefined,
      },
    );

    const record = parseOnlyCall(output);
    expect(record.pathname).toBe("/reset-password");
    expect(record.routePath).toBe("/reset-password");
    expect(JSON.stringify(record)).not.toContain("must-not-be-logged");
  });
});
