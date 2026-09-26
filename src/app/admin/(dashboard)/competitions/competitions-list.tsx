"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

type Competition = {
  id: string;
  name: string;
  status: "draft" | "active" | "closed";
  entryFee: string;
  currency: string;
  startDate: string;
  endDate: string;
  entrantCount: number;
  entrantCap: number | null;
  legalSignOffConfirmed: boolean;
};

type PrizeRow = { rank: number; type: "cash" | "funded_account" | "free_challenge" | "discount"; description: string; cashValue: string };

const STATUS_TONE: Record<Competition["status"], "success" | "neutral" | "danger"> = {
  draft: "neutral",
  active: "success",
  closed: "danger",
};

function money(value: string, currency: string) {
  const n = Number(value);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function NewCompetitionForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [entryFee, setEntryFee] = useState("0");
  const [entrantCap, setEntrantCap] = useState("");
  const [demoAccountSize, setDemoAccountSize] = useState("10000");
  const [minTradesToQualify, setMinTradesToQualify] = useState("5");
  const [rankingMetric, setRankingMetric] = useState<"return_pct" | "absolute_pnl">("return_pct");
  const [tieBreakerRule, setTieBreakerRule] = useState("");
  const [prizes, setPrizes] = useState<PrizeRow[]>([
    { rank: 1, type: "cash", description: "First place", cashValue: "500" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updatePrize(i: number, patch: Partial<PrizeRow>) {
    setPrizes((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addPrize() {
    setPrizes((rows) => [...rows, { rank: rows.length + 1, type: "cash", description: "", cashValue: "" }]);
  }
  function removePrize(i: number) {
    setPrizes((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/competitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          entryFee: Number(entryFee),
          currency: "EUR",
          entrantCap: entrantCap ? Number(entrantCap) : null,
          demoAccountSize: Number(demoAccountSize),
          minTradesToQualify: Number(minTradesToQualify),
          rankingMetric,
          tieBreakerRule,
          prizeLadder: prizes.map((p) => ({
            rank: p.rank,
            type: p.type,
            description: p.description,
            cashValue: p.type === "cash" && p.cashValue ? Number(p.cashValue) : undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create competition.");
        return;
      }
      router.refresh();
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-display text-sm font-semibold">New competition</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="September Sprint" />
        </Field>
        <Field label="Entry fee (EUR)" hint="0 for free entry — the safer structure per spec §7.4">
          <Input type="number" value={entryFee} onChange={(e) => setEntryFee(e.target.value)} />
        </Field>
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="End date">
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field label="Demo account size (EUR)">
          <Input type="number" value={demoAccountSize} onChange={(e) => setDemoAccountSize(e.target.value)} />
        </Field>
        <Field label="Entrant cap" hint="Leave blank for unlimited">
          <Input type="number" value={entrantCap} onChange={(e) => setEntrantCap(e.target.value)} />
        </Field>
        <Field label="Minimum trades to qualify" hint="Anti-lottery control — spec §7.2">
          <Input type="number" value={minTradesToQualify} onChange={(e) => setMinTradesToQualify(e.target.value)} />
        </Field>
        <Field label="Ranking metric">
          <Select value={rankingMetric} onChange={(e) => setRankingMetric(e.target.value as "return_pct" | "absolute_pnl")}>
            <option value="return_pct">Return %</option>
            <option value="absolute_pnl">Absolute P&amp;L</option>
          </Select>
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Tie-breaker rule" hint="Required before launch — spec §7.2. E.g. &quot;earliest to reach the return&quot;">
          <Input value={tieBreakerRule} onChange={(e) => setTieBreakerRule(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium tracking-wide text-sub uppercase">Prize ladder</p>
        <div className="flex flex-col gap-2">
          {prizes.map((p, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-2">
                <Field label="Rank">
                  <Input type="number" value={p.rank} onChange={(e) => updatePrize(i, { rank: Number(e.target.value) })} />
                </Field>
              </div>
              <div className="col-span-3">
                <Field label="Type">
                  <Select value={p.type} onChange={(e) => updatePrize(i, { type: e.target.value as PrizeRow["type"] })}>
                    <option value="cash">Cash</option>
                    <option value="funded_account">Funded account</option>
                    <option value="free_challenge">Free challenge</option>
                    <option value="discount">Discount</option>
                  </Select>
                </Field>
              </div>
              <div className="col-span-4">
                <Field label="Description">
                  <Input value={p.description} onChange={(e) => updatePrize(i, { description: e.target.value })} />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Cash value">
                  <Input
                    type="number"
                    disabled={p.type !== "cash"}
                    value={p.cashValue}
                    onChange={(e) => updatePrize(i, { cashValue: e.target.value })}
                  />
                </Field>
              </div>
              <div className="col-span-1">
                <Button variant="ghost" onClick={() => removePrize(i)}>
                  ×
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button variant="ghost" className="mt-2" onClick={addPrize}>
          Add prize
        </Button>
      </div>

      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button onClick={submit} disabled={!name || !tieBreakerRule || saving}>
          {saving ? "Creating…" : "Create competition"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export default function CompetitionsList({ competitions }: { competitions: Competition[] }) {
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {!showNew && (
        <Button onClick={() => setShowNew(true)} className="w-fit">
          New competition
        </Button>
      )}
      {showNew && <NewCompetitionForm onDone={() => setShowNew(false)} />}

      {competitions.length === 0 ? (
        <Card className="p-6 text-sm text-sub">No competitions yet.</Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {competitions.map((c) => (
            <Link
              key={c.id}
              href={`/admin/competitions/${c.id}`}
              className="flex items-center justify-between border-b border-bd px-4 py-3 text-sm last:border-b-0 hover:bg-raise"
            >
              <div>
                <p>{c.name}</p>
                <p className="text-xs text-sub">
                  {money(c.entryFee, c.currency)} entry ·{" "}
                  {c.entrantCount}
                  {c.entrantCap ? ` / ${c.entrantCap}` : ""} entrants
                  {Number(c.entryFee) > 0 && !c.legalSignOffConfirmed ? " · legal sign-off needed" : ""}
                </p>
              </div>
              <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
