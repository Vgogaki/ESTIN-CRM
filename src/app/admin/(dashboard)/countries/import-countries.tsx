"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type Action = "allowed" | "review" | "blocked";
type Change = {
  countryCode: string;
  row: number;
  isNew: boolean;
  before: { registration: Action; purchase: Action; trading: Action; payout: Action } | null;
  after: { registration: Action; purchase: Action; trading: Action; payout: Action; note: string | null };
};
type CsvError = { row: number; message: string };
type Preview = { fatalError: string | null; changes: Change[]; errors: CsvError[] };

const TEMPLATE = "country,registration,purchase,trading,payout,note\nCY,review,review,allowed,review,Example — replace with a real reason\n";

function downloadTemplate() {
  const blob = new Blob([TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "estin-country-list-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

const actionTone = (a: Action) => (a === "blocked" ? "danger" : a === "review" ? "warning" : "success");

function Diff({ label, before, after }: { label: string; before?: Action; after: Action }) {
  const changed = before !== undefined && before !== after;
  return (
    <span className="mr-3 inline-flex items-center gap-1">
      {label}:{" "}
      {changed && (
        <>
          <Badge tone={actionTone(before!)}>{before}</Badge>→
        </>
      )}
      <Badge tone={actionTone(after)}>{after}</Badge>
    </span>
  );
}

export default function ImportCountries() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null);

  function reset() {
    setPreview(null);
    setApplied(null);
    setError(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFileChosen() {
    const file = fileRef.current?.files?.[0];
    setError(null);
    setApplied(null);
    setPreview(null);
    if (!file) return;
    setFileName(file.name);
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/admin/countries/import/preview", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't read that file.");
        return;
      }
      setPreview(data);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/admin/countries/import/apply", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to apply.");
        return;
      }
      setApplied(data.applied);
      setPreview(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold">Upload a country list</h2>
        <Button variant="ghost" onClick={downloadTemplate}>
          Download CSV template
        </Button>
      </div>
      <p className="mt-1 text-xs text-sub">
        A CSV file (from Excel: File → Save As → CSV) with columns <code>country, registration, purchase, trading,
        payout, note</code>. Each value is <code>allowed</code>, <code>review</code> or <code>blocked</code> — leave
        blank for allowed. This only adds or updates the countries in the file; nothing already on the list is ever
        removed by uploading.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFileChosen} className="text-xs text-sub" />
        {fileName && (
          <Button variant="ghost" onClick={reset}>
            Clear
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {applied !== null && (
        <div className="mt-3">
          <Alert tone="success">Applied — {applied} {applied === 1 ? "country" : "countries"} added or updated.</Alert>
        </div>
      )}

      {preview?.fatalError && (
        <div className="mt-3">
          <Alert tone="danger">{preview.fatalError}</Alert>
        </div>
      )}

      {preview && !preview.fatalError && (
        <div className="mt-3 flex flex-col gap-3">
          {preview.errors.length > 0 && (
            <Alert tone="warning">
              {preview.errors.length} row(s) will be skipped:
              <ul className="mt-1 list-disc pl-5">
                {preview.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {preview.changes.length === 0 ? (
            <p className="text-sm text-sub">Nothing valid to apply from this file.</p>
          ) : (
            <>
              <Card className="max-h-80 overflow-y-auto p-0">
                {preview.changes.map((c) => (
                  <div key={c.countryCode} className="flex items-start justify-between gap-3 border-b border-bd px-4 py-2.5 text-xs last:border-b-0">
                    <div>
                      <span className="font-mono text-sm">{c.countryCode}</span>{" "}
                      {c.isNew ? <Badge tone="accent">new</Badge> : <Badge tone="neutral">update</Badge>}
                      {c.after.note && <p className="mt-1 text-sub">{c.after.note}</p>}
                    </div>
                    <div className="text-right">
                      <Diff label="reg" before={c.before?.registration} after={c.after.registration} />
                      <Diff label="purchase" before={c.before?.purchase} after={c.after.purchase} />
                      <Diff label="trading" before={c.before?.trading} after={c.after.trading} />
                      <Diff label="payout" before={c.before?.payout} after={c.after.payout} />
                    </div>
                  </div>
                ))}
              </Card>
              <div>
                <Button disabled={busy} onClick={apply}>
                  Apply {preview.changes.length} {preview.changes.length === 1 ? "change" : "changes"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
