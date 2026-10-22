"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TerminalAccountSummary, TerminalState } from "@/server/trading/terminal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select } from "@/components/ui/field";
import { Meter } from "@/components/ui/meter";

/**
 * The trader's terminal. Everything shown comes from the server, which this screen
 * asks about once a second: it never works out a price, an equity or a profit for
 * itself, and an order carries only what to trade and how much. The server
 * decides the price it fills at and refuses anything not allowed (market closed, no
 * current price, not enough margin...); the message it gives is shown as it is.
 */

type Candle = { t: string; o: string; h: string; l: string; c: string };
type Trade = { id: string; symbol: string; side: "buy" | "sell"; lots: string; openPrice: string; closePrice: string | null; closedAt: string | null; closeReason: string | null; netPnl: string | null };
type Timeframe = "1m" | "5m" | "15m" | "1h";

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: "1m", label: "1 min" },
  { key: "5m", label: "5 min" },
  { key: "15m", label: "15 min" },
  { key: "1h", label: "1 hour" },
];

const REASON_TEXT: Record<string, string> = {
  manual: "Closed by you",
  stop_loss: "Stop-loss",
  take_profit: "Take-profit",
  breach: "Account breached",
  pass: "Target reached",
  admin: "Closed by staff",
};

const money = (v: string | null | undefined, currency: string, signed = false) => {
  if (v === null || v === undefined) return "n/a";
  const n = Number(v);
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Math.abs(n));
  return n < 0 ? `-${s}` : signed && n > 0 ? `+${s}` : s;
};
const price = (v: string | null | undefined, digits: number) => (v === null || v === undefined ? "n/a" : Number(v).toFixed(digits));
const pnlClass = (v: string | null | undefined) => (v === null || v === undefined || Number(v) === 0 ? "" : Number(v) > 0 ? "text-success" : "text-danger");

