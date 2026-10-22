"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type OpenPos = { id: string; symbol: string; side: "buy" | "sell"; lots: string; openPrice: string; openedAt: string; stopLoss: string | null; takeProfit: string | null; floatingPnl: string | null };
type ClosedPos = { id: string; symbol: string; side: "buy" | "sell"; lots: string; openPrice: string; closePrice: string | null; closedAt: string | null; closeReason: string | null; netPnl: string | null };
type TradingAccount = { id: string; name: string; currency: string; status: string; phase: string; voided: boolean; balance: string; liveEquity: string | null; floatingPnl: string | null; open: OpenPos[]; closed: ClosedPos[] };

const REASON_TEXT: Record<string, string> = {
  manual: "Closed by trader",
  stop_loss: "Stop-loss",
  take_profit: "Take-profit",
  breach: "Account breached",
  pass: "Target reached",
  admin: "Force-closed by staff",
};

const money = (v: string | null, currency: string, signed = false) => {
  if (v === null) return "n/a";
  const n = Number(v);
  let s: string;
  try {
    s = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Math.abs(n));
  } catch {
    s = `${currency} ${Math.abs(n).toFixed(2)}`;
  }
  return n < 0 ? `-${s}` : signed && n > 0 ? `+${s}` : s;
};
const pnlClass = (v: string | null) => (v === null || Number(v) === 0 ? "" : Number(v) > 0 ? "text-success" : "text-danger");
const level = (v: string | null) => (v === null ? "—" : Number(v).toString());

function OpenRow({ personId, accountId, p, currency, canForceClose }: { personId: string; accountId: string; p: OpenPos; currency: string; canForceClose: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function forceClose() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/traders/${personId}/positions/${p.id}/close`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, reason }) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "The position could not be closed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr className="border-t border-bd">
        <td className="px-3 py-2 font-semibold">{p.symbol}</td>
        <td className={`px-2 py-2 ${p.side === "buy" ? "text-success" : "text-danger"}`}>{p.side === "buy" ? "Buy" : "Sell"}</td>
        <td className="px-2 py-2 text-right font-mono">{p.lots}</td>
        <td className="px-2 py-2 text-right font-mono">{Number(p.openPrice)}</td>
        <td className="px-2 py-2 text-right font-mono text-sub">{level(p.stopLoss)}</td>
        <td className="px-2 py-2 text-right font-mono text-sub">{level(p.takeProfit)}</td>
        <td className={`px-2 py-2 text-right font-mono ${pnlClass(p.floatingPnl)}`}>{money(p.floatingPnl, currency, true)}</td>
        <td className="px-3 py-2 text-right">
          {canForceClose && !asking && (
            <Button type="button" variant="danger" onClick={() => setAsking(true)}>
              Force close
            </Button>
          )}
        </td>
      </tr>
      {asking && (
        <tr className="bg-raise">
          <td colSpan={8} className="px-3 py-3">
            <p className="mb-2 text-xs text-sub">
              This closes the position at the current price and changes the trader&apos;s balance by the result. It is recorded in the audit log with your name and this reason.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="max-w-96" disabled={busy} />
              <Button type="button" variant="danger" disabled={busy || reason.trim().length < 5} onClick={forceClose}>
                {busy ? "Closing…" : "Confirm force close"}
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => { setAsking(false); setError(null); }}>
                Cancel
              </Button>
            </div>
            {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

export default function TradingCard({ personId, accounts, pricesCurrent, canForceClose }: { personId: string; accounts: TradingAccount[]; pricesCurrent: boolean; canForceClose: boolean }) {
  return (
    <Card className="mt-5 p-5">
      <h2 className="mb-1 font-display text-sm font-semibold">Terminal trading</h2>
      <p className="mb-3 text-xs text-sub">Simulated positions and trades in the trader&apos;s terminal, as of when this page loaded. Reload to refresh.</p>
      {!pricesCurrent && <Alert tone="warning">Prices are not current right now, so profits can&apos;t be shown and a position can&apos;t be force-closed until they return.</Alert>}
      {accounts.map((a) => (
        <div key={a.id} className="mt-4 first:mt-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {a.name} <span className="font-normal text-sub">· balance {money(a.balance, a.currency)} · equity {money(a.liveEquity, a.currency)} · floating {money(a.floatingPnl, a.currency, true)}</span>
            </p>
            <div className="flex gap-1.5">
              <Badge tone={a.status === "active" ? "neutral" : "danger"}>{a.status}</Badge>
              <Badge tone="neutral">{a.phase.replace("_", " ")}</Badge>
              {a.voided && <Badge tone="danger">voided</Badge>}
            </div>
          </div>
          {a.open.length === 0 ? (
            <p className="text-sm text-sub">No open positions.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-bd">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] tracking-wide text-sub uppercase">
                    <th className="px-3 py-2 font-medium">Instrument</th>
                    <th className="px-2 py-2 font-medium">Side</th>
                    <th className="px-2 py-2 text-right font-medium">Size</th>
                    <th className="px-2 py-2 text-right font-medium">Open</th>
                    <th className="px-2 py-2 text-right font-medium">Stop</th>
                    <th className="px-2 py-2 text-right font-medium">Target</th>
                    <th className="px-2 py-2 text-right font-medium">Profit</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {a.open.map((p) => (
                    <OpenRow key={p.id} personId={personId} accountId={a.id} p={p} currency={a.currency} canForceClose={canForceClose && pricesCurrent} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {a.closed.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-sub hover:text-ink">Latest closed trades ({a.closed.length})</summary>
              <div className="mt-2 overflow-x-auto rounded-md border border-bd">
                <table className="w-full text-sm">
                  <tbody>
                    {a.closed.map((t) => (
                      <tr key={t.id} className="border-t border-bd first:border-t-0">
                        <td className="px-3 py-1.5 text-xs text-sub">{t.closedAt ? new Date(t.closedAt).toLocaleString() : ""}</td>
                        <td className="px-2 py-1.5 font-semibold">{t.symbol}</td>
                        <td className={`px-2 py-1.5 ${t.side === "buy" ? "text-success" : "text-danger"}`}>{t.side === "buy" ? "Buy" : "Sell"}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{t.lots}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{Number(t.openPrice)} → {t.closePrice ? Number(t.closePrice) : ""}</td>
                        <td className="px-2 py-1.5 text-xs text-sub">{REASON_TEXT[t.closeReason ?? ""] ?? t.closeReason}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${pnlClass(t.netPnl)}`}>{money(t.netPnl, a.currency, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      ))}
    </Card>
  );
}
