"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { configurePartnerMappingAction } from "../../server/actions/app-settings";

export interface MappingPartnerOption {
  id: string;
  fullName: string;
}

/**
 * FR-RES-08's approved narrow Admin-only initial-setup action — shown only
 * while the profit split's Partner A/B mapping is unconfigured. Write-once:
 * the server action itself refuses a second call, so this panel simply
 * disappears once configured (no edit mode here; re-mapping is Phase 7
 * settings-screen scope).
 */
export function PartnerMappingSetupPanel({ partners }: { partners: MappingPartnerOption[] }) {
  const router = useRouter();
  const [partnerAUserId, setPartnerAUserId] = useState(() => partners[0]?.id ?? "");
  const [partnerBUserId, setPartnerBUserId] = useState(() => partners[1]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await configurePartnerMappingAction({ partnerAUserId, partnerBUserId });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (partners.length < 2) {
    return (
      <Card className="border-error p-4">
        <p className="text-error text-sm">
          At least two Partner accounts are required before the profit split can be configured.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h2 className="text-on-surface mb-2 text-lg font-semibold">
        Configure Profit Split Partners
      </h2>
      <p className="text-on-surface-variant mb-4 text-sm">
        Admin-only, one-time setup. Choose which account is Partner A and which is Partner B — this
        cannot be changed here once saved.
      </p>
      <form
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="flex-1">
          <Select
            id="partner-a"
            label="Partner A"
            value={partnerAUserId}
            onChange={(event) => setPartnerAUserId(event.target.value)}
          >
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex-1">
          <Select
            id="partner-b"
            label="Partner B"
            value={partnerBUserId}
            onChange={(event) => setPartnerBUserId(event.target.value)}
          >
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save Mapping"}
        </Button>
      </form>
      {error ? <p className="text-error mt-3 text-sm">{error}</p> : null}
    </Card>
  );
}
