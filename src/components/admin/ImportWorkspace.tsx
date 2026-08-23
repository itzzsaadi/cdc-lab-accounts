"use client";

import { useState } from "react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";

interface PreviewIssue {
  sheet: string;
  row: number;
  message: string;
}
interface PreviewResponse {
  ok: true;
  importSessionId: string;
  totalRows: number;
  issues: PreviewIssue[];
  valid: boolean;
  repeatedFileWarning?: { previousBatchId: string; committedAt: string };
}

/**
 * FR-IMP-01/02/03. Two round trips, never one — preview only ever
 * validates (nothing is written to a business table); commit takes only
 * the opaque `importSessionId` this component received from preview, never
 * anything parsed client-side. See src/server/import/{preview,commit}.ts
 * for the server-side security design this UI is a thin front for.
 */
export function ImportWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [committed, setCommitted] = useState<{ importedRows: number } | null>(null);

  async function handlePreview() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    setCommitted(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/import/preview", { method: "POST", body: formData });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Preview failed.");
        return;
      }
      setPreview(body);
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importSessionId: preview.importSessionId }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        setError(body.error ?? "Commit failed.");
        setPreview(null); // the session is consumed either way — force a fresh preview
        return;
      }
      setCommitted({ importedRows: body.importedRows });
      setPreview(null);
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="text-on-surface mb-2 text-lg font-semibold">Historical Import</h2>
      <p className="text-on-surface-variant mb-4 text-sm">
        Upload an .xlsx workbook (Daily Expenses, Monthly Expenses, Party Income (Daily), Party
        Income (Monthly Bill), Counter Income, Capital Contributions — one sheet each). Up to 5 MB,
        5,000 rows per sheet.
      </p>

      <div className="border-outline-variant flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center">
        <input
          type="file"
          accept=".xlsx"
          aria-label="Select import file"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setCommitted(null);
            setError(null);
          }}
        />
        <Button type="button" onClick={handlePreview} disabled={!file || busy}>
          {busy ? "Working…" : "Preview"}
        </Button>
      </div>

      {error ? (
        <div className="mt-4">
          <Alert variant="warning">{error}</Alert>
        </div>
      ) : null}

      {committed ? (
        <div className="mt-4">
          <Alert variant="info">Import complete — {committed.importedRows} rows committed.</Alert>
        </div>
      ) : null}

      {preview ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-on-surface text-sm">
            {preview.totalRows} row(s) parsed. {preview.issues.length} issue(s) found.
          </p>
          {preview.repeatedFileWarning ? (
            <Alert variant="warning">
              An identical file was already imported on {preview.repeatedFileWarning.committedAt}.
              This is advisory only — duplicate rows are still checked individually.
            </Alert>
          ) : null}
          {preview.issues.length > 0 ? (
            <ul className="border-outline-variant max-h-64 overflow-y-auto rounded-lg border p-3 text-sm">
              {preview.issues.map((issue, index) => (
                <li key={index} className="text-error">
                  {issue.sheet} row {issue.row}: {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
          <Button type="button" onClick={handleCommit} disabled={!preview.valid || busy}>
            {busy ? "Committing…" : "Commit Import"}
          </Button>
          {!preview.valid ? (
            <p className="text-on-surface-variant text-xs">
              Fix the errors above and upload a corrected file — commit is disabled while any row
              fails validation.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
