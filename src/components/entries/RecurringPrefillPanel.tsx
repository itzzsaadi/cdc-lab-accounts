"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/TextInput";
import {
  previewRecurringPrefillAction,
  applyRecurringPrefillAction,
} from "../../server/actions/monthly-expenses";

interface PrefillLine {
  categoryId: string;
  categoryName: string;
  vendorId: string | null;
  description: string | null;
  amount: string;
  fundingSource: "BUSINESS" | "PARTNER";
  fundedByUserId: string | null;
}

/** FR-MEXP-06 (Should): recurring categories missing this month, pre-filled from their most recent prior row, editable, nothing saves until explicitly confirmed. */
export function RecurringPrefillPanel({ periodMonth }: { periodMonth: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<PrefillLine[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function openPreview() {
    setOpen(true);
    setLoading(true);
    setResult(null);
    const preview = await previewRecurringPrefillAction(periodMonth);
    setLines(preview);
    setLoading(false);
  }

  function updateAmount(categoryId: string, amount: string) {
    setLines((prev) =>
      prev
        ? prev.map((line) => (line.categoryId === categoryId ? { ...line, amount } : line))
        : prev,
    );
  }

  async function confirmApply() {
    if (!lines || lines.length === 0) return;
    setSubmitting(true);
    const outcome = await applyRecurringPrefillAction({
      periodMonth,
      lines: lines.map((l) => ({
        categoryId: l.categoryId,
        vendorId: l.vendorId ?? undefined,
        description: l.description ?? undefined,
        amount: l.amount,
        fundingSource: l.fundingSource,
        fundedByUserId: l.fundedByUserId ?? undefined,
      })),
    });
    setSubmitting(false);
    if (!outcome.ok) {
      setResult(outcome.error);
      return;
    }
    setResult(`${outcome.created} recurring line(s) created.`);
    setLines([]);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => void openPreview()}>
        <span className="material-symbols-outlined text-[20px]">content_copy</span>
        Copy Recurring Lines
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Recurring Lines — ${periodMonth}`}>
        <div className="flex flex-col gap-4">
          {loading ? (
            <p className="text-on-surface-variant text-sm">Checking recurring categories…</p>
          ) : null}
          {!loading && lines && lines.length === 0 && !result ? (
            <p className="text-on-surface-variant text-sm">
              No recurring category is missing an entry this month.
            </p>
          ) : null}
          {!loading && lines && lines.length > 0
            ? lines.map((line) => (
                <div
                  key={line.categoryId}
                  className="border-outline-variant flex items-end gap-3 border-b pb-3"
                >
                  <div className="flex-1">
                    <p className="text-on-surface text-sm font-medium">{line.categoryName}</p>
                  </div>
                  <div className="w-32">
                    <TextInput
                      id={`prefill-amount-${line.categoryId}`}
                      label="Amount"
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(event) =>
                        updateAmount(line.categoryId, event.target.value.replace(/[^0-9.]/g, ""))
                      }
                    />
                  </div>
                </div>
              ))
            : null}
          {result ? <p className="text-on-surface text-sm">{result}</p> : null}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
            {lines && lines.length > 0 && !result ? (
              <Button type="button" disabled={submitting} onClick={() => void confirmApply()}>
                {submitting ? "Creating…" : `Create ${lines.length} Line(s)`}
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
  );
}
