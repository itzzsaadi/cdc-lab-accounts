/**
 * Phase 1 master-data seed. Loads ONLY what `docs/SRS.md` Appendix A calls
 * master data — parties, daily expense items, expense categories, vendors,
 * and the default profit-split setting.
 *
 * Deliberately excludes, per the Phase 1 plan and
 * docs/adr/0002-phase-1-schema-clarifications.md:
 *   - Any `users` row. Appendix A.5's three identities are a Phase 2
 *     deliverable, created for real once Better Auth can issue invitation
 *     links — no fabricated password or credential is ever seeded.
 *   - Any July 2026 transaction amount. Appendix A.2/A.3 list July figures
 *     next to each category/vendor name; those figures are NOT copied onto
 *     `expense_categories`/`vendors` (which have no amount column to begin
 *     with) or into any `daily_expenses`/`monthly_expenses` row. The AT
 *     WASTE Rs 8,000 discrepancy (CLAUDE.md §27) therefore does not arise
 *     here at all — no July amounts are loaded in Phase 1.
 *   - Any `assets` row (FR-AST-01: the register starts empty).
 *
 * Run via `npx prisma db seed` (reads DATABASE_URL) or, for the test
 * database, `DATABASE_URL="$TEST_DATABASE_URL" npx prisma db seed` — this
 * script itself never chooses which database; it requires DATABASE_URL to
 * already be set to the intended one.
 */
import { createPrismaClient } from "./client";
import { Prisma } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run the seed script.");
}

const prisma = createPrismaClient(connectionString);

// Appendix A.1 — Parties. Daily-billing parties first, then monthly, in
// the order printed in the SRS (sort_order preserves the existing sheet's
// column/row order, per SRS §6). NOTE: SRS §6 Appendix A.1 heading says
// "Parties (27)" but the table beneath it names only 26 — an SRS-internal
// count/list mismatch (the same category of issue as the 12-vs-13-table
// discrepancy), not silently "fixed" by inventing a 27th name here.
const DAILY_BILLING_PARTIES = ["GIVE LAB", "BEST LAB", "ACCURATE LAB", "SHAHADAT LAB"];

const MONTHLY_BILLING_PARTIES = [
  "HUSSAIN LAB",
  "KHADIJA LAB",
  "FATIMA LAB",
  "TAHIR BUTT LAB",
  "QASIM LAB",
  "TEHSIN LAB",
  "MAQBOOL LAB",
  "KASHIF LAB",
  "DANISH LAB",
  "RAMZAN HOS",
  "BASEERAT LAB",
  "AL RAI HOSP",
  "GUJRANWALA LAB",
  "ARQAM LAB",
  "ANWAAR LAB",
  "NOOR LAB",
  "PROMAX LAB",
  "TIMES LAB",
  "AMINA MURAD HOSP",
  "NAVEED LAB",
  "SWISS PAK LAB",
  "BHATTI LAB",
];

// Appendix A.2 — Administration categories (names only — no July amounts).
const ADMINISTRATION_CATEGORIES = [
  { name: "STAFF PAY 1", isRecurring: true },
  { name: "STAFF PAY 2", isRecurring: true },
  { name: "STAFF PAY 3", isRecurring: true },
  { name: "TECHNOLOGIST PAY 1", isRecurring: true },
  { name: "TECHNOLOGIST PAY 2", isRecurring: true },
  { name: "PATHOLOGIST PAY", isRecurring: true },
  { name: "SWEEPER PAY", isRecurring: true },
  { name: "UTILITY BILL", isRecurring: true },
  { name: "AT WASTE", isRecurring: true },
  { name: "NET CHARGES", isRecurring: true },
  { name: "SECURITY FEE", isRecurring: true },
  { name: "SOFTWARE CHARGES", isRecurring: true },
  { name: "CDC LAB LAHORE BILL", isRecurring: true },
  { name: "RENT LAB", isRecurring: true },
  { name: "COURIER", isRecurring: true },
];

