import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";
import { PermissionDeniedError } from "../../../src/lib/permissions/guard";
import {
  getMonthlyResultTotals,
  getItemizedExpenseBreakdown,
} from "../../../src/server/queries/results";
import { getDashboardWarnings } from "../../../src/server/queries/warnings";
import { listAuditLog, getEntityHistory } from "../../../src/server/queries/audit-log";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

/**
 * FR-AUTH-04/CLAUDE.md §16: an Operator has no route to profit, loss,
 * partner investment, or the audit log — through the UI or a direct
 * request. Every Phase 5 query gated Partner-minimum is proven denied to
 * an Operator here, by direct call, independent of any page-level
 * redirect (which an Operator could otherwise bypass with a raw request).
 */
describe("Phase 5 authorization sweep — Operator denied on every Partner-minimum query", () => {
  it("denies report:financial-summary (getMonthlyResultTotals, getItemizedExpenseBreakdown)", async () => {
    const operator = await createTestUser({ role: "OPERATOR", isPartner: false });
    const range = { from: "2026-07-01", to: "2026-07-31" };

    await expect(getMonthlyResultTotals(prisma, operator, range)).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(getItemizedExpenseBreakdown(prisma, operator, range)).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it("denies report:dashboard (getDashboardWarnings)", async () => {
    const operator = await createTestUser({ role: "OPERATOR", isPartner: false });
    await expect(getDashboardWarnings(prisma, operator, "2026-07")).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it("denies audit-log:view (listAuditLog, getEntityHistory)", async () => {
    const operator = await createTestUser({ role: "OPERATOR", isPartner: false });
    await expect(listAuditLog(prisma, operator, {})).rejects.toThrow(PermissionDeniedError);
    await expect(getEntityHistory(prisma, operator, "asset", "any-id")).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it("also denies an unauthenticated (null) caller on every gate above", async () => {
    const range = { from: "2026-07-01", to: "2026-07-31" };
    await expect(getMonthlyResultTotals(prisma, null, range)).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(getDashboardWarnings(prisma, null, "2026-07")).rejects.toThrow(
      PermissionDeniedError,
    );
    await expect(listAuditLog(prisma, null, {})).rejects.toThrow(PermissionDeniedError);
  });
});
