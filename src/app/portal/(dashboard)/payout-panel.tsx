"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Payout = {
  profit: string;
  splitPct: string;
  amount: string;
  canRequest: boolean;
  blockedReason: string | null;
};
type Withdrawal = {
  id: string;
  amount: string;
  status: "pending" | "approved" | "declined" | "paid";
  requestedAt: string;
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

export default function PayoutPanel({
  accountId,
  currency,
  payout,
  withdrawals,
}: {
  accountId: string;
  currency: string;
  payout: Payout;
  withdrawals: Withdrawal[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function request() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/portal/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to request payout.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 border-t border-bd pt-3">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-sub uppercase">Profit</p>
          <p className="text-ink">{money(payout.profit, currency)}</p>
        </div>
        <div>
          <p className="text-sub uppercase">Split</p>
          <p className="text-ink">{payout.splitPct}%</p>
        </div>
        <div>
          <p className="text-sub uppercase">Amount</p>
          <p className="font-medium text-ink">{money(payout.amount, currency)}</p>
        </div>
      </div>
      <div className="mt-3">
        <Button onClick={request} disabled={!payout.canRequest || loading}>
          {loading ? "Requesting…" : "Request payout"}
        </Button>
        {payout.blockedReason && <p className="mt-1.5 text-xs text-sub">{payout.blockedReason}</p>}
      </div>
      {error && (
        <div className="mt-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      {withdrawals.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {withdrawals.map((w) => (
            <div key={w.id} className="flex items-center justify-between text-xs">
              <span className="text-sub">{new Date(w.requestedAt).toLocaleDateString()}</span>
              <span className="flex items-center gap-1.5">
                {money(w.amount, currency)}
                <Badge tone={STATUS_TONE[w.status]}>{w.status}</Badge>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
