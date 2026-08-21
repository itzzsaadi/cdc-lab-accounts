import Link from "next/link";
import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { prisma } from "../../../../server/prisma";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { listRecentEntries, type RecentEntry } from "../../../../server/queries/home";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../../components/ui/Table";
import { EmptyState } from "../../../../components/ui/EmptyState";

const QUICK_ACTIONS = [
  {
    href: "/daily-expenses",
    label: "Add Daily Expense",
    description: "Record operational costs",
    icon: "receipt_long",
  },
  {
    href: "/party-income",
    label: "Enter Party Income",
    description: "Daily-billing party figures",
    icon: "groups",
  },
  {
    href: "/counter-income",
    label: "Add Counter Income",
    description: "Log walk-in patient income",
    icon: "point_of_sale",
  },
  {
    href: "/party-income",
    label: "Record Cash Receipt",
    description: "Direct cash received from a party",
    icon: "payments",
  },
] as const;

const KIND_LABEL: Record<RecentEntry["kind"], string> = {
  "daily-expense": "Daily Expense",
  "party-income": "Party Income",
  "cash-receipt": "Cash Receipt",
  "counter-income": "Counter Income",
};

/**
 * Real Operator Home (Phase 3B) — replaces the Phase 2 placeholder. No
 * "Pending Uploads" tile, no per-row sync status, no invented location
 * concept: the Stitch export's demo sync/upload chrome is explicitly not
 * built here since there is no offline queue yet (mandatory safeguard #7's
 * wording correction).
 */
export default async function OperatorHomePage() {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "entry:daily-expense");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const recentEntries = await listRecentEntries(prisma, user, 10);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-headline-sm text-on-surface mb-4 font-semibold">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="bg-surface-container-lowest hover:bg-surface-container border-outline-variant text-on-surface flex min-h-[140px] flex-col items-start gap-4 rounded-xl border p-6 shadow-sm transition-colors"
            >
              <div className="bg-secondary-container text-on-secondary-container rounded-lg p-3">
                <span className="material-symbols-outlined">{action.icon}</span>
              </div>
              <div>
                <span className="text-headline-sm mb-1 block font-semibold">{action.label}</span>
                <span className="text-on-surface-variant text-sm">{action.description}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-headline-sm text-on-surface mb-4 font-semibold">Recent Entries</h2>
        <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-sm">
          {recentEntries.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No entries recorded yet"
                description="Use one of the quick actions above to get started."
              />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Time</Th>
                  <Th>Type</Th>
                  <Th>Reference</Th>
                  <Th className="text-right">Amount (PKR)</Th>
                </Tr>
              </Thead>
              <Tbody>
                {recentEntries.map((entry) => (
                  <Tr key={`${entry.kind}-${entry.id}`}>
                    <Td className="whitespace-nowrap">
                      {new Date(entry.capturedAt).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Td>
                    <Td>{KIND_LABEL[entry.kind]}</Td>
                    <Td className="text-on-surface-variant">{entry.label}</Td>
                    <Td className="tabular-nums text-right">{entry.amount}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
