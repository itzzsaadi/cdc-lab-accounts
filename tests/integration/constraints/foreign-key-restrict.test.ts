import { describe, expect, it } from "vitest";
import { getTestPrismaClient } from "../helpers/test-db";

const prisma = getTestPrismaClient();

interface ForeignKeyRow {
  table_name: string;
  constraint_name: string;
  delete_rule: string;
}

/**
 * "Every relevant foreign key is restrictive" — verified by inspecting
 * Postgres's own catalog rather than by attempting a runtime DELETE,
 * because every one of these tables also has a BEFORE DELETE trigger
 * (physical-delete-protection.test.ts) that would reject the delete
 * first regardless of the FK's own ON DELETE rule, which would mask
 * whether the FK itself is actually configured correctly.
 *
 * `sessions`/`account` (Phase 2) are deliberately excluded: they are
 * authentication infrastructure, not business/financial/master-data/
 * settings/audit records, and their `ON DELETE CASCADE` to `users` is
 * intentional (Better Auth's own default — see
 * docs/adr/0003-phase-2-authentication.md). `users` itself, and every
 * table this rule actually governs, keeps RESTRICT/NO ACTION.
 */
describe("foreign keys on business/financial/audit tables are RESTRICT, never CASCADE/SET NULL", () => {
  it("has no CASCADE or SET NULL delete rule on any business/financial/master-data/settings/audit table", async () => {
    const rows = await prisma.$queryRaw<ForeignKeyRow[]>`
      SELECT
        tc.table_name,
        tc.constraint_name,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name AND tc.constraint_schema = rc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name NOT IN ('sessions', 'account')
    `;

    expect(rows.length).toBeGreaterThan(0);

    const notRestrictive = rows.filter(
      (row) => row.delete_rule !== "RESTRICT" && row.delete_rule !== "NO ACTION",
    );
    expect(notRestrictive).toEqual([]);
  });

  it("confirms sessions/account use CASCADE deliberately, not RESTRICT — the one documented exception", async () => {
    const rows = await prisma.$queryRaw<ForeignKeyRow[]>`
      SELECT tc.table_name, tc.constraint_name, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name AND tc.constraint_schema = rc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name IN ('sessions', 'account')
    `;
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.delete_rule).toBe("CASCADE");
    }
  });
});
