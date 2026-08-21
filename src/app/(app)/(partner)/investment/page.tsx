import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { prisma } from "../../../../server/prisma";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import {
  getPartnerInvestmentStatements,
  listActivePartners,
} from "../../../../server/queries/capital-contributions";
import { formatMoney } from "../../../../lib/domain/money-format";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../../components/ui/Table";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Card } from "../../../../components/ui/Card";
import { CapitalContributionModal } from "../../../../components/entries/CapitalContributionModal";

/** FR-INV-01 to 07. Investment figures are Partner/Admin-only (FR-INV-07) — enforced by `requirePermission` below, never by hiding the link alone. Never affects the profit split (FR-INV-06) — this screen reads only `partnerInvestmentTotal`/contribution data, never a split setting. */
export default async function InvestmentPage() {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "investment:view");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const [statements, partners] = await Promise.all([
    getPartnerInvestmentStatements(prisma, user),
    listActivePartners(prisma),
  ]);

  return (
    <div>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-display-lg text-on-background font-bold">Partner Investment</h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            Running totals — recorded for transparency only, never affecting the profit split.
          </p>
        </div>
        <CapitalContributionModal
          partners={partners.map((p) => ({ id: p.id, fullName: p.fullName }))}
        />
      </div>

      {statements.length === 0 ? (
        <EmptyState
          title="No partners recorded yet"
          description="Investment statements will appear once a partner account exists."
        />
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {statements.map((statement) => (
            <Card key={statement.partnerId} className="p-4">
              <p className="text-on-surface-variant text-xs font-medium uppercase">
                {statement.fullName}
              </p>
              <p className="tabular-nums text-on-surface mt-1 text-2xl font-bold">
                {formatMoney(statement.total)}
              </p>
            </Card>
          ))}
        </div>
      )}

      {statements.map((statement) => (
        <div
          key={statement.partnerId}
          className="border-outline-variant bg-surface-container-lowest mb-6 overflow-hidden rounded-xl border shadow-sm"
        >
          <h2 className="text-on-surface border-outline-variant border-b p-4 text-lg font-semibold">
            {statement.fullName} — Detailed Statement
          </h2>
          {statement.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No activity yet"
                description="Contributions, drawings, partner-funded expenses, and cash assets will appear here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Date</Th>
                    <Th>Type</Th>
                    <Th>Description</Th>
                    <Th className="text-right">Amount</Th>
                    <Th className="text-right">Running Balance</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {statement.items.map((item, index) => (
                    <Tr key={`${statement.partnerId}-${index}`}>
                      <Td className="whitespace-nowrap">{item.date}</Td>
                      <Td>
                        {item.type === "DRAWING" ? (
                          <span className="text-error font-medium">Withdrawal</span>
                        ) : (
                          item.type.replace("_", " ")
                        )}
                      </Td>
                      <Td>{item.description}</Td>
                      <Td className="tabular-nums text-right">
                        {item.type === "DRAWING" ? "-" : ""}
                        {formatMoney(item.amount)}
                      </Td>
                      <Td className="tabular-nums text-right">
                        {formatMoney(item.runningBalance)}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
