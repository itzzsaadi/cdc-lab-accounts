import { afterEach, describe, expect, it } from "vitest";
import type { Prisma } from "../../../generated/prisma/client";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { createTestUser } from "../helpers/fixtures";
import {
  listAuditLog,
  getEntityHistory,
  listAuditActors,
} from "../../../src/server/queries/audit-log";
import { PermissionDeniedError } from "../../../src/lib/permissions/guard";

const prisma = getTestPrismaClient();

afterEach(async () => {
  await resetDatabase();
});

async function partnerUser() {
  const row = await createTestUser({ role: "PARTNER", isPartner: true });
  return { id: row.id, role: row.role, isPartner: row.isPartner, isActive: row.isActive };
}

async function writeAudit(overrides: {
  actorUserId: string;
  entityType: string;
  entityId: string;
  action?: "CREATE" | "UPDATE" | "ARCHIVE";
  newValues?: Record<string, unknown>;
  capturedAt?: Date;
}) {
  await prisma.auditLog.create({
    data: {
      actorUserId: overrides.actorUserId,
      action: overrides.action ?? "CREATE",
      entityType: overrides.entityType,
      entityId: overrides.entityId,
      newValues: overrides.newValues as Prisma.InputJsonValue | undefined,
      capturedAt: overrides.capturedAt ?? new Date(),
    },
  });
}

describe("listAuditLog (FR-AUD-04) — filters, keyset pagination, redaction", () => {
  it("filters by entityType and actorUserId", async () => {
    const user = await partnerUser();
    const other = await createTestUser({ isPartner: true });
    await writeAudit({ actorUserId: user.id, entityType: "daily_expense", entityId: "e1" });
    await writeAudit({ actorUserId: other.id, entityType: "monthly_expense", entityId: "e2" });

    const byType = await listAuditLog(prisma, user, { entityType: "daily_expense" });
    expect(byType.items).toHaveLength(1);
    expect(byType.items[0].entityType).toBe("daily_expense");

    const byActor = await listAuditLog(prisma, user, { actorUserId: other.id });
    expect(byActor.items).toHaveLength(1);
    expect(byActor.items[0].actorUserId).toBe(other.id);
  });

  it("paginates via keyset cursor, newest first, no duplicate/skipped rows across pages", async () => {
    const user = await partnerUser();
    for (let i = 0; i < 5; i++) {
      await writeAudit({ actorUserId: user.id, entityType: "daily_expense", entityId: `e${i}` });
    }

    const firstPage = await listAuditLog(prisma, user, { limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await listAuditLog(prisma, user, {
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.items).toHaveLength(2);

    const allIds = [...firstPage.items, ...secondPage.items].map((i) => i.id);
    expect(new Set(allIds).size).toBe(4); // no duplicates
    expect(BigInt(secondPage.items[0].id)).toBeLessThan(BigInt(firstPage.items[1].id));
  });

  it("redacts a secret field in newValues before returning it", async () => {
    const user = await partnerUser();
    await writeAudit({
      actorUserId: user.id,
      entityType: "user",
      entityId: user.id,
      newValues: { resetToken: "abc123", role: "PARTNER" },
    });

    const page = await listAuditLog(prisma, user, {});
    const values = page.items[0].newValues as Record<string, unknown>;
    expect(values.resetToken).toBe("[REDACTED]");
    expect(values.role).toBe("PARTNER");
  });

  it("flags an entry over one month old and does not flag a recent one", async () => {
    const user = await partnerUser();
    await writeAudit({
      actorUserId: user.id,
      entityType: "daily_expense",
      entityId: "old-one",
      newValues: { expenseDate: "2026-01-01", amount: "100" },
      capturedAt: new Date("2026-08-21"),
    });
    await writeAudit({
      actorUserId: user.id,
      entityType: "daily_expense",
      entityId: "recent-one",
      newValues: { expenseDate: "2026-08-15", amount: "100" },
      capturedAt: new Date("2026-08-21"),
    });

    const page = await listAuditLog(prisma, user, {});
    const old = page.items.find((i) => i.entityId === "old-one")!;
    const recent = page.items.find((i) => i.entityId === "recent-one")!;
    expect(old.isEntryOverOneMonthOld).toBe(true);
    expect(recent.isEntryOverOneMonthOld).toBe(false);
  });
});

describe("getEntityHistory (FR-AUD-05)", () => {
  it("returns only that entity's rows, oldest first", async () => {
    const user = await partnerUser();
    await writeAudit({
      actorUserId: user.id,
      entityType: "asset",
      entityId: "asset-1",
      action: "CREATE",
    });
    await writeAudit({
      actorUserId: user.id,
      entityType: "asset",
      entityId: "asset-1",
      action: "UPDATE",
    });
    await writeAudit({
      actorUserId: user.id,
      entityType: "asset",
      entityId: "asset-2",
      action: "CREATE",
    });

    const history = await getEntityHistory(prisma, user, "asset", "asset-1");
    expect(history).toHaveLength(2);
    expect(history[0].action).toBe("CREATE");
    expect(history[1].action).toBe("UPDATE");
  });
});

describe("listAuditActors (FR-AUD-04's actor filter)", () => {
  it("returns every user, denies an OPERATOR", async () => {
    const user = await partnerUser();
    await createTestUser({ role: "OPERATOR", isPartner: false });

    const actors = await listAuditActors(prisma, user);
    expect(actors.length).toBeGreaterThanOrEqual(2);

    const operator = { id: "x", role: "OPERATOR" as const, isPartner: false, isActive: true };
    await expect(listAuditActors(prisma, operator)).rejects.toThrow(PermissionDeniedError);
  });
});
