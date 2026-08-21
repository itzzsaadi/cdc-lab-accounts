"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { formatMoney } from "../../lib/domain/money-format";
import {
  previewInstalmentLinesAction,
  generateInstalmentLinesAction,
} from "../../server/actions/monthly-expenses";

interface Candidate {
  assetId: string;
  assetName: string;
  amount: string;
  categoryName: string;
}

/**
 * FR-AST-04/05/08. Partner-triggered, previewed, explicitly confirmed —
 * never a silent background job (approved decision 3). The preview list is
 * re-derived server-side at confirm time too (`generateInstalmentLines`),
 * so a stale preview can never create a line the server no longer
 * considers a genuine candidate.
 */
export function InstalmentGenerationPanel({ periodMonth }: { periodMonth: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function openPreview() {
    setOpen(true);
    setLoading(true);
    setResult(null);
    const preview = await previewInstalmentLinesAction(periodMonth);
    setCandidates(preview);
    setLoading(false);
  }

  async function confirmGenerate() {
    setSubmitting(true);
    const outcome = await generateInstalmentLinesAction({ periodMonth });
    setSubmitting(false);
    if (!outcome.ok) {
      setResult(outcome.error);
      return;
    }
    setResult(`${outcome.created} instalment line(s) created.`);
    setCandidates([]);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => void openPreview()}>
        <span className="material-symbols-outlined text-[20px]">event_repeat</span>
        Generate Instalment Lines
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Generate Instalments — ${periodMonth}`}
      >
        <div className="flex flex-col gap-4">
          {loading ? (
            <p className="text-on-surface-variant text-sm">Checking active instalment assets…</p>
          ) : null}
          {!loading && candidates && candidates.length === 0 && !result ? (
            <p className="text-on-surface-variant text-sm">
              Every active instalment asset already has a line for this month.
            </p>
          ) : null}
          {!loading && candidates && candidates.length > 0 ? (
            <ul className="divide-outline-variant divide-y">
              {candidates.map((c) => (
                <li key={c.assetId} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="text-on-surface font-medium">{c.assetName}</p>
                    <p className="text-on-surface-variant text-xs">{c.categoryName}</p>
                  </div>
                  <span className="tabular-nums">{formatMoney(c.amount)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {result ? <p className="text-on-surface text-sm">{result}</p> : null}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
            {candidates && candidates.length > 0 && !result ? (
              <Button type="button" disabled={submitting} onClick={() => void confirmGenerate()}>
                {submitting ? "Generating…" : `Generate ${candidates.length} Line(s)`}
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
  );
}