// Appendix A.3 — Purchasing vendors/categories (names only — no July
// amounts). The "Daily Expenses (system-generated line)" row is a
// calculated, read-only display line (FR-MEXP-03), not master data, and is
// not seeded here. Each named line becomes both a vendor and a purchasing
// expense_category of the same name; the three "INST" lines are marked
// recurring (they correspond to a fixed monthly machine instalment), the
// ordinary supply lines are not (irregular purchase timing, per Appendix
// A.3's own "Supplies" vs. "Machine instalment" distinction).
const PURCHASING_LINES = [
  { name: "REHMAN TRADERS", isRecurring: false },
  { name: "NATIONAL DIAGNOSTICS", isRecurring: false },
  { name: "DATA DIAGNOSTICS", isRecurring: false },
  { name: "DATA DIAGNOSTICS INST", isRecurring: true },
  { name: "LAB MEDIKAL SOL", isRecurring: false },
  { name: "LAB MEDIKAL SOL INST", isRecurring: true },
  { name: "ZYNOTIC DIAGNOSTICS", isRecurring: false },
  { name: "ZYNOTIC DIAGNO INST", isRecurring: true },
  { name: "PERFECT MEDICAL SYS", isRecurring: false },
];

// Appendix A.4 — Daily expense items.
const DAILY_EXPENSE_ITEMS = [
  "WATER",
  "PARCEL",
  "STRIPS",
  "SOAP",
  "TISSUE",
  "SYRINGES",
  "ALCOHOL SWAB",
  "CBC VIALS",
  "CLOT VIALS",
  "ELISA KITS",
  "SPRAY",
  "PETROL",
  "COURIER",
  "PAPER RIM",
  "REGISTER",
  "KEY RINGS",
  "FLEX",
  "ENGINEER VISIT",
  "PRINTER REPAIR",
  "ENTERTAINMENT",
  "STAFF PAY",
  "OTHER",
];

async function main() {
  let sortOrder = 1;

  for (const name of DAILY_BILLING_PARTIES) {
    await prisma.party.upsert({
      where: { name },
      create: { name, billingMode: "DAILY", sortOrder: sortOrder++ },
      update: {},
    });
  }

  for (const name of MONTHLY_BILLING_PARTIES) {
    await prisma.party.upsert({
      where: { name },
      create: { name, billingMode: "MONTHLY", sortOrder: sortOrder++ },
      update: {},
    });
  }

  for (const name of DAILY_EXPENSE_ITEMS) {
    await prisma.expenseItem.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }

  for (const category of ADMINISTRATION_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { name: category.name },
      create: { name: category.name, expenseGroup: "ADMIN", isRecurring: category.isRecurring },
      update: {},
    });
  }

  for (const line of PURCHASING_LINES) {
    await prisma.expenseCategory.upsert({
      where: { name: line.name },
      create: { name: line.name, expenseGroup: "PURCHASING", isRecurring: line.isRecurring },
      update: {},
    });
    await prisma.vendor.upsert({
      where: { name: line.name },
      create: { name: line.name },
      update: {},
    });
  }

  // Appendix A.6 — default profit split. updated_by is nullable (ADR-0002
  // decision 4): this row is created before any user account exists.
  // Phase 7: splitAPercent/splitBPercent are the authoritative, typed
  // columns (settingValue's legacy partner_a/partner_b JSON keys are no
  // longer read or written — see docs/adr/0009-phase-7-administration-
  // and-import.md); both must be non-null and sum to 100 from the moment
  // this row exists, per the database's own CHECK constraint.
  await prisma.appSetting.upsert({
    where: { settingKey: "profit_split" },
    create: {
      settingKey: "profit_split",
      settingValue: {},
      splitAPercent: new Prisma.Decimal(50),
      splitBPercent: new Prisma.Decimal(50),
      updatedBy: null,
      updatedAt: new Date(),
    },
    update: {},
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
