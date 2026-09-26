"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

type PrizeLadderEntry = { rank: number; type: string; description: string; cashValue?: number };
type Competition = {
  id: string;
  status: "draft" | "active" | "closed";
  entryFee: string;
  currency: string;
  demoAccountSize: string;
  minTradesToQualify: number;
  rankingMetric: "return_pct" | "absolute_pnl";
  tieBreakerRule: string;
  startDate: string;
  endDate: string;
  legalSignOffConfirmed: boolean;
  legalSignOffNote: string | null;
  prizeLadder: PrizeLadderEntry[];
};
type RankedRow = { personId: string; fullName: string; metricValue: string; rank: number };
type NotYetQualified = { entryId: string; personId: string; fullName: string; tradesCount: number };
type ActiveEntry = { entryId: string; personId: string; fullName: string; equity: string; tradesCount: number };
type DisqualifiedEntry = { entryId: string; fullName: string; reason: string | null };
type Trader = { id: string; fullName: string; email: string };

function money(value: string | number, currency: string) {
  const n = Number(value);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function StatusControls({ competition }: { competition: Competition }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function setStatus(status: "draft" | "active" | "closed") {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/competitions/${competition.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold">Status</h2>
        <Badge tone={competition.status === "active" ? "success" : competition.status === "closed" ? "danger" : "neutral"}>
          {competition.status}
        </Badge>
      </div>
      {error && (
        <div className="mt-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {competition.status !== "draft" && (
          <Button variant="ghost" disabled={saving} onClick={() => setStatus("draft")}>
            Move to draft
          </Button>
        )}
        {competition.status !== "active" && (
          <Button disabled={saving} onClick={() => setStatus("active")}>
            Activate
          </Button>
        )}
        {competition.status !== "closed" && (
          <Button variant="danger" disabled={saving} onClick={() => setStatus("closed")}>
            Close
          </Button>
        )}
      </div>
    </Card>
  );
}

function LegalSignOff({ competition }: { competition: Competition }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (Number(competition.entryFee) <= 0) return null;
  if (competition.legalSignOffConfirmed) {
    return (
      <Alert tone="success">Legal sign-off confirmed: {competition.legalSignOffNote}</Alert>
    );
  }

  async function confirm() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/competitions/${competition.id}/legal-signoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Alert tone="warning">
      <div className="flex flex-col gap-2">
        <p>
          This is a paid-entry competition ({money(competition.entryFee, competition.currency)}). Spec §7.4:
          paid-entry prize competitions can fall under gaming or lottery regulation in Cyprus. This cannot go
          active until legal sign-off is recorded here.
        </p>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who confirmed this, and when" />
        {error && <span className="text-xs text-danger">{error}</span>}
        <Button variant="ghost" className="w-fit" disabled={note.trim().length < 4 || saving} onClick={confirm}>
          Confirm legal sign-off
        </Button>
      </div>
    </Alert>
  );
}

function AddEntrant({ competitionId, availableTraders }: { competitionId: string; availableTraders: Trader[] }) {
  const router = useRouter();
  // Not defaulted once from availableTraders[0] — that prop changes after
  // every successful add (router.refresh() re-fetches it with the just-
  // entered trader removed), and a state initializer only runs on mount,
  // so a stale personId would silently resubmit the previous trader. Kept
  // empty until the admin picks, falling back live to whichever trader is
  // first in the current list.
  const [personId, setPersonId] = useState("");
  const [entryPaidAmount, setEntryPaidAmount] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (availableTraders.length === 0) {
    return <p className="text-sm text-sub">Every registered trader is already entered.</p>;
  }

  const selectedPersonId = availableTraders.some((t) => t.id === personId) ? personId : availableTraders[0].id;

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/competitions/${competitionId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: selectedPersonId, entryPaidAmount: Number(entryPaidAmount) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        return;
      }
      setPersonId("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <Field label="Trader">
          <Select value={selectedPersonId} onChange={(e) => setPersonId(e.target.value)}>
            {availableTraders.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName} ({t.email})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="w-32">
        <Field label="Paid">
          <Input type="number" value={entryPaidAmount} onChange={(e) => setEntryPaidAmount(e.target.value)} />
        </Field>
      </div>
      <Button disabled={saving} onClick={submit}>
        Add entrant
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

function EntryProgressRow({ entry }: { entry: ActiveEntry }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [equity, setEquity] = useState(entry.equity);
  const [tradesCount, setTradesCount] = useState(String(entry.tradesCount));
  const [disqualifying, setDisqualifying] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveProgress() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/competitions/entries/${entry.entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equity: Number(equity), tradesCount: Number(tradesCount) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function confirmDisqualify() {
    setError(null);
    const res = await fetch(`/api/admin/competitions/entries/${entry.entryId}/disqualify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 border-b border-bd px-4 py-3 text-sm last:border-b-0">
      <div className="flex items-center justify-between">
        <span>{entry.fullName}</span>
        {editing ? (
          <div className="flex items-center gap-2">
            <Input type="number" value={equity} onChange={(e) => setEquity(e.target.value)} className="w-28" />
            <Input type="number" value={tradesCount} onChange={(e) => setTradesCount(e.target.value)} className="w-20" />
            <Button disabled={saving} onClick={saveProgress}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-xs text-sub">
            <span>equity {entry.equity}</span>
            <span>{entry.tradesCount} trades</span>
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Update
            </Button>
            <Button variant="ghost" onClick={() => setDisqualifying(true)}>
              Disqualify
            </Button>
          </div>
        )}
      </div>
      {disqualifying && (
        <div className="flex items-center gap-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
          <Button variant="danger" disabled={reason.trim().length < 4} onClick={confirmDisqualify}>
            Confirm
          </Button>
          <Button variant="ghost" onClick={() => setDisqualifying(false)}>
            Cancel
          </Button>
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}

export default function CompetitionDetail({
  competition,
  stats,
  ranked,
  notYetQualified,
  allActiveEntries,
  disqualifiedEntries,
  availableTraders,
}: {
  competition: Competition;
  stats: { entryRevenue: number; prizeCost: number; entrantsConverted: number; entrantCount: number };
  ranked: RankedRow[];
  notYetQualified: NotYetQualified[];
  allActiveEntries: ActiveEntry[];
  disqualifiedEntries: DisqualifiedEntry[];
  availableTraders: Trader[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <LegalSignOff competition={competition} />
      <StatusControls competition={competition} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-sub uppercase">Entry revenue</p>
          <p className="mt-1 font-display text-lg font-semibold">{money(stats.entryRevenue, competition.currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-sub uppercase">Prize cost (cash only)</p>
          <p className="mt-1 font-display text-lg font-semibold">{money(stats.prizeCost, competition.currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-sub uppercase">Entrants</p>
          <p className="mt-1 font-display text-lg font-semibold">{stats.entrantCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-sub uppercase">Converted to paying</p>
          <p className="mt-1 font-display text-lg font-semibold">{stats.entrantsConverted}</p>
          <p className="mt-0.5 text-xs text-sub">The real metric — spec §7.3</p>
        </Card>
      </div>

      <Card className="p-5 text-sm">
        <p className="text-sub">
          {competition.minTradesToQualify} trades to qualify · ranked by{" "}
          {competition.rankingMetric === "return_pct" ? "return %" : "absolute P&L"} · tie-breaker:{" "}
          {competition.tieBreakerRule}
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-display text-sm font-semibold">Add entrant</h2>
        <AddEntrant competitionId={competition.id} availableTraders={availableTraders} />
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-bd px-4 py-3 text-sm font-medium">Leaderboard</div>
        {ranked.length === 0 ? (
          <p className="p-4 text-sm text-sub">No qualified entrants yet.</p>
        ) : (
          ranked.map((r) => (
            <div key={r.personId} className="flex items-center justify-between border-b border-bd px-4 py-2.5 text-sm last:border-b-0">
              <span>
                <span className="mr-2 font-mono text-sub">#{r.rank}</span>
                {r.fullName}
              </span>
              <span className="font-medium">
                {competition.rankingMetric === "return_pct" ? `${r.metricValue}%` : money(r.metricValue, competition.currency)}
              </span>
            </div>
          ))
        )}
      </Card>

      {notYetQualified.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-bd px-4 py-3 text-sm font-medium">Not yet qualified</div>
          {notYetQualified.map((e) => (
            <div key={e.personId} className="flex items-center justify-between border-b border-bd px-4 py-2.5 text-sm last:border-b-0">
              <span>{e.fullName}</span>
              <span className="text-xs text-sub">
                {e.tradesCount} / {competition.minTradesToQualify} trades
              </span>
            </div>
          ))}
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-bd px-4 py-3 text-sm font-medium">All active entries</div>
        {allActiveEntries.length === 0 ? (
          <p className="p-4 text-sm text-sub">No entrants yet.</p>
        ) : (
          allActiveEntries.map((e) => <EntryProgressRow key={e.entryId} entry={e} />)
        )}
      </Card>

      {disqualifiedEntries.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-bd px-4 py-3 text-sm font-medium">
            Disqualified — kept as leads, not deleted
          </div>
          {disqualifiedEntries.map((e) => (
            <div key={e.entryId} className="border-b border-bd px-4 py-2.5 text-sm last:border-b-0">
              <p>{e.fullName}</p>
              <p className="text-xs text-sub">{e.reason}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
