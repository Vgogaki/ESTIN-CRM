"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type Status = "pending" | "in_progress" | "done";
type InputRow = { key: string; label: string; source: string; covers: string; status: Status; note: string | null };

const TONE = { pending: "neutral", in_progress: "warning", done: "success" } as const;

function Row({ row }: { row: InputRow }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(row.status);
  const [note, setNote] = useState(row.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = status !== row.status || note !== (row.note ?? "");

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/countries/inputs/${row.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-bd px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{row.label}</p>
          <p className="text-xs text-sub">{row.covers}</p>
          <p className="text-xs text-sub">From: {row.source}</p>
        </div>
        <Badge tone={TONE[row.status]}>{row.status.replace("_", " ")}</Badge>
      </div>
      <div className="mt-2 grid grid-cols-[10rem_1fr_auto] items-center gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          <option value="pending">Pending</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </Select>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who confirmed it, when, and any reference" />
        <Button disabled={!dirty || busy} onClick={save}>
          Save
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export default function InputsCard({ inputs, settled }: { inputs: InputRow[]; settled: boolean }) {
  return (
    <Card>
      <div className="border-b border-bd px-4 py-3">
        <h2 className="text-sm font-semibold">Before launch: settle the country list</h2>
        <p className="text-xs text-sub">
          The list below is built from four separate inputs, each from a different source. Record each as it is
          confirmed. This tracks progress only; it doesn&apos;t change any country rule.
        </p>
      </div>
      {settled ? (
        <div className="p-3">
          <Alert tone="success">All four inputs are confirmed. The country list can be treated as settled.</Alert>
        </div>
      ) : (
        <div className="p-3">
          <Alert tone="warning">Not settled yet. Live launch requires all four to be Done.</Alert>
        </div>
      )}
      {inputs.map((r) => (
        <Row key={r.key + r.status + (r.note ?? "")} row={r} />
      ))}
    </Card>
  );
}