export default function Terminal({ accounts, initialAccountId, pricesConfigured }: { accounts: TerminalAccountSummary[]; initialAccountId: string; pricesConfigured: boolean }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(initialAccountId);
  const [state, setState] = useState<TerminalState | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [chosenSymbol, setChosenSymbol] = useState<string | null>(null);
  const [tf, setTf] = useState<Timeframe>("5m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [tab, setTab] = useState<"positions" | "history">("positions");
  const [history, setHistory] = useState<Trade[]>([]);

  // The order ticket's fields are kept per instrument, so switching instrument shows that instrument's own size and levels.
  const [ticket, setTicket] = useState<Record<string, { lots?: string; stopLoss?: string; takeProfit?: string }>>({});
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketOk, setTicketOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  // The position whose stop-loss / take-profit is being edited, with the text typed so far (kept here so the once-a-second refresh never wipes it).
  const [editing, setEditing] = useState<{ id: string; stopLoss: string; takeProfit: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadState = useCallback(async () => {
    const res = await fetch(`/api/portal/terminal/state?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
    if (res.status === 401) {
      router.push("/portal/login");
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not load the terminal.");
    setState(data as TerminalState);
    setPollError(null);
  }, [accountId, router]);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/portal/terminal/history?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
    if (res.ok) setHistory((await res.json()).trades as Trade[]);
  }, [accountId]);

  // Ask the server for the live state once a second (more slowly while the tab is in the background).
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        await loadState();
      } catch (e) {
        if (!stopped) setPollError(e instanceof Error ? e.message : "Connection problem.");
      } finally {
        if (!stopped) timer = setTimeout(tick, document.hidden ? 4000 : 1000);
      }
    };
    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [loadState]);

  // The selected instrument is the one clicked, or else the first in the list; the size defaults to that instrument's minimum.
  const instruments = state?.instruments ?? [];
  const symbol = instruments.some((i) => i.symbol === chosenSymbol) ? chosenSymbol : (instruments[0]?.symbol ?? null);
  const inst = instruments.find((i) => i.symbol === symbol) ?? null;
  const fields = (symbol && ticket[symbol]) || {};
  const lots = fields.lots ?? inst?.minLot ?? "";
  const stopLoss = fields.stopLoss ?? "";
  const takeProfit = fields.takeProfit ?? "";
  const setField = (key: "lots" | "stopLoss" | "takeProfit", value: string) => {
    if (symbol) setTicket((t) => ({ ...t, [symbol]: { ...t[symbol], [key]: value } }));
  };
  const selectSymbol = (s: string) => {
    setChosenSymbol(s);
    setTicketError(null);
    setTicketOk(null);
  };
  const switchAccount = (id: string) => {
    setAccountId(id);
    setChosenSymbol(null);
    setState(null);
    setHistory([]);
    setTicket({});
  };
  const openTab = (k: "positions" | "history") => {
    setTab(k);
    if (k === "history") void loadHistory();
  };

  // Candles for the chart, refreshed every few seconds.
  useEffect(() => {
    if (!symbol) return;
    let stopped = false;
    const load = async () => {
      const res = await fetch(`/api/portal/terminal/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}`, { cache: "no-store" });
      if (res.ok && !stopped) setCandles((await res.json()).candles as Candle[]);
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [symbol, tf]);

  async function placeOrder(side: "buy" | "sell") {
    if (!inst) return;
    setBusy(true);
    setTicketError(null);
    setTicketOk(null);
    try {
      const res = await fetch("/api/portal/terminal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, symbol: inst.symbol, side, lots, stopLoss: stopLoss.trim() || null, takeProfit: takeProfit.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTicketError(data.error ?? "The order was refused.");
        return;
      }
      setTicketOk(`${side === "buy" ? "Bought" : "Sold"} ${data.lots} ${data.symbol} at ${price(data.price, inst.digits)}.`);
      setField("stopLoss", "");
      setField("takeProfit", "");
      await loadState();
    } finally {
      setBusy(false);
    }
  }

  async function closePosition(id: string, label: string) {
    if (!window.confirm(`Close ${label} at the current price?`)) return;
    setClosing(id);
    setTicketError(null);
    setTicketOk(null);
    try {
      const res = await fetch(`/api/portal/terminal/positions/${id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!res.ok) setTicketError(data.error ?? "The position could not be closed.");
      else setTicketOk(`Closed at ${data.price}: ${money(data.netPnl, state?.account.currency ?? "EUR", true)}.`);
      await loadState();
      if (tab === "history") await loadHistory();
    } finally {
      setClosing(null);
    }
  }

  async function saveLevels() {
    if (!editing) return;
    setSaving(true);
    setTicketError(null);
    setTicketOk(null);
    try {
      const res = await fetch(`/api/portal/terminal/positions/${editing.id}/levels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, stopLoss: editing.stopLoss.trim() || null, takeProfit: editing.takeProfit.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Keep the editor open with what was typed, so it can be corrected.
        setTicketError(data.error ?? "The change was refused.");
        return;
      }
      setTicketOk("Stop-loss and take-profit updated.");
      setEditing(null);
      await loadState();
    } finally {
      setSaving(false);
    }
  }

  const a = state?.account;
  const ccy = a?.currency ?? "EUR";
  const positionsHere = useMemo(() => (state?.positions ?? []).filter((p) => p.symbol === symbol), [state, symbol]);

  const blocked = !state
    ? "Loading…"
    : !state.canTrade
      ? "This account isn't open for trading."
      : !state.pricesCurrent
        ? "No current prices, so nothing can be opened or closed right now."
        : !inst
          ? "Choose an instrument."
          : !inst.marketOpen
            ? `The ${inst.symbol} market is closed.`
            : inst.bid === null || inst.ask === null
              ? `No current price for ${inst.symbol}.`
              : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold">Terminal</h1>
          <p className="text-sm text-sub">Simulated trading on your challenge account. No real money is traded.</p>
        </div>
        {accounts.length > 1 && (
          <div className="w-64">
            <Select value={accountId} onChange={(e) => switchAccount(e.target.value)} aria-label="Account">
              {accounts.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({x.phase})
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {!pricesConfigured && <Alert tone="warning">Live prices aren&apos;t switched on for this copy of ESTIN, so there is nothing to trade yet.</Alert>}
      {pricesConfigured && state && !state.pricesCurrent && <Alert tone="warning">Prices are not current right now. Trading is paused and your account is not being marked or stopped out until they return.</Alert>}
      {state?.priceSource === "simulated" && <Alert tone="warning">These are <strong>simulated</strong> sample prices for testing, not real market prices.</Alert>}
      {pollError && <Alert tone="danger">{pollError} Retrying…</Alert>}
      {state && !state.canTrade && a && (
        <Alert tone="warning">This account is {a.status === "active" ? a.phase.replace("_", " ") : a.status}{a.closeReason ? `: ${a.closeReason}` : ""}. It can&apos;t be traded.</Alert>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] tracking-wide text-sub uppercase">
                    <th className="px-4 py-2 font-medium">Instrument</th>
                    <th className="px-2 py-2 text-right font-medium">Bid</th>
                    <th className="px-2 py-2 text-right font-medium">Ask</th>
                    <th className="px-2 py-2 text-right font-medium">Today</th>
                    <th className="px-4 py-2 text-right font-medium">Market</th>
                  </tr>
                </thead>
                <tbody>
                  {instruments.map((i) => (
                    <tr key={i.symbol} onClick={() => selectSymbol(i.symbol)} className={`cursor-pointer border-t border-bd hover:bg-raise ${i.symbol === symbol ? "bg-accbg" : ""}`}>
                      <td className="px-4 py-2">
                        <span className="font-semibold">{i.symbol}</span>
                        <span className="block text-xs text-sub">{i.name}</span>
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{price(i.bid, i.digits)}</td>
                      <td className="px-2 py-2 text-right font-mono">{price(i.ask, i.digits)}</td>
                      <td className={`px-2 py-2 text-right font-mono ${pnlClass(i.changePct)}`}>{i.changePct === null ? "n/a" : `${Number(i.changePct) > 0 ? "+" : ""}${i.changePct}%`}</td>
                      <td className="px-4 py-2 text-right text-xs">
                        <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${i.marketOpen ? "bg-success" : "bg-sub"}`} />
                        {i.marketOpen ? "Open" : "Closed"}
                      </td>
                    </tr>
                  ))}
                  {state && instruments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sub">This challenge has no instruments you can trade.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-3">
                <h2 className="font-display text-base font-semibold">{symbol ?? "Chart"}</h2>
                {inst && inst.bid !== null && inst.ask !== null && <span className="font-mono text-lg">{price(((Number(inst.bid) + Number(inst.ask)) / 2).toString(), inst.digits)}</span>}
              </div>
              <div className="flex gap-1">
                {TIMEFRAMES.map((t) => (
                  <button key={t.key} type="button" onClick={() => setTf(t.key)} className={`rounded-md border px-2.5 py-1 text-xs ${tf === t.key ? "border-acc bg-accbg text-acc" : "border-bd text-sub hover:text-ink"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <Chart candles={candles} digits={inst?.digits ?? 5} live={inst && inst.bid !== null && inst.ask !== null ? (Number(inst.bid) + Number(inst.ask)) / 2 : null} positions={positionsHere} />
            <p className="mt-1 text-xs text-sub">Built from ESTIN&apos;s own recorded prices, so the chart shows exactly what trades are filled at. It only goes back as far as prices have been recorded.</p>
          </Card>

          <Card className="p-0">
            <div className="flex border-b border-bd text-sm">
              {(["positions", "history"] as const).map((k) => (
                <button key={k} type="button" onClick={() => openTab(k)} className={`px-4 py-2.5 ${tab === k ? "border-b-2 border-acc text-acc" : "text-sub hover:text-ink"}`}>
                  {k === "positions" ? `Open positions${state ? ` (${state.positions.length})` : ""}` : "History"}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              {tab === "positions" ? (
                <PositionsTable
                  state={state}
                  currency={ccy}
                  closing={closing}
                  onClose={closePosition}
                  editing={editing && state?.positions.some((p) => p.id === editing.id) ? editing : null}
                  saving={saving}
                  onEdit={(p) => {
                    setTicketError(null);
                    setTicketOk(null);
                    setEditing({ id: p.id, stopLoss: p.stopLoss ?? "", takeProfit: p.takeProfit ?? "" });
                  }}
                  error={editing ? ticketError : null}
                  onEditChange={(key, value) => setEditing((e) => (e ? { ...e, [key]: value } : e))}
                  onSave={saveLevels}
                  onCancel={() => {
                    setEditing(null);
                    setTicketError(null);
                  }}
                />
              ) : (
                <HistoryTable trades={history} currency={ccy} />
              )}
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-4">
            <h2 className="mb-3 font-display text-base font-semibold">New order</h2>
            {inst ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Size (lots)" className="col-span-1">
                    <Input value={lots} onChange={(e) => setField("lots", e.target.value)} inputMode="decimal" disabled={busy} />
                  </Field>
                  <Field label="Stop-loss" className="col-span-1">
                    <Input value={stopLoss} onChange={(e) => setField("stopLoss", e.target.value)} inputMode="decimal" placeholder="optional" disabled={busy} />
                  </Field>
                  <Field label="Take-profit" className="col-span-1">
                    <Input value={takeProfit} onChange={(e) => setField("takeProfit", e.target.value)} inputMode="decimal" placeholder="optional" disabled={busy} />
                  </Field>
                </div>
                <p className="text-xs text-sub">
                  Sizes in steps of {inst.lotStep} (from {inst.minLot} to {inst.maxLot}). Stop-loss and take-profit are prices, at least {inst.minStopDistance} from the entry price.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy || blocked !== null} onClick={() => placeOrder("sell")} className="rounded-md border border-danger-bd bg-danger-bg px-3 py-3 text-center font-semibold text-danger transition-colors hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40">
                    Sell
                    <span className="block font-mono text-sm font-normal">{price(inst.bid, inst.digits)}</span>
                  </button>
                  <button type="button" disabled={busy || blocked !== null} onClick={() => placeOrder("buy")} className="rounded-md border border-success-bd bg-success-bg px-3 py-3 text-center font-semibold text-success transition-colors hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40">
                    Buy
                    <span className="block font-mono text-sm font-normal">{price(inst.ask, inst.digits)}</span>
                  </button>
                </div>
                {blocked && <p className="text-xs text-warning">{blocked}</p>}
                {ticketError && !editing && <Alert tone="danger">{ticketError}</Alert>}
                {ticketOk && <Alert tone="success">{ticketOk}</Alert>}
                <p className="text-xs text-sub">Orders fill at the current price shown by the server: buys at the ask, sells at the bid.</p>
              </div>
            ) : (
              <p className="text-sm text-sub">{state ? "No instrument to trade." : "Loading…"}</p>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">{a?.name ?? "Account"}</h2>
              {a && <Badge tone={a.status === "active" ? "neutral" : "danger"}>{a.status}</Badge>}
            </div>
            {a ? (
              <>
                <dl className="flex flex-col gap-1.5 text-sm">
                  <Row label={a.equityIsLive ? "Equity" : "Equity (last known)"} value={money(a.equity, ccy)} strong />
                  <Row label="Balance" value={money(a.balance, ccy)} />
                  <Row label="Floating profit" value={money(a.floatingPnl, ccy, true)} valueClass={pnlClass(a.floatingPnl)} />
                  <Row label="Margin in use" value={money(a.usedMargin, ccy)} />
                  <Row label="Free margin" value={money(a.freeMargin, ccy)} />
                  <Row label="Trading days" value={`${a.tradingDays}${a.minTradingDays ? ` of ${a.minTradingDays} needed` : ""}`} />
                </dl>
                {a.rule && (
                  <div className="mt-4 border-t border-bd pt-3">
                    <p className="mb-2 text-xs font-medium tracking-wide text-sub uppercase">Objectives</p>
                    <div className="flex flex-col gap-3">
                      {a.rule.profitTarget && <Meter label="Profit target" used={Math.max(0, Number(a.rule.pnl)).toString()} limit={a.rule.profitTarget} currency={ccy} />}
                      <Meter label="Daily loss used" used={a.rule.dailyLossUsed} limit={a.rule.dailyLossCap} currency={ccy} />
                      <Meter label={`Max loss (${a.drawdownType})`} used={a.rule.totalLossUsed} limit={a.rule.maxLossCap} currency={ccy} />
                    </div>
                    <p className="mt-2 text-xs text-sub">
                      The account closes if equity falls below {money(a.rule.dailyBreachLevel, ccy)} today, or below {money(a.rule.totalBreachLevel, ccy)} overall.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-sub">Loading…</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong, valueClass = "" }: { label: string; value: string; strong?: boolean; valueClass?: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-sub">{label}</dt>
      <dd className={`${strong ? "font-semibold" : ""} ${valueClass}`}>{value}</dd>
    </div>
  );
}

type Editing = { id: string; stopLoss: string; takeProfit: string };
type OpenPositionRow = TerminalState["positions"][number];

function PositionsTable({
  state,
  currency,
  closing,
  onClose,
  editing,
  saving,
  error,
  onEdit,
  onEditChange,
  onSave,
  onCancel,
}: {
  state: TerminalState | null;
  currency: string;
  closing: string | null;
  onClose: (id: string, label: string) => void;
  editing: Editing | null;
  saving: boolean;
  error: string | null;
  onEdit: (p: OpenPositionRow) => void;
  onEditChange: (key: "stopLoss" | "takeProfit", value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (!state) return <p className="p-6 text-sm text-sub">Loading…</p>;
  if (state.positions.length === 0) return <p className="p-6 text-sm text-sub">No open positions.</p>;
  const digits = (s: string) => state.instruments.find((i) => i.symbol === s)?.digits ?? 5;
  return (
    <>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] tracking-wide text-sub uppercase">
          <th className="px-4 py-2 font-medium">Instrument</th>
          <th className="px-2 py-2 font-medium">Side</th>
          <th className="px-2 py-2 text-right font-medium">Size</th>
          <th className="px-2 py-2 text-right font-medium">Open</th>
          <th className="px-2 py-2 text-right font-medium">Stop</th>
          <th className="px-2 py-2 text-right font-medium">Target</th>
          <th className="px-2 py-2 text-right font-medium">Profit</th>
          <th className="px-4 py-2" />
        </tr>
      </thead>
      <tbody>
        {state.positions.map((p) => (
          <tr key={p.id} className="border-t border-bd">
            <td className="px-4 py-2 font-semibold">{p.symbol}</td>
            <td className={`px-2 py-2 ${p.side === "buy" ? "text-success" : "text-danger"}`}>{p.side === "buy" ? "Buy" : "Sell"}</td>
            <td className="px-2 py-2 text-right font-mono">{p.lots}</td>
            <td className="px-2 py-2 text-right font-mono">{price(p.openPrice, digits(p.symbol))}</td>
            {editing?.id === p.id ? (
              <>
                <td className="px-2 py-1.5 text-right">
                  <Input className="w-24 text-right font-mono" value={editing.stopLoss} onChange={(e) => onEditChange("stopLoss", e.target.value)} inputMode="decimal" placeholder="none" aria-label="Stop-loss" disabled={saving} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Input className="w-24 text-right font-mono" value={editing.takeProfit} onChange={(e) => onEditChange("takeProfit", e.target.value)} inputMode="decimal" placeholder="none" aria-label="Take-profit" disabled={saving} />
                </td>
              </>
            ) : (
              <>
                <td className="px-2 py-2 text-right font-mono text-sub">{p.stopLoss ? price(p.stopLoss, digits(p.symbol)) : "—"}</td>
                <td className="px-2 py-2 text-right font-mono text-sub">{p.takeProfit ? price(p.takeProfit, digits(p.symbol)) : "—"}</td>
              </>
            )}
            <td className={`px-2 py-2 text-right font-mono ${pnlClass(p.floatingPnl)}`}>{money(p.floatingPnl, currency, true)}</td>
            <td className="px-4 py-2 text-right whitespace-nowrap">
              {editing?.id === p.id ? (
                <>
                  <Button type="button" variant="ghost" disabled={saving} onClick={onSave}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="ghost" disabled={closing === p.id || editing !== null} onClick={() => onEdit(p)}>
                    Edit
                  </Button>
                  <Button type="button" variant="ghost" disabled={closing === p.id} onClick={() => onClose(p.id, `${p.side === "buy" ? "buy" : "sell"} ${p.lots} ${p.symbol}`)}>
                    {closing === p.id ? "Closing…" : "Close"}
                  </Button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    {editing && (
      <div className="border-t border-bd p-3 text-xs text-sub">
        Leave a box empty to remove that level. A stop-loss or take-profit is checked against the price the position would close at right now.
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    )}
    </>
  );
}

function HistoryTable({ trades, currency }: { trades: Trade[]; currency: string }) {
  if (trades.length === 0) return <p className="p-6 text-sm text-sub">No closed trades yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] tracking-wide text-sub uppercase">
          <th className="px-4 py-2 font-medium">Closed</th>
          <th className="px-2 py-2 font-medium">Instrument</th>
          <th className="px-2 py-2 font-medium">Side</th>
          <th className="px-2 py-2 text-right font-medium">Size</th>
          <th className="px-2 py-2 text-right font-medium">Open</th>
          <th className="px-2 py-2 text-right font-medium">Close</th>
          <th className="px-2 py-2 font-medium">How</th>
          <th className="px-4 py-2 text-right font-medium">Profit</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t) => (
          <tr key={t.id} className="border-t border-bd">
            <td className="px-4 py-2 text-xs text-sub">{t.closedAt ? new Date(t.closedAt).toLocaleString() : ""}</td>
            <td className="px-2 py-2 font-semibold">{t.symbol}</td>
            <td className={`px-2 py-2 ${t.side === "buy" ? "text-success" : "text-danger"}`}>{t.side === "buy" ? "Buy" : "Sell"}</td>
            <td className="px-2 py-2 text-right font-mono">{t.lots}</td>
            <td className="px-2 py-2 text-right font-mono">{Number(t.openPrice)}</td>
            <td className="px-2 py-2 text-right font-mono">{t.closePrice ? Number(t.closePrice) : ""}</td>
            <td className="px-2 py-2 text-xs text-sub">{REASON_TEXT[t.closeReason ?? ""] ?? t.closeReason}</td>
            <td className={`px-4 py-2 text-right font-mono ${pnlClass(t.netPnl)}`}>{money(t.netPnl, currency, true)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type ChartPosition = { side: "buy" | "sell"; openPrice: string; stopLoss: string | null; takeProfit: string | null };

/** Candlesticks drawn as plain SVG, with the live price and the trader's own entry, stop and target lines for this instrument. */
function Chart({ candles, digits, live, positions }: { candles: Candle[]; digits: number; live: number | null; positions: ChartPosition[] }) {
  const W = 700;
  const H = 280;
  const PAD = 8;
  if (candles.length === 0) {
    return <div className="flex h-[280px] items-center justify-center text-sm text-sub">No prices recorded yet for this timeframe. The chart fills in as prices arrive.</div>;
  }
  // The newest candle follows the live price, so the chart and the order ticket agree.
  const cs = candles.map((c) => ({ o: Number(c.o), h: Number(c.h), l: Number(c.l), c: Number(c.c) }));
  if (live !== null) {
    const last = cs[cs.length - 1];
    last.c = live;
    last.h = Math.max(last.h, live);
    last.l = Math.min(last.l, live);
  }
  const lines: { y: number; color: string; dash?: string; label: string }[] = [];
  const levels = positions.flatMap((p) => [
    { v: Number(p.openPrice), color: "#2e9bf0", label: "entry" },
    ...(p.stopLoss ? [{ v: Number(p.stopLoss), color: "#d96b66", label: "stop" }] : []),
    ...(p.takeProfit ? [{ v: Number(p.takeProfit), color: "#4fbe8b", label: "target" }] : []),
  ]);
  const allValues = [...cs.flatMap((c) => [c.h, c.l]), ...levels.map((l) => l.v)];
  const mn = Math.min(...allValues);
  const mx = Math.max(...allValues);
  const rg = mx - mn || 1;
  const y = (v: number) => PAD + (1 - (v - mn) / rg) * (H - 2 * PAD);
  const cw = W / Math.max(cs.length, 20);
  for (const l of levels) lines.push({ y: y(l.v), color: l.color, dash: "3 3", label: l.label });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[280px] w-full" role="img" aria-label="Price chart">
      {[0, 1, 2, 3, 4].map((g) => (
        <line key={g} x1={0} x2={W} y1={PAD + (g * (H - 2 * PAD)) / 4} y2={PAD + (g * (H - 2 * PAD)) / 4} stroke="#1e2b3c" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {cs.map((c, i) => {
        const x = i * cw + cw / 2;
        const up = c.c >= c.o;
        const col = up ? "#4fbe8b" : "#d96b66";
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <rect x={x - cw * 0.32} y={Math.min(y(c.o), y(c.c))} width={cw * 0.64} height={Math.max(1.2, Math.abs(y(c.o) - y(c.c)))} fill={col} />
          </g>
        );
      })}
      {lines.map((l, i) => (
        <line key={i} x1={0} x2={W} y1={l.y} y2={l.y} stroke={l.color} strokeDasharray={l.dash} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {live !== null && <line x1={0} x2={W} y1={y(live)} y2={y(live)} stroke="#7b8ca3" strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      <text x={W - 4} y={12} textAnchor="end" fontSize="11" fill="#7b8ca3">{mx.toFixed(digits)}</text>
      <text x={W - 4} y={H - 4} textAnchor="end" fontSize="11" fill="#7b8ca3">{mn.toFixed(digits)}</text>
    </svg>
  );
}
