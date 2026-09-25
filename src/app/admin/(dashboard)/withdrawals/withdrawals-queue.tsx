"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

type Withdrawal = {
  id: string;
  traderName: string;
  traderId: string;
  country: string;
  kycStatus: string;
  accountSize: string;
  currency: string;
  profit: string;
  splitPct: string;
  amount: string;
  status: "pending" | "approved" | "declined" | "paid";
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
};

function money(value: string, currency: string) {
  const n = Number(value);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

const STATUS_TONE: Record<Withdrawal["status"], "success" | "danger" | "neutral"> = {
  pending: "neutral",
  approved: "success",
  declined: "danger",
  paid: "success",
};

function PendingRow({ w, canApprove }: { w: Withdrawal; canApprove: boolean }) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function decide(decision: "approved" | "declined") {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/withdrawals/${w.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: decision === "declined" ? note.trim() : undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save.");
        return;
      }
      setDeclining(false);
      setNote("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b border-bd p-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href={`/admin/traders/${w.traderId}`} className="font-medium hover:text-acc">
          {w.traderName}
        </Link>
        <Badge tone={w.kycStatus === "verified" ? "success" : "danger"}>KYC: {w.kycStatus}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-sub md:grid-cols-5">
        <div>
          <p className="uppercase">Country</p>
          <p className="text-ink">{w.country}</p>
        </div>
        <div>
          <p className="uppercase">Account size</p>
          <p className="text-ink">{money(w.accountSize, w.currency)}</p>
        </div>
        <div>
          <p className="uppercase">Profit</p>
          <p className="text-ink">{money(w.profit, w.currency)}</p>
        </div>
        <div>
          <p className="uppercase">Split</p>
          <p className="text-ink">{w.splitPct}%</p>
        </div>
        <div>
          <p className="uppercase">Amount</p>
          <p className="font-medium text-ink">{money(w.amount, w.currency)}</p>
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {canApprove &&
        (declining ? (
          <div className="flex flex-col gap-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason — shown to the trader"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                variant="danger"
                disabled={note.trim().length < 4 || saving}
                onClick={() => decide("declined")}
              >
                Confirm decline
              </Button>
              <Button variant="ghost" onClick={() => setDeclining(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button disabled={saving} onClick={() => decide("approved")}>
              Approve
            </Button>
            <Button variant="danger" disabled={saving} onClick={() => setDeclining(true)}>
              Decline
            </Button>
          </div>
        ))}
    </div>
  );
}

export default function WithdrawalsQueue({
  withdrawals,
  canApprove,
}: {
  withdrawals: Withdrawal[];
  canApprove: boolean;
}) {
  const pending = withdrawals.filter((w) => w.status === "pending");
  const decided = withdrawals.filter((w) => w.status !== "pending");

  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-bd px-4 py-3 text-sm font-medium">
          Pending decision <Badge tone="accent">{pending.length}</Badge>
        </div>
        {pending.length === 0 ? (
          <p className="p-4 text-sm text-sub">Nothing pending.</p>
        ) : (
          pending.map((w) => <PendingRow key={w.id} w={w} canApprove={canApprove} />)
        )}
      </Card>

      {decided.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-bd px-4 py-3 text-sm font-medium">History</div>
          <div className="flex flex-col">
            {decided.map((w) => (
              <div key={w.id} className="flex flex-col gap-1 border-b border-bd px-4 py-3 text-sm last:border-b-0">
                <div className="flex items-center justify-between">
                  <Link href={`/admin/traders/${w.traderId}`} className="hover:text-acc">
                    {w.traderName}
                  </Link>
                  <div className="flex items-center gap-2">
                    <span>{money(w.amount, w.currency)}</span>
                    <Badge tone={STATUS_TONE[w.status]}>{w.status}</Badge>
                  </div>
                </div>
                <p className="text-xs text-sub">
                  {w.decidedByName ? `Decided by ${w.decidedByName}` : ""}
                  {w.decidedAt ? ` · ${new Date(w.decidedAt).toLocaleString()}` : ""}
                  {w.decisionNote ? ` · ${w.decisionNote}` : ""}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
