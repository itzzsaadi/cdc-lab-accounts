import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { prisma } from "../../../../server/prisma";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import {
  listAssets,
  listActivePurchasingCategories,
  listActivePartnersForAsset,
  listActiveVendorsForAsset,
} from "../../../../server/queries/assets";
import { formatMoney } from "../../../../lib/domain/money-format";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../../components/ui/Table";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Badge } from "../../../../components/ui/Badge";
import { AssetDrawer } from "../../../../components/entries/AssetDrawer";
import { AssetRowActions } from "../../../../components/entries/AssetRowActions";

/** FR-AST-01 to 10, DR-08. The register starts empty (FR-AST-01) — no seed/demo rows. */
export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "asset:manage");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const params = await searchParams;
  const filter = {
    classification: params.classification as "FIXED" | "MOVABLE" | undefined,
    acquisitionMode: params.acquisitionMode as "INSTALMENT" | "CASH" | undefined,
    status: (params.status as "ACTIVE" | "ARCHIVED" | undefined) ?? "ACTIVE",
  };

  const [{ items, purchasePriceTotal }, purchasingCategories, vendors, partners] =
    await Promise.all([
      listAssets(prisma, user, filter),
      listActivePurchasingCategories(prisma),
      listActiveVendorsForAsset(prisma),
      listActivePartnersForAsset(prisma),
    ]);

  const categoryOptions = purchasingCategories.map((c) => ({ id: c.id, name: c.name }));
  const vendorOptions = vendors.map((v) => ({ id: v.id, name: v.name }));
  const partnerOptions = partners.map((p) => ({ id: p.id, fullName: p.fullName }));

  return (
    <div>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-display-lg text-on-background font-bold">Asset Register</h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            Fixed and movable equipment — Instalment or Cash, never both.
          </p>
        </div>
        <AssetDrawer
          purchasingCategories={categoryOptions}
          vendors={vendorOptions}
          partners={partnerOptions}
        />
      </div>

      <form
        action="/assets"
        className="border-outline-variant bg-surface-container-lowest mb-6 flex flex-wrap items-end gap-4 rounded-xl border p-4 shadow-sm"
      >
        <div className="flex flex-col gap-2">
          <label
            htmlFor="filter-status"
            className="text-on-surface-variant text-xs font-medium uppercase"
          >
            Status
          </label>
          <select
            id="filter-status"
            name="status"
            defaultValue={filter.status}
            className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
          >
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor="filter-classification"
            className="text-on-surface-variant text-xs font-medium uppercase"
          >
            Classification
          </label>
          <select
            id="filter-classification"
            name="classification"
            defaultValue={filter.classification ?? ""}
            className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
          >
            <option value="">All</option>
            <option value="FIXED">Fixed</option>
            <option value="MOVABLE">Movable</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor="filter-mode"
            className="text-on-surface-variant text-xs font-medium uppercase"
          >
            Acquisition Mode
          </label>
          <select
            id="filter-mode"
            name="acquisitionMode"
            defaultValue={filter.acquisitionMode ?? ""}
            className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg border px-3 text-sm"
          >
            <option value="">All</option>
            <option value="INSTALMENT">Instalment</option>
            <option value="CASH">Cash</option>
          </select>
        </div>
        <button
          type="submit"
          className="bg-primary text-on-primary hover:bg-primary-container h-11 rounded-lg px-4 text-sm font-medium transition-colors"
        >
          Apply Filters
        </button>
      </form>

      <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-sm">
        {items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No assets recorded"
              description="Use Add Asset to record the first one."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Classification</Th>
                  <Th>Mode</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Detail</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {items.map((asset) => (
                  <Tr key={asset.id}>
                    <Td className="font-medium">
                      {asset.name}
                      {asset.status === "ARCHIVED" ? (
                        <span className="text-on-surface-variant ml-1 text-xs">(archived)</span>
                      ) : null}
                    </Td>
                    <Td>{asset.classification === "FIXED" ? "Fixed" : "Movable"}</Td>
                    <Td>
                      <Badge
                        dotColor={asset.acquisitionMode === "INSTALMENT" ? "#f59e0b" : "#005c55"}
                      >
                        {asset.acquisitionMode === "INSTALMENT" ? "Instalment" : "Cash"}
                      </Badge>
                    </Td>
                    <Td className="tabular-nums text-right">
                      {formatMoney(
                        asset.acquisitionMode === "INSTALMENT"
                          ? asset.monthlyInstalment!
                          : asset.purchasePrice!,
                      )}
                      {asset.acquisitionMode === "INSTALMENT" ? "/mo" : ""}
                    </Td>
                    <Td>
                      {asset.acquisitionMode === "INSTALMENT"
                        ? `Category: ${asset.defaultCategory?.name ?? "Unknown"}`
                        : `Partner: ${asset.purchasedBy?.fullName ?? "Unknown"}`}
                    </Td>
                    <Td className="text-right">
                      <AssetRowActions
                        asset={{
                          id: asset.id,
                          name: asset.name,
                          classification: asset.classification,
                          vendorId: asset.vendorId,
                          acquiredOn: asset.acquiredOn
                            ? asset.acquiredOn.toISOString().slice(0, 10)
                            : null,
                          acquisitionMode: asset.acquisitionMode,
                          monthlyInstalment: asset.monthlyInstalment
                            ? asset.monthlyInstalment.toString()
                            : null,
                          defaultCategoryId: asset.defaultCategoryId,
                          purchasePrice: asset.purchasePrice
                            ? asset.purchasePrice.toString()
                            : null,
                          purchasedByUserId: asset.purchasedByUserId,
                          updatedAt: asset.updatedAt.toISOString(),
                          status: asset.status,
                          displayLabel: `${asset.name} (${asset.acquisitionMode === "INSTALMENT" ? "Instalment" : "Cash"})`,
                        }}
                        purchasingCategories={categoryOptions}
                        vendors={vendorOptions}
                        partners={partnerOptions}
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        )}
        <div className="border-outline-variant bg-surface-container-lowest flex items-center justify-between border-t p-4">
          <span className="text-on-surface-variant text-sm">
            {items.length} {items.length === 1 ? "asset" : "assets"}
          </span>
          <span className="tabular-nums text-on-surface font-semibold">
            Cash Purchase Total: {formatMoney(purchasePriceTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
