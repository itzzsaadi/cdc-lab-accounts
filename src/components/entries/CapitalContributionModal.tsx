"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/TextInput";
import { Select } from "../ui/Select";
import { Textarea } from "../ui/Textarea";
import { todayInKarachi } from "../../lib/domain/calendar-date";
import { createCapitalContributionAction } from "../../server/actions/capital-contributions";

export interface InvestmentPartnerOption {
  id: string;
  fullName: string;
}

/** FR-INV-03/04: a Capital Contribution and a Drawing are the same form, distinguished only by `contributionType` — amount is always entered as a positive figure; `DRAWING` is what makes it subtract from the partner's investment total, never a minus sign typed by the user. No `client_uuid` (ADR-0002 decision 7) — the submit button disables while pending. */
export function CapitalContributionModal({ partners }: { partners: InvestmentPartnerOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [partnerUserId, setPartnerUserId] = useState(() => partners[0]?.id ?? "");
  const [entryDate, setEntryDate] = useState(() => todayInKarachi());
  const [amount, setAmount] = useState("");
  const [contributionType, setContributionType] = useState<"INITIAL" | "INJECTION" | "DRAWING">(
    "INJECTION",
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setPartnerUserId(partners[0]?.id ?? "");
    setEntryDate(todayInKarachi());
    setAmount("");
    setContributionType("INJECTION");
    setNote("");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await createCapitalContributionAction({
      partnerUserId,
      entryDate,
      amount,
      contributionType,
      note: note || undefined,
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    resetForm();
    router.refresh();
  }

  if (partners.length === 0) {
    return null;
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <span className="material-symbols-outlined text-[20px]">handshake</span>
        Add Capital / Withdrawal
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Capital Contribution or Withdrawal">
        <form className="flex flex-col gap-5" onSubmit={(event) => void handleSubmit(event)}>
          <Select
            id="capital-partner"
            label="Partner"
            value={partnerUserId}
            onChange={(event) => setPartnerUserId(event.target.value)}
          >
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </Select>
          <Select
            id="capital-type"
            label="Type"
            value={contributionType}
            onChange={(event) => setContributionType(event.target.value as typeof contributionType)}
          >
            <option value="INJECTION">Capital Injection</option>
            <option value="INITIAL">Initial Contribution</option>
            <option value="DRAWING">Withdrawal (Drawing)</option>
          </Select>
          <TextInput
            id="capital-date"
            label="Date"
            type="date"
            value={entryDate}
            onChange={(event) => setEntryDate(event.target.value)}
            required
          />
          <TextInput
            id="capital-amount"
            label="Amount (PKR)"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            required
          />
          <Textarea
            id="capital-note"
            label="Note (optional)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
          />
          {error ? <p className="text-error text-sm">{error}</p> : null}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
