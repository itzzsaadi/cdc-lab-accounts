import type { PrismaClient } from "../../../generated/prisma/client";
import type { AuthenticatedUser } from "../../../src/lib/permissions/guard";
import type { PermissionKey } from "../../../src/lib/permissions/matrix";

import * as assetQueries from "../../../src/server/queries/assets";
import * as auditLogQueries from "../../../src/server/queries/audit-log";
import * as capitalQueries from "../../../src/server/queries/capital-contributions";
import * as counterIncomeQueries from "../../../src/server/queries/counter-income";
import * as dailyExpenseQueries from "../../../src/server/queries/daily-expenses";
import * as homeQueries from "../../../src/server/queries/home";
import * as monthlyExpenseQueries from "../../../src/server/queries/monthly-expenses";
import * as offlineQueries from "../../../src/server/queries/offline";
import * as partyIncomeQueries from "../../../src/server/queries/party-income";
import * as resultQueries from "../../../src/server/queries/results";
import * as warningQueries from "../../../src/server/queries/warnings";

import * as appSettingMutations from "../../../src/server/mutations/app-settings";
import * as assetMutations from "../../../src/server/mutations/assets";
import * as capitalMutations from "../../../src/server/mutations/capital-contributions";
import * as counterIncomeMutations from "../../../src/server/mutations/counter-income";
import * as dailyExpenseMutations from "../../../src/server/mutations/daily-expenses";
import * as masterDataMutations from "../../../src/server/mutations/master-data";
import * as monthlyExpenseMutations from "../../../src/server/mutations/monthly-expenses";
import * as partyIncomeMutations from "../../../src/server/mutations/party-income";
import * as userAdminMutations from "../../../src/server/mutations/user-admin";

import * as importCommit from "../../../src/server/import/commit";
import * as importPreview from "../../../src/server/import/preview";
import * as syncRetention from "../../../src/server/sync/retention";

/**
 * The **explicit protected-surface registry** (Phase 8A).
 *
 * Every server function that guards itself with `requirePermission` is
 * listed here by hand, with the permission key it guards. Deliberately
 * explicit rather than derived by runtime reflection: reflection over a
 * module's exports cannot tell a guarded function from an unguarded
 * helper, silently passes when a function is renamed, and reads as magic
 * six months later. A hand-written list is greppable, reviewable in a
 * diff, and — paired with the drift check in the sweep — fails loudly the
 * day someone adds a guarded function and forgets to list it.
 *
 * `invoke` deliberately passes a nonsense argument. Every function here
 * calls `requirePermission` as its *first* statement, before any Zod
 * parse or database read, so a caller who lacks the permission must be
 * rejected regardless of what they sent. That is exactly what makes this
 * an **execution-based** sweep rather than a static assertion: if anyone
 * ever reorders a function so validation runs before the guard, the call
 * returns a validation error instead of throwing, and the sweep fails.
 */
export interface ProtectedSurfaceEntry {
  /** `module.functionName`, for a legible failure message. */
  name: string;
  /** Source file, used by the drift check to count `requirePermission` call sites. */
  file: string;
  permission: PermissionKey;
  invoke: (prisma: PrismaClient, user: AuthenticatedUser | null) => Promise<unknown>;
}

/** The guard runs first in every listed function, so the input is never reached on a denial. */
const IGNORED = {} as never;

