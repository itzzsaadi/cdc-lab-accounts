"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/TextInput";
import { Textarea } from "../ui/Textarea";
import { generateClientUuid } from "../../lib/client-uuid";
import { todayInKarachi } from "../../lib/domain/calendar-date";
import { formatMoney } from "../../lib/domain/money-format";
import { createCounterIncomeAction } from "../../server/actions/counter-income";

/**
 * FR-CINC-01/04 — the two-step, non-blocking duplicate-confirmation flow.
 * A first submission that collides with an existing entry for that date
 * shows a warning banner with the existing amount and a "Record anyway"
 * button, never a hard rejection; nothing is created until that second
 * confirmation. `clientUuid` stays stable across both submissions of the
 * same attempt, so the confirmed submission is a genuine continuation, not
 * a fresh create.
 */
export function CounterIncomeForm() {
  const router = useRouter();
  const [incomeDate, setIncomeDate] = useState(() => todayInKarachi());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const clientUuidRef = useRef<string | null>(null);

  function resetForm() {
    setIncomeDate(todayInKarachi());
    setAmount("");
    setNote("");
    setError(null);
    setDuplicateWarning(null);
    clientUuidRef.current = null;
  }

  async function submit(confirmedDuplicate: boolean) {
    clientUuidRef.current ??= generateClientUuid();
    setSubmitting(true);
    setError(null);

    const result = await createCounterIncomeAction({
      clientUuid: clientUuidRef.current,
      incomeDate,
      amount,
      note: note || undefined,
      confirmedDuplicate,
    });

    setSubmitting(false);
    if (!result.ok) {
      if ("requiresConfirmation" in result) {
        setDuplicateWarning(
          `An entry already exists for ${incomeDate} (${formatMoney(result.existingAmount)}). Record this as an additional entry for the same day?`,
        );
        return;
      }
      setError(result.error);
      return;
    }
    resetForm();
    router.refresh();
  }

  return (
    <div className="border-outline-variant bg-surface-container-lowest rounded-xl border p-5 shadow-sm">
      <h2 className="text-on-surface mb-4 text-lg font-semibold">Add Counter Income</h2>
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
      >
        <TextInput
          id="counter-income-date"
          label="Date"
          type="date"
          value={incomeDate}
          onChange={(event) => {
            setIncomeDate(event.target.value);
            setDuplicateWarning(null);
          }}
          required
        />
        <TextInput
          id="counter-income-amount"
          label="Amount (PKR)"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          required
        />
        <Textarea
          id="counter-income-note"
          label="Note (optional)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
        />
        {duplicateWarning ? (
          <div className="border-tertiary bg-tertiary-container/10 flex flex-col gap-3 rounded-lg border p-3">
            <p className="text-on-surface text-sm">{duplicateWarning}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDuplicateWarning(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void submit(true)} disabled={submitting}>
                Record Anyway
              </Button>
            </div>
          </div>
        ) : null}
        {error ? <p className="text-error text-sm">{error}</p> : null}
        {!duplicateWarning ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save Counter Income"}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
