import { afterEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";
import {
  createCapitalContribution,
  archiveCapitalContribution,
} from "../../../src/server/mutations/capital-contributions";
import { partnerInvestmentTotal } from "../../../src/lib/domain/investment";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function partnerUser() {
  const row = await createTestUser({ role: "PARTNER", isPartner: true });
  return { id: row.id, role: row.role, isPartner: row.isPartner, isActive: row.isActive };
}

describe("createCapitalContribution (FR-INV-03/04, sign handling)", () => {
  it("stores INJECTION and DRAWING amounts both as positive Decimal, contributionType conveys the sign", async () => {
    const user = await partnerUser();

    await createCapitalContribution(prisma, user, {
      partnerUserId: user.id,
      entryDate: "2026-08-01",
      amount: "20000",
      contributionType: "INJECTION",
    });
    const drawing = await createCapitalContribution(prisma, user, {
      partnerUserId: user.id,
      entryDate: "2026-08-15",
      amount: "5000",
      contributionType: "DRAWING",
    });
    expect(drawing.ok).toBe(true);

    const rows = await prisma.capitalContribution.findMany({ where: { partnerUserId: user.id } });
    expect(rows.every((r) => r.amount.greaterThan(0))).toBe(true);

    const total = partnerInvestmentTotal(
      user.id,
      rows.map((r) => ({
        partnerUserId: r.partnerUserId,
        amount: r.amount,
        contributionType: r.contributionType,
      })),
      [],
      [],
    );
    expect(total.toString()).toBe("15000"); // 20000 injected - 5000 withdrawn
  });

  it("allows multiple contributions for the same partner and date (no uniqueness constraint)", async () => {
    const user = await partnerUser();

    const first = await createCapitalContribution(prisma, user, {
      partnerUserId: user.id,
      entryDate: "2026-08-01",
      amount: "1000",
      contributionType: "INJECTION",
    });
    const second = await createCapitalContribution(prisma, user, {
      partnerUserId: user.id,
      entryDate: "2026-08-01",
      amount: "2000",
      contributionType: "INJECTION",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const count = await prisma.capitalContribution.count({
      where: { partnerUserId: user.id, entryDate: new Date("2026-08-01") },
    });
    expect(count).toBe(2);
  });

  it("writes exactly one audit row per create", async () => {
    const user = await partnerUser();
    const result = await createCapitalContribution(prisma, user, {
      partnerUserId: user.id,
      entryDate: "2026-08-01",
      amount: "1000",
      contributionType: "INITIAL",
    });
    if (!result.ok) throw new Error("setup failed");
    const auditCount = await prisma.auditLog.count({
      where: { entityType: "capital_contribution", entityId: result.id },
    });
    expect(auditCount).toBe(1);
  });
});

describe("archiveCapitalContribution (no physical deletion, stale-write protected)", () => {
  it("archives rather than deletes and rejects a stale archive", async () => {
    const user = await partnerUser();
    const created = await createCapitalContribution(prisma, user, {
      partnerUserId: user.id,
      entryDate: "2026-08-01",
      amount: "1000",
      contributionType: "INITIAL",
    });
    if (!created.ok) throw new Error("setup failed");
    const row = await prisma.capitalContribution.findUniqueOrThrow({ where: { id: created.id } });

    const staleResult = await archiveCapitalContribution(prisma, user, {
      id: created.id,
      expectedUpdatedAt: new Date(row.updatedAt.getTime() - 1000).toISOString(),
    });
    expect(staleResult.ok).toBe(false);

    const result = await archiveCapitalContribution(prisma, user, {
      id: created.id,
      expectedUpdatedAt: row.updatedAt.toISOString(),
    });
    expect(result.ok).toBe(true);

    const archived = await prisma.capitalContribution.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(archived.isArchived).toBe(true);
  });
});