export const PROTECTED_SURFACE: ProtectedSurfaceEntry[] = [
  // ---- Queries -----------------------------------------------------------
  {
    name: "queries/assets.listAssets",
    file: "src/server/queries/assets.ts",
    permission: "asset:manage",
    invoke: (p, u) => assetQueries.listAssets(p, u, IGNORED),
  },
  {
    name: "queries/audit-log.listAuditLog",
    file: "src/server/queries/audit-log.ts",
    permission: "audit-log:view",
    invoke: (p, u) => auditLogQueries.listAuditLog(p, u, IGNORED),
  },
  {
    name: "queries/audit-log.listAuditActors",
    file: "src/server/queries/audit-log.ts",
    permission: "audit-log:view",
    invoke: (p, u) => auditLogQueries.listAuditActors(p, u),
  },
  {
    name: "queries/audit-log.getEntityHistory",
    file: "src/server/queries/audit-log.ts",
    permission: "audit-log:view",
    invoke: (p, u) => auditLogQueries.getEntityHistory(p, u, "asset", "any-id"),
  },
  {
    name: "queries/capital-contributions.getPartnerInvestmentStatements",
    file: "src/server/queries/capital-contributions.ts",
    permission: "investment:view",
    invoke: (p, u) => capitalQueries.getPartnerInvestmentStatements(p, u),
  },
  {
    name: "queries/counter-income.listCounterIncome",
    file: "src/server/queries/counter-income.ts",
    permission: "entry:counter-income",
    invoke: (p, u) => counterIncomeQueries.listCounterIncome(p, u, IGNORED),
  },
  {
    name: "queries/daily-expenses.listDailyExpenses",
    file: "src/server/queries/daily-expenses.ts",
    permission: "entry:daily-expense",
    invoke: (p, u) => dailyExpenseQueries.listDailyExpenses(p, u, IGNORED),
  },
  {
    name: "queries/home.listRecentEntries",
    file: "src/server/queries/home.ts",
    permission: "entry:daily-expense",
    invoke: (p, u) => homeQueries.listRecentEntries(p, u),
  },
  {
    name: "queries/monthly-expenses.listMonthlyExpenses",
    file: "src/server/queries/monthly-expenses.ts",
    permission: "monthly-expense:manage",
    invoke: (p, u) => monthlyExpenseQueries.listMonthlyExpenses(p, u, IGNORED),
  },
  {
    name: "queries/offline.getOfflineReferenceSnapshot",
    file: "src/server/queries/offline.ts",
    permission: "offline:sync-center",
    invoke: (p, u) => offlineQueries.getOfflineReferenceSnapshot(p, u),
  },
  {
    name: "queries/party-income.getPartyIncomeGrid",
    file: "src/server/queries/party-income.ts",
    permission: "entry:party-income",
    invoke: (p, u) => partyIncomeQueries.getPartyIncomeGrid(p, u, IGNORED),
  },
  {
    name: "queries/party-income.getPartyMonthlyTotals",
    file: "src/server/queries/party-income.ts",
    permission: "entry:party-income",
    invoke: (p, u) => partyIncomeQueries.getPartyMonthlyTotals(p, u, IGNORED),
  },
  {
    name: "queries/party-income.getPartyIncomeReport",
    file: "src/server/queries/party-income.ts",
    permission: "report:financial-summary",
    invoke: (p, u) => partyIncomeQueries.getPartyIncomeReport(p, u, IGNORED),
  },
  {
    name: "queries/results.getMonthlyResultTotals",
    file: "src/server/queries/results.ts",
    permission: "report:financial-summary",
    invoke: (p, u) => resultQueries.getMonthlyResultTotals(p, u, IGNORED),
  },
  {
    name: "queries/results.getDashboardTrend",
    file: "src/server/queries/results.ts",
    permission: "report:dashboard",
    invoke: (p, u) => resultQueries.getDashboardTrend(p, u, IGNORED),
  },
  {
    name: "queries/results.getItemizedExpenseBreakdown",
    file: "src/server/queries/results.ts",
    permission: "report:financial-summary",
    invoke: (p, u) => resultQueries.getItemizedExpenseBreakdown(p, u, IGNORED),
  },
  {
    name: "queries/warnings.getDashboardWarnings",
    file: "src/server/queries/warnings.ts",
    permission: "report:dashboard",
    invoke: (p, u) => warningQueries.getDashboardWarnings(p, u, "2026-07"),
  },

  // ---- Mutations ---------------------------------------------------------
  {
    name: "mutations/app-settings.configurePartnerMapping",
    file: "src/server/mutations/app-settings.ts",
    permission: "profit-split:configure-partners",
    invoke: (p, u) => appSettingMutations.configurePartnerMapping(p, u, IGNORED),
  },
  {
    name: "mutations/app-settings.updateProfitSplit",
    file: "src/server/mutations/app-settings.ts",
    permission: "profit-split:manage",
    invoke: (p, u) => appSettingMutations.updateProfitSplit(p, u, IGNORED),
  },
  {
    name: "mutations/assets.createAsset",
    file: "src/server/mutations/assets.ts",
    permission: "asset:manage",
    invoke: (p, u) => assetMutations.createAsset(p, u, IGNORED),
  },
  {
    name: "mutations/assets.updateAsset",
    file: "src/server/mutations/assets.ts",
    permission: "asset:manage",
    invoke: (p, u) => assetMutations.updateAsset(p, u, IGNORED),
  },
  {
    name: "mutations/assets.archiveAsset",
    file: "src/server/mutations/assets.ts",
    permission: "asset:manage",
    invoke: (p, u) => assetMutations.archiveAsset(p, u, IGNORED),
  },
  {
    name: "mutations/capital-contributions.createCapitalContribution",
    file: "src/server/mutations/capital-contributions.ts",
    permission: "investment:manage",
    invoke: (p, u) => capitalMutations.createCapitalContribution(p, u, IGNORED),
  },
  {
    name: "mutations/capital-contributions.archiveCapitalContribution",
    file: "src/server/mutations/capital-contributions.ts",
    permission: "investment:manage",
    invoke: (p, u) => capitalMutations.archiveCapitalContribution(p, u, IGNORED),
  },
  {
    name: "mutations/counter-income.createCounterIncome",
    file: "src/server/mutations/counter-income.ts",
    permission: "entry:counter-income",
    invoke: (p, u) => counterIncomeMutations.createCounterIncome(p, u, IGNORED),
  },
  {
    name: "mutations/counter-income.updateCounterIncome",
    file: "src/server/mutations/counter-income.ts",
    permission: "entry:counter-income",
    invoke: (p, u) => counterIncomeMutations.updateCounterIncome(p, u, IGNORED),
  },
  {
    name: "mutations/counter-income.archiveCounterIncome",
    file: "src/server/mutations/counter-income.ts",
    permission: "entry:counter-income",
    invoke: (p, u) => counterIncomeMutations.archiveCounterIncome(p, u, IGNORED),
  },
  {
    name: "mutations/daily-expenses.createDailyExpense",
    file: "src/server/mutations/daily-expenses.ts",
    permission: "entry:daily-expense",
    invoke: (p, u) => dailyExpenseMutations.createDailyExpense(p, u, IGNORED),
  },
  {
    name: "mutations/daily-expenses.updateDailyExpense",
    file: "src/server/mutations/daily-expenses.ts",
    permission: "entry:daily-expense",
    invoke: (p, u) => dailyExpenseMutations.updateDailyExpense(p, u, IGNORED),
  },
  {
    name: "mutations/daily-expenses.archiveDailyExpense",
    file: "src/server/mutations/daily-expenses.ts",
    permission: "entry:daily-expense",
    invoke: (p, u) => dailyExpenseMutations.archiveDailyExpense(p, u, IGNORED),
  },
  {
    name: "mutations/master-data.createParty",
    file: "src/server/mutations/master-data.ts",
    permission: "master-data:manage",
    invoke: (p, u) => masterDataMutations.createParty(p, u, IGNORED),
  },
  {
    name: "mutations/master-data.updateParty",
    file: "src/server/mutations/master-data.ts",
    permission: "master-data:manage",
    invoke: (p, u) => masterDataMutations.updateParty(p, u, IGNORED),
  },
  {
    name: "mutations/master-data.archiveOrReactivateParty",
    file: "src/server/mutations/master-data.ts",
    permission: "master-data:manage",
    invoke: (p, u) => masterDataMutations.archiveOrReactivateParty(p, u, IGNORED),
  },
  {
    name: "mutations/master-data.createExpenseItem",
    file: "src/server/mutations/master-data.ts",
    permission: "master-data:manage",
    invoke: (p, u) => masterDataMutations.createExpenseItem(p, u, IGNORED),
  },
  {
    name: "mutations/master-data.updateExpenseItem",
    file: "src/server/mutations/master-data.ts",
    permission: "master-data:manage",
    invoke: (p, u) => masterDataMutations.updateExpenseItem(p, u, IGNORED),
  },
  {
    name: "mutations/master-data.archiveOrReactivateExpenseItem",
    file: "src/server/mutations/master-data.ts",
    permission: "master-data:manage",
    invoke: (p, u) => masterDataMutations.archiveOrReactivateExpenseItem(p, u, IGNORED),
  },
  {
    name: "mutations/master-data.createExpenseCategory",
    file: "src/server/mutations/master-data.ts",
    permission: "master-data:manage",
    invoke: (p, u) => masterDataMutations.createExpenseCategory(p, u, IGNORED),
  },
  {
    name: "mutations/master-data.updateExpenseCategory",
    file: "src/server/mutations/master-data.ts",
    permission: "master-data:manage",
    invoke: (p, u) => masterDataMutations.updateExpenseCategory(p, u, IGNORED),
  },
  {
    name: "mutations/master-data.archiveOrReactivateExpenseCategory",
    file: "src/server/mutations/master-data.ts",
    permission: "master-data:manage",
    invoke: (p, u) => masterDataMutations.archiveOrReactivateExpenseCategory(p, u, IGNORED),
  },
  {
    name: "mutations/master-data.createVendor",
    file: "src/server/mutations/master-data.ts",
    permission: "master-data:manage",
    invoke: (p, u) => masterDataMutations.createVendor(p, u, IGNORED),
  },
  {
    name: "mutations/master-data.updateVendor",
    file: "src/server/mutations/master-data.ts",
    permission: "master-data:manage",
    invoke: (p, u) => masterDataMutations.updateVendor(p, u, IGNORED),
  },
  {
    name: "mutations/master-data.archiveOrReactivateVendor",
    file: "src/server/mutations/master-data.ts",
    permission: "master-data:manage",
    invoke: (p, u) => masterDataMutations.archiveOrReactivateVendor(p, u, IGNORED),
  },
  {
    name: "mutations/monthly-expenses.createMonthlyExpense",
    file: "src/server/mutations/monthly-expenses.ts",
    permission: "monthly-expense:manage",
    invoke: (p, u) => monthlyExpenseMutations.createMonthlyExpense(p, u, IGNORED),
  },
  {
    name: "mutations/monthly-expenses.updateMonthlyExpense",
    file: "src/server/mutations/monthly-expenses.ts",
    permission: "monthly-expense:manage",
    invoke: (p, u) => monthlyExpenseMutations.updateMonthlyExpense(p, u, IGNORED),
  },
  {
    name: "mutations/monthly-expenses.archiveMonthlyExpense",
    file: "src/server/mutations/monthly-expenses.ts",
    permission: "monthly-expense:manage",
    invoke: (p, u) => monthlyExpenseMutations.archiveMonthlyExpense(p, u, IGNORED),
  },
  {
    name: "mutations/monthly-expenses.generateInstalmentLines",
    file: "src/server/mutations/monthly-expenses.ts",
    permission: "monthly-expense:manage",
    invoke: (p, u) => monthlyExpenseMutations.generateInstalmentLines(p, u, IGNORED),
  },
  {
    name: "mutations/monthly-expenses.applyRecurringPrefill",
    file: "src/server/mutations/monthly-expenses.ts",
    permission: "monthly-expense:manage",
    invoke: (p, u) => monthlyExpenseMutations.applyRecurringPrefill(p, u, IGNORED),
  },
  {
    name: "mutations/party-income.createDailyPartyIncomeCell",
    file: "src/server/mutations/party-income.ts",
    permission: "entry:party-income",
    invoke: (p, u) => partyIncomeMutations.createDailyPartyIncomeCell(p, u, IGNORED),
  },
  {
    name: "mutations/party-income.updateDailyPartyIncomeCell",
    file: "src/server/mutations/party-income.ts",
    permission: "entry:party-income",
    invoke: (p, u) => partyIncomeMutations.updateDailyPartyIncomeCell(p, u, IGNORED),
  },
  {
    name: "mutations/party-income.archivePartyIncome",
    file: "src/server/mutations/party-income.ts",
    permission: "entry:party-income",
    invoke: (p, u) => partyIncomeMutations.archivePartyIncome(p, u, IGNORED),
  },
  {
    name: "mutations/party-income.createCashReceipt",
    file: "src/server/mutations/party-income.ts",
    permission: "entry:cash-receipt",
    invoke: (p, u) => partyIncomeMutations.createCashReceipt(p, u, IGNORED),
  },
  {
    name: "mutations/party-income.createMonthlyPartyBill",
    file: "src/server/mutations/party-income.ts",
    permission: "party-income:monthly-bill",
    invoke: (p, u) => partyIncomeMutations.createMonthlyPartyBill(p, u, IGNORED),
  },
  {
    name: "mutations/party-income.updateMonthlyPartyBill",
    file: "src/server/mutations/party-income.ts",
    permission: "party-income:monthly-bill",
    invoke: (p, u) => partyIncomeMutations.updateMonthlyPartyBill(p, u, IGNORED),
  },
  {
    name: "mutations/party-income.archiveMonthlyPartyBill",
    file: "src/server/mutations/party-income.ts",
    permission: "party-income:monthly-bill",
    invoke: (p, u) => partyIncomeMutations.archiveMonthlyPartyBill(p, u, IGNORED),
  },
  {
    name: "mutations/user-admin.changeUserRole",
    file: "src/server/mutations/user-admin.ts",
    permission: "user:manage-role",
    invoke: (p, u) => userAdminMutations.changeUserRole(p, u, IGNORED),
  },

  // ---- Import and sync ---------------------------------------------------
  {
    name: "import/preview.previewImport",
    file: "src/server/import/preview.ts",
    permission: "historical-import:run",
    invoke: (p, u) =>
      importPreview.previewImport(p, u, {
        name: "x.xlsx",
        size: 4,
        bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      }),
  },
  {
    name: "import/commit.commitImport",
    file: "src/server/import/commit.ts",
    permission: "historical-import:run",
    invoke: (p, u) => importCommit.commitImport(p, u, "00000000-0000-4000-8000-000000000000"),
  },
  {
    name: "sync/retention.cleanupExpiredSyncReceipts",
    file: "src/server/sync/retention.ts",
    permission: "sync:retention-cleanup",
    invoke: (p, u) => syncRetention.cleanupExpiredSyncReceipts(p, u),
  },
];

/**
 * Permission keys that are enforced in a Server Action rather than in a
 * plain server function, and so cannot be driven from Vitest — a Server
 * Action resolves the caller from the request's own session rather than
 * accepting one as an argument. Both are covered end-to-end instead, by
 * `tests/e2e/authorization-sweep.spec.ts` (route denial) and
 * `tests/e2e/phase7-administration.spec.ts` (the Users screen).
 *
 * Listed explicitly so the completeness check below stays exhaustive: a
 * new key must appear either in `PROTECTED_SURFACE` or here, never in
 * neither.
 */
export const ACTION_ONLY_PERMISSIONS: { key: PermissionKey; enforcedIn: string }[] = [
  { key: "user:invite", enforcedIn: "src/server/actions/auth.ts (inviteUser, reissueInvitation)" },
  {
    key: "user:deactivate",
    enforcedIn: "src/server/actions/auth.ts (deactivateUser, reactivateUser)",
  },
];
