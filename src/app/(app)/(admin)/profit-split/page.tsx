import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../server/session";
import { requirePermission, PermissionDeniedError } from "../../../../lib/permissions/guard";
import { prisma } from "../../../../server/prisma";
import { getProfitSplitConfig } from "../../../../server/queries/app-settings";
import { AdministrationTabs } from "../../../../components/admin/AdministrationTabs";
import { ProfitSplitForm } from "../../../../components/admin/ProfitSplitForm";

/** FR-MST-06. */
export default async function ProfitSplitPage() {
  const user = await getAuthenticatedUser(await nextHeaders());
  try {
    requirePermission(user, "profit-split:manage");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      redirect(user ? "/forbidden" : "/sign-in");
    }
    throw error;
  }

  const config = await getProfitSplitConfig(prisma);

  return (
    <div>
      <h1 className="text-on-surface mb-1 text-2xl font-semibold">Administration Area</h1>
      <p className="text-on-surface-variant mb-4 text-sm">
        Manage system settings, users, and data imports.
      </p>
      <AdministrationTabs active="/profit-split" />
      <ProfitSplitForm
        partnerAName={config.partnerAName}
        partnerBName={config.partnerBName}
        splitAPercent={config.splitAPercent}
        splitBPercent={config.splitBPercent}
        isConfigured={config.isConfigured}
      />
    </div>
  );
}
