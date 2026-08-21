import { GridCellInput } from "./GridCellInput";
import type { PartyIncomeGrid as PartyIncomeGridData } from "../../server/queries/party-income";

/**
 * FR-PINC-02/07/08/09. Sticky day column + horizontal scroll on narrow
 * viewports (approved responsive treatment, mandatory safeguard #7 — no
 * further planning pause). An archived party's whole column is rendered
 * with every cell `readOnly` (mandatory safeguard #6) and a visual
 * "Archived" label next to its name — its historical figures stay visible,
 * never hidden, but accept no new entries or edits.
 *
 * Each `GridCellInput`'s `key` folds in the cell's current `id`/`updatedAt`
 * so that a server refresh (`router.refresh()`, triggered by a cell's own
 * "Reload" action after a stale-write conflict) remounts just that cell
 * with fresh data, rather than leaving its local autosave state stuck on
 * the value that was just rejected.
 */
export function PartyIncomeGrid({ grid }: { grid: PartyIncomeGridData }) {
  if (grid.parties.length === 0) {
    return (
      <p className="text-on-surface-variant border-outline-variant rounded-lg border border-dashed px-6 py-12 text-center text-sm">
        No daily-billing parties are set up yet.
      </p>
    );
  }

  return (
    <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-auto">
        <table className="w-full min-w-[800px] border-collapse text-left">
          <thead className="bg-surface-container-low sticky top-0 z-10">
            <tr>
              <th className="border-outline-variant bg-surface-container-high sticky left-0 z-20 w-16 border-r border-b p-3 text-center text-xs font-bold tracking-wide uppercase">
                Day
              </th>
              {grid.parties.map((party) => (
                <th
                  key={party.id}
                  className="border-outline-variant border-r border-b p-3 text-right text-xs font-bold tracking-wide uppercase"
                >
                  {party.name}
                  {!party.isActive ? (
                    <span className="text-on-surface-variant ml-1 font-normal normal-case">
                      (archived)
                    </span>
                  ) : null}
                </th>
              ))}
              <th className="bg-surface-container border-outline-variant border-b p-3 text-right text-xs font-bold tracking-wide uppercase">
                Row Total
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {grid.days.map((day, rowIndex) => (
              <tr key={day} className="group">
                <td className="border-outline-variant bg-surface-container-lowest group-hover:bg-surface-container-low sticky left-0 z-10 w-16 border-r border-b p-2 text-center">
                  {Number(day.slice(-2))}
                </td>
                {grid.parties.map((party, colIndex) => {
                  const cell = grid.cells[party.id]?.[day] ?? null;
                  return (
                    <td key={party.id} className="border-outline-variant border-r border-b p-0">
                      <GridCellInput
                        key={`${cell?.id ?? "empty"}-${cell?.updatedAt ?? ""}`}
                        partyId={party.id}
                        day={day}
                        initialRecord={cell}
                        readOnly={!party.isActive}
                        rowIndex={rowIndex}
                        colIndex={colIndex}
                      />
                    </td>
                  );
                })}
                <td className="border-outline-variant text-on-surface-variant border-b p-3 text-right font-bold">
                  {grid.dayTotals[day] ?? "0"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-surface-container-high">
            <tr>
              <td className="border-outline-variant border-r p-3 text-center text-xs font-bold uppercase">
                Total
              </td>
              {grid.parties.map((party) => (
                <td
                  key={party.id}
                  className="text-primary border-outline-variant border-r p-3 text-right font-bold"
                >
                  {grid.partyTotals[party.id] ?? "0"}
                </td>
              ))}
              <td className="bg-primary-container text-on-primary-container p-3 text-right font-bold">
                {grid.grandTotal}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
