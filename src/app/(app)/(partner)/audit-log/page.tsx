import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { prisma } from "../../../../server/prisma";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { listAuditLog, listAuditActors } from "../../../../server/queries/audit-log";
import { formatKarachiTimestamp } from "../../../../lib/domain/calendar-date";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../../components/ui/Table";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { AuditLogFilters } from "../../../../components/filters/AuditLogFilters";

const ENTITY_TYPE_OPTIONS = [
  "daily_expense",
  "monthly_expense",
  "party_income",
  "counter_income",
  "asset",
  "capital_contribution",
  "app_setting",
  "user",
  "account",
  "auth",
];

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  ARCHIVE: "Archived",
};

/** FR-AUD-04: read-only, filterable audit log with keyset (never OFFSET) pagination — one "Next Page" link per page, carrying the previous page's last row id forward as `cursor`. */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    actorUserId?: string;
    entityType?: string;
    entityId?: string;
    from?: string;
    to?: string;
    cursor?: string;
  }>;
}) {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "audit-log:view");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const params = await searchParams;
  const filter = {
    actorUserId: params.actorUserId || undefined,
    entityType: params.entityType || undefined,
    entityId: params.entityId || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
    cursor: params.cursor || undefined,
  };

  const [{ items, nextCursor }, actors] = await Promise.all([
    listAuditLog(prisma, user, filter),
    listAuditActors(prisma, user),
  ]);

  function nextPageHref(cursor: string) {
    const query = new URLSearchParams();
    if (filter.actorUserId) query.set("actorUserId", filter.actorUserId);
    if (filter.entityType) query.set("entityType", filter.entityType);
    if (filter.entityId) query.set("entityId", filter.entityId);
    if (filter.from) query.set("from", filter.from);
    if (filter.to) query.set("to", filter.to);
    query.set("cursor", cursor);
    return `/audit-log?${query.toString()}`;
  }

  return (
    <div>
      <h1 className="text-display-lg text-on-background mb-1 font-bold">Audit Log</h1>
      <p className="text-on-surface-variant mb-6 text-sm">
        Every creation, change, and archiving of a financial or master-data record — read-only,
        never editable (FR-AUD-01 to 04).
      </p>

      <AuditLogFilters
        currentParams={params}
        actorUserId={filter.actorUserId ?? ""}
        entityType={filter.entityType ?? ""}
        from={filter.from ?? ""}
        to={filter.to ?? ""}
        actors={actors}
        entityTypeOptions={ENTITY_TYPE_OPTIONS}
      />

      <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-sm">
        {items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No audit entries match these filters"
              description="Try widening the date range or clearing a filter."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Date/Time (PKT)</Th>
                    <Th>User</Th>
                    <Th>Action</Th>
                    <Th>Record Type</Th>
                    <Th>Record ID</Th>
                    <Th>Older Than 1 Month</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {items.map((item) => (
                    <Tr key={item.id}>
                      <Td className="whitespace-nowrap">
                        {formatKarachiTimestamp(new Date(item.capturedAt))}
                      </Td>
                      <Td>{item.actorName ?? "System / Unknown"}</Td>
                      <Td>{ACTION_LABELS[item.action] ?? item.action}</Td>
                      <Td>{item.entityType.replace(/_/g, " ")}</Td>
                      <Td className="font-mono text-xs">{item.entityId}</Td>
                      <Td>
                        {item.isEntryOverOneMonthOld
                          ? "Yes"
                          : item.isEntryOverOneMonthOld === false
                            ? "No"
                            : "—"}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
            <div className="border-outline-variant bg-surface-container-lowest flex items-center justify-between border-t p-4">
              <span className="text-on-surface-variant text-sm">{items.length} entries shown</span>
              {nextCursor ? (
                <a
                  href={nextPageHref(nextCursor)}
                  className="border-outline-variant text-on-surface hover:bg-surface-container flex h-11 items-center rounded-lg border px-4 text-sm font-medium"
                >
                  Next Page →
                </a>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
