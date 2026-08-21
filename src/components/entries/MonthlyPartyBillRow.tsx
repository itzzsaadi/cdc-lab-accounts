"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/Button";
import { generateClientUuid } from "../../lib/client-uuid";
import {
  createMonthlyPartyBillAction,
  updateMonthlyPartyBillAction,
  archiveMonthlyPartyBillAction,
} from "../../server/actions/party-income";

export interface MonthlyPartyBillRowData {
  partyId: string;
  partyName: string;
  periodMonth: string;
  existing: { id: string; amount: string; updatedAt: string } | null;
}

/** FR-PINC-03 (Partner-only, UC-07): one figure per monthly-billing party per month. Editing an existing bill is an ordinary stale-write-protected update; entering a figure where none exists yet is a `client_uuid`-idempotent create — same protocol as every other Phase 3B/4 entry. */
export function MonthlyPartyBillRow({ row }: { row: MonthlyPartyBillRowData }) {
  const router = useRouter();
  const [amount, setAmount] = useState(row.existing?.amount ?? "");
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const clientUuidRef = useRef<string | null>(null);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    setStale(false);

    if (row.existing) {
      const result = await updateMonthlyPartyBillAction({
        id: row.existing.id,
        expectedUpdatedAt: row.existing.updatedAt,
        amount,
      });
      setSubmitting(false);
      if (!result.ok) {
        setError(result.error);
        setStale(true);
        return;
      }
      router.refresh();
      return;
    }

    clientUuidRef.current ??= generateClientUuid();
    const result = await createMonthlyPartyBillAction({
      clientUuid: clientUuidRef.current,
      partyId: row.partyId,
      periodMonth: row.periodMonth,
      amount,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleClear() {
    if (!row.existing) return;
    setSubmitting(true);
    setError(null);
    const result = await archiveMonthlyPartyBillAction({
      id: row.existing.id,
      expectedUpdatedAt: row.existing.updatedAt,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAmount("");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <input
        type="text"
        inputMode="decimal"
        aria-label={`Monthly bill for ${row.partyName}`}
        value={amount}
        onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
        placeholder="0.00"
        className="border-outline-variant bg-surface-container-lowest h-11 w-32 rounded-lg border px-3 text-right text-sm tabular-nums"
      />
      <Button
        type="button"
        variant="secondary"
        disabled={submitting || !amount}
        onClick={() => void handleSave()}
      >
        {submitting ? "Saving…" : "Save"}
      </Button>
      {row.existing ? (
        <Button
          type="button"
          variant="destructive-ghost"
          disabled={submitting}
          onClick={() => void handleClear()}
        >
          Clear
        </Button>
      ) : null}
      {error ? (
        <span className="text-error text-xs">
          {error}
          {stale ? (
            <button
              type="button"
              className="text-primary ml-1 underline"
              onClick={() => router.refresh()}
            >
              Reload
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
