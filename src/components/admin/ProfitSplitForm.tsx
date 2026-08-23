"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/TextInput";
import { Alert } from "../ui/Alert";
import { updateProfitSplitAction } from "../../server/actions/app-settings";

/**
 * FR-MST-06. The two percentages are the only thing this form edits — the
 * Partner A/B identity mapping itself stays exactly as
 * `configurePartnerMapping` set it (approved decision: fixed, no
 * remapping in Phase 7). The warning below is the required, plain
 * disclosure that a change here affects every period's *live* calculation
 * immediately, past and present — nothing is ever stored per-period
 * (DR-09), so there is no "future periods only" behavior to describe.
 */
export function ProfitSplitForm({
  partnerAName,
  partnerBName,
  splitAPercent,
  splitBPercent,
  isConfigured,
}: {
  partnerAName: string | null;
  partnerBName: string | null;
  splitAPercent: string;
  splitBPercent: string;
  isConfigured: boolean;
}) {
  const router = useRouter();
  const [splitA, setSplitA] = useState(splitAPercent);
  const [splitB, setSplitB] = useState(splitBPercent);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    const result = await updateProfitSplitAction({ splitAPercent: splitA, splitBPercent: splitB });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    router.refresh();
  }

  if (!isConfigured) {
    return (
      <Card className="p-4">
        <h2 className="text-on-surface mb-2 text-lg font-semibold">Profit Split</h2>
        <p className="text-on-surface-variant text-sm">
          Configure the Partner A/B mapping first (see the Monthly Summary screen) before the split
          percentages can be edited here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h2 className="text-on-surface mb-2 text-lg font-semibold">Profit Split</h2>
      <Alert variant="warning">
        Changing these percentages changes the split shown for every period — including months
        already reported — the next time each is viewed. Nothing is ever stored per-period; every
        result is calculated live from the current setting.
      </Alert>
      {error ? <Alert variant="warning">{error}</Alert> : null}
      {success ? <Alert variant="info">Profit split updated.</Alert> : null}
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4 sm:max-w-sm">
        <TextInput
          id="split-a-percent"
          label={`${partnerAName ?? "Partner A"} (%)`}
          value={splitA}
          onChange={(e) => setSplitA(e.target.value)}
          required
        />
        <TextInput
          id="split-b-percent"
          label={`${partnerBName ?? "Partner B"} (%)`}
          value={splitB}
          onChange={(e) => setSplitB(e.target.value)}
          required
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save Split"}
        </Button>
      </form>
    </Card>
  );
}
