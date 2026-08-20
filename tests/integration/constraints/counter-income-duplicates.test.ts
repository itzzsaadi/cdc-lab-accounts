import { beforeEach, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";

const prisma = getTestPrismaClient();

/**
 * ADR-0002 decision 5 / FR-CINC-04: a second counter-income entry for a
 * date that already has one must be ALLOWED (the system only warns,
 * without blocking) — proving there is no unique constraint on
 * income_date, unlike SRS §6's literal (and, per the ADR, not
 * implemented) "UNIQUE where not archived" text.
 */
describe("counter-income non-blocking duplicate dates (FR-CINC-04)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("permits two active counter_income rows for the same income_date", async () => {
    const user = await createTestUser();
    const incomeDate = new Date("2026-07-15");

    await prisma.counterIncome.create({
      data: {
        clientUuid: crypto.randomUUID(),
        incomeDate,
        amount: "5000",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    const second = await prisma.counterIncome.create({
      data: {
        clientUuid: crypto.randomUUID(),
        incomeDate,
        amount: "750",
        note: "Correction entry — original was short by a shift's takings",
        capturedAt: new Date(),
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    expect(second.incomeDate).toEqual(incomeDate);

    const countForDate = await prisma.counterIncome.count({
      where: { incomeDate, isArchived: false },
    });
    expect(countForDate).toBe(2);
  });
});
