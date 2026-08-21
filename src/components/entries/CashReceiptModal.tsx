"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/TextInput";
import { Select } from "../ui/Select";
import { Textarea } from "../ui/Textarea";
import { generateClientUuid } from "../../lib/client-uuid";
import { todayInKarachi } from "../../lib/domain/calendar-date";
import { formatMoney } from "../../lib/domain/money-format";
import { createCashReceiptAction } from "../../server/actions/party-income";

export interface PartyOption {
  id: string;
  name: string;
}

/** FR-PINC-06: date, amount, and a note are all required — money received outside normal billing, against any party regardless of billing mode. */
export function CashReceiptModal({ parties }: { parties: PartyOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [partyId, setPartyId] = useState(() => parties[0]?.id ?? "");
  const [incomeDate, setIncomeDate] = useState(() => todayInKarachi());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedConfirmation, setSavedConfirmation] = useState<string | null>(null);
  const clientUuidRef = useRef<string | null>(null);

  function resetForm() {
    setPartyId(parties[0]?.id ?? "");
    setIncomeDate(todayInKarachi());
    setAmount("");
    setNote("");
    setError(null);
    setSavedConfirmation(null);
    clientUuidRef.current = null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    clientUuidRef.current ??= generateClientUuid();

    const partyName = parties.find((p) => p.id === partyId)?.name ?? "the party";
    const result = await createCashReceiptAction({
      clientUuid: clientUuidRef.current,
      partyId,
      incomeDate,
      amount,
      note,
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Visible confirmation before closing (NFR-USE-04) — the caller sees
    // exactly what was saved and against whom, rather than the modal
    // simply vanishing.
    setSavedConfirmation(`${formatMoney(amount)} recorded for ${partyName}.`);
    router.refresh();
  }

  if (parties.length === 0) {
    return null;
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <span className="material-symbols-outlined text-[20px]">payments</span>
        Record Cash Receipt
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          resetForm();
        }}
        title="Record Cash Receipt"
      >
        {savedConfirmation ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <span className="material-symbols-outlined text-primary text-[40px]">check_circle</span>
            <p className="text-on-surface" role="status">
              {savedConfirmation}
            </p>
            <Button
              type="button"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
            >
              Done
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              setSubmitting(true);
              void handleSubmit(event);
            }}
          >
            <Select
              id="cash-receipt-party"
              label="Party"
              value={partyId}
              onChange={(event) => setPartyId(event.target.value)}
            >
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </Select>
            <TextInput
              id="cash-receipt-date"
              label="Date"
              type="date"
              value={incomeDate}
              onChange={(event) => setIncomeDate(event.target.value)}
              required
            />
            <TextInput
              id="cash-receipt-amount"
              label="Amount (PKR)"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              required
            />
            <Textarea
              id="cash-receipt-note"
              label="Note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What was this payment for?"
              rows={3}
              required
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
                {submitting ? "Saving…" : "Save Receipt"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
