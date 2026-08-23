import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("../../../src/server/prisma", () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}));

import { GET } from "../../../src/app/api/health/route";

beforeEach(() => {
  mocks.queryRaw.mockReset();
  vi.restoreAllMocks();
});

describe("database-backed health check (NFR-REL-07 basis, NFR-SEC-10)", () => {
  it("reports healthy only after the database probe succeeds", async () => {
    mocks.queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns a leak-free 503 and writes the cause only to structured logs", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("password=secret host=internal-db"));
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: "error", database: "unreachable" });
    expect(JSON.stringify(body)).not.toContain("internal-db");
    expect(output).toHaveBeenCalledTimes(1);
    const logRecord = JSON.parse(String(output.mock.calls[0]![0]));
    expect(logRecord).toMatchObject({
      level: "error",
      message: "Health check failed",
      probe: "database",
    });
    expect(JSON.stringify(logRecord)).not.toContain("password=secret");
  });
});
