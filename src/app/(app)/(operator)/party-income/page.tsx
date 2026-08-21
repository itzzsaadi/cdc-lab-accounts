import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { prisma } from "../../../../server/prisma";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import {
  getPartyIncomeGrid,
  listActivePartiesForCashReceipt,
} from "../../../../server/queries/party-income";
import { currentYearMonthInKarachi, parseYearMonth } from "../../../../lib/domain/calendar-date";
import { PartyIncomeGrid } from "../../../../components/entries/PartyIncomeGrid";
import { CashReceiptModal } from "../../../../components/entries/CashReceiptModal";

export default async function PartyIncomePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "entry:party-income");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const params = await searchParams;
  const requestedMonth = params.month && parseYearMonth(params.month) ? params.month : undefined;
  const yearMonth = requestedMonth ?? currentYearMonthInKarachi();

  const [grid, cashReceiptParties] = await Promise.all([
    getPartyIncomeGrid(prisma, user, yearMonth),
    listActivePartiesForCashReceipt(prisma),
  ]);

  return (
    <div>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-display-lg text-on-background font-bold">Party Income</h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            Daily-billing party income grid for {yearMonth}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <form className="flex items-center gap-3" action="/party-income">
            <label htmlFor="party-income-month" className="text-on-surface-variant text-sm">
              Month
            </label>
            <input
              id="party-income-month"
              name="month"
              type="month"
              defaultValue={yearMonth}
              className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
            />
            <button
              type="submit"
              className="border-outline-variant text-on-surface hover:bg-surface-container h-11 rounded-lg border px-3 text-sm"
            >
              Go
            </button>
          </form>
          <CashReceiptModal parties={cashReceiptParties.map((p) => ({ id: p.id, name: p.name }))} />
        </div>
      </div>

      <PartyIncomeGrid grid={grid} />
    </div>
  );
}
