import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getTestPrismaClient, resetDatabase } from "../helpers/test-db";
import { PermissionDeniedError, type AuthenticatedUser } from "../../../src/lib/permissions/guard";
import { PERMISSIONS, type PermissionKey } from "../../../src/lib/permissions/matrix";
import { hasAtLeastRole, type Role } from "../../../src/lib/permissions/roles";
import { PROTECTED_SURFACE, ACTION_ONLY_PERMISSIONS } from "./protected-surface";

const prisma = getTestPrismaClient();

afterAll(async () => {
  await resetDatabase();
});

const ROLES: Role[] = ["OPERATOR", "PARTNER", "ADMIN"];

function userWithRole(role: Role): AuthenticatedUser {
  return { id: randomUUID(), role, isPartner: role !== "OPERATOR", isActive: true };
}

/**
 * Phase 8A — the exhaustive authorization sweep (CLAUDE.md §15/§16,
 * FR-AUTH-08, NFR-SEC-03).
 *
 * Prior sweeps (`phase5-`, `phase7-authorization-sweep.test.ts`) each
 * covered the surface their own phase added, hand-picked. This one is
 * driven by the explicit registry in `protected-surface.ts` and covers
 * every guarded function in one place, so "we tested the endpoints we
 * remembered" stops being the coverage model.
 *
 * It is **execution-based**: each function is genuinely called with a
 * caller of each role, and the assertion is on what actually happens.
 * Nothing here inspects source text to decide whether a guard exists —
 * only the drift check at the bottom reads source, and only to count call
 * sites so an unlisted new function fails the build.
 */
describe("Full protected-surface sweep — every guarded server function, every role", () => {
  it("covers every permission key in the matrix", () => {
    const covered = new Set<PermissionKey>([
      ...PROTECTED_SURFACE.map((entry) => entry.permission),
      ...ACTION_ONLY_PERMISSIONS.map((entry) => entry.key),
    ]);
    const missing = (Object.keys(PERMISSIONS) as PermissionKey[]).filter(
      (key) => !covered.has(key),
    );
    expect(
      missing,
      `Permission key(s) with no coverage. Add the guarded function to PROTECTED_SURFACE, or — if it is enforced in a Server Action — to ACTION_ONLY_PERMISSIONS with a note saying where.`,
    ).toEqual([]);
  });

  it("rejects every unauthenticated caller across the entire surface", async () => {
    const failures: string[] = [];
    for (const entry of PROTECTED_SURFACE) {
      try {
        await entry.invoke(prisma, null);
        failures.push(`${entry.name} did not reject a null caller`);
      } catch (error) {
        if (!(error instanceof PermissionDeniedError)) {
          failures.push(`${entry.name} threw ${String(error)} instead of PermissionDeniedError`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("rejects a deactivated caller across the entire surface, whatever their role", async () => {
    // A live session cookie for an account deactivated a moment ago must
    // stop working immediately, not at next sign-in.
    const failures: string[] = [];
    for (const entry of PROTECTED_SURFACE) {
      const inactiveAdmin: AuthenticatedUser = {
        id: randomUUID(),
        role: "ADMIN",
        isPartner: true,
        isActive: false,
      };
      try {
        await entry.invoke(prisma, inactiveAdmin);
        failures.push(`${entry.name} did not reject a deactivated Admin`);
      } catch (error) {
        if (!(error instanceof PermissionDeniedError)) {
          failures.push(`${entry.name} threw ${String(error)} instead of PermissionDeniedError`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  for (const role of ROLES) {
    it(`rejects every ${role}-forbidden function and never rejects a permitted one for authorization reasons`, async () => {
      const wrongDenials: string[] = [];
      const wrongAllowances: string[] = [];

      for (const entry of PROTECTED_SURFACE) {
        const shouldAllow = hasAtLeastRole(role, PERMISSIONS[entry.permission].minimumRole);
        let deniedByPermission = false;
        try {
          await entry.invoke(prisma, userWithRole(role));
        } catch (error) {
          deniedByPermission = error instanceof PermissionDeniedError;
          // Any *other* throw is expected and ignored: the registry passes
          // deliberately invalid input, so a permitted caller frequently
          // fails validation or a foreign key afterwards. What matters is
          // only whether the permission gate let them past.
        }

        if (shouldAllow && deniedByPermission) {
          wrongDenials.push(`${entry.name} (${entry.permission}) wrongly denied a ${role}`);
        }
        if (!shouldAllow && !deniedByPermission) {
          wrongAllowances.push(`${entry.name} (${entry.permission}) wrongly allowed a ${role}`);
        }
      }

      // Reported separately: a wrong allowance is a security hole, a wrong
      // denial is a broken feature. Both fail, but the message says which.
      expect(wrongAllowances).toEqual([]);
      expect(wrongDenials).toEqual([]);
    });
  }

  it("proves the guard runs before validation — a forbidden caller is refused even with valid-looking input", async () => {
    // The registry's whole approach depends on this ordering. If someone
    // moves a Zod parse above `requirePermission`, a denied caller would
    // start receiving validation errors that describe the expected input
    // shape, which is itself a small disclosure.
    const { createParty } = await import("../../../src/server/mutations/master-data");
    const operator = userWithRole("OPERATOR");
    await expect(
      createParty(prisma, operator, { name: "Valid Name", billingMode: "DAILY", sortOrder: 1 }),
    ).rejects.toThrow(PermissionDeniedError);
    await expect(createParty(prisma, operator, { garbage: true })).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it("drift check: every requirePermission call site in the guarded modules is represented in the registry", () => {
    // Counts call sites in source and compares against registry entries
    // per file. Not a substitute for the execution sweep above — its only
    // job is to fail the day a guarded function is added and nobody lists
    // it, which the execution sweep alone could never notice.
    const filesInRegistry = new Set(PROTECTED_SURFACE.map((entry) => entry.file));
    const mismatches: string[] = [];

    for (const file of filesInRegistry) {
      const source = readFileSync(file, "utf8");
      const callSites = source.match(/requirePermission\(/g)?.length ?? 0;
      const registered = PROTECTED_SURFACE.filter((entry) => entry.file === file).length;
      if (callSites !== registered) {
        mismatches.push(
          `${file}: ${callSites} requirePermission call site(s) but ${registered} registry entr(ies)`,
        );
      }
    }

    expect(mismatches).toEqual([]);
  });
});
