import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  TrendingUp, TrendingDown, X, Activity, AlertTriangle, Lock,
  ArrowUpRight, ArrowDownRight, Pause, Play
} from "lucide-react";

/* =========================================================
   SHARED DATA — same store the back office and portal use
========================================================= */
const KEY = "crm-state-v2";
let SCOPE = null;

async function loadState() {
  if (!(typeof window !== "undefined" && window.storage)) { SCOPE = "none"; return null; }
  for (const shared of [true, false]) {
    try {
      const r = await window.storage.get(KEY, shared);
      SCOPE = shared;
      if (r) return JSON.parse(r.value);
    } catch (e) { /* next */ }
  }
  if (SCOPE === null) SCOPE = "none";
  return null;
}
async function saveState(s) {
  if (SCOPE === "none" || !(typeof window !== "undefined" && window.storage)) return false;
  for (const shared of SCOPE === null ? [true, false] : [SCOPE, !SCOPE]) {
    try {
      const r = await window.storage.set(KEY, JSON.stringify(s), shared);
      if (r) { SCOPE = shared; return true; }
    } catch (e) { /* next */ }
  }
  return false;
}

/* =========================================================
   INSTRUMENTS
   contractSize = units per 1.00 lot
   pipSize      = price increment that defines one pip
   Prices here are SIMULATED. In production these come from a
   licensed market data feed; everything downstream is unchanged.
========================================================= */
const INSTRUMENTS = [
  { symbol: "EURUSD", name: "Euro / US Dollar",     price: 1.0842, pipSize: 0.0001, contractSize: 100000, spread: 0.6, vol: 0.00012, digits: 5 },
  { symbol: "GBPUSD", name: "Pound / US Dollar",    price: 1.2715, pipSize: 0.0001, contractSize: 100000, spread: 0.9, vol: 0.00015, digits: 5 },
  { symbol: "USDJPY", name: "US Dollar / Yen",      price: 151.42, pipSize: 0.01,   contractSize: 100000, spread: 0.8, vol: 0.014,   digits: 3 },
  { symbol: "XAUUSD", name: "Gold / US Dollar",     price: 2338.5, pipSize: 0.1,    contractSize: 100,    spread: 2.4, vol: 0.28,    digits: 2 },
  { symbol: "US100",  name: "Nasdaq 100",           price: 18240,  pipSize: 1,      contractSize: 1,      spread: 1.5, vol: 4.2,     digits: 1 },
  { symbol: "BTCUSD", name: "Bitcoin / US Dollar",  price: 63420,  pipSize: 1,      contractSize: 1,      spread: 18,  vol: 22,      digits: 1 },
];

const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now() + Math.random().toString(16).slice(2));
const hhmm = (d) => new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/* Profit in account currency for a position at a given price. */
function positionPnl(pos, price) {
  const inst = INSTRUMENTS.find((i) => i.symbol === pos.symbol);
  if (!inst) return 0;
  const diff = (price - pos.entry) * (pos.side === "buy" ? 1 : -1);
  const units = pos.lots * inst.contractSize;
  // USD-quoted pairs and instruments: value is linear in units.
  // USDJPY is quote-currency JPY, so convert back through current price.
  if (pos.symbol === "USDJPY") return (diff * units) / price;
  return diff * units;
}

export default function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paste, setPaste] = useState("");
  const [accountId, setAccountId] = useState(null);

  const [prices, setPrices] = useState(() =>
    Object.fromEntries(INSTRUMENTS.map((i) => [i.symbol, i.price]))
  );
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [symbol, setSymbol] = useState("EURUSD");
  const [lots, setLots] = useState(0.10);
  const [slPips, setSlPips] = useState("");
  const [tpPips, setTpPips] = useState("");
  const [msg, setMsg] = useState(null);
  const historyRef = useRef({});

  /* ---------- load shared data ---------- */
  useEffect(() => {
    (async () => {
      const s = await loadState();
      if (s) setState(s);
      setLoading(false);
    })();
  }, []);

  const traders = state?.traders || [];
  const templates = state?.templates || [];
  const account = traders.find((t) => t.id === accountId);
  const tpl = account ? templates.find((x) => x.id === account.templateId) : null;

  /* ---------- price ticking ---------- */
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setPrices((prev) => {
        const next = { ...prev };
        INSTRUMENTS.forEach((i) => {
          // random walk with slight mean reversion toward the seed price
          const drift = (i.price - prev[i.symbol]) * 0.002;
          const shock = (Math.random() - 0.5) * 2 * i.vol;
          const p = prev[i.symbol] + shock + drift;
          next[i.symbol] = Math.max(p, i.price * 0.5);
          const h = historyRef.current[i.symbol] || [];
          h.push(next[i.symbol]);
          historyRef.current[i.symbol] = h.slice(-80);
        });
        return next;
      });
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [running, speed]);

  /* ---------- derived account figures ---------- */
  const positions = account?.positions || [];
  const openPnl = useMemo(
    () => positions.reduce((s, p) => s + positionPnl(p, prices[p.symbol]), 0),
    [positions, prices]
  );
  const balance = account?.balance ?? (tpl?.accountSize || 0);
  const equity = balance + openPnl;

  const rules = useMemo(() => {
    if (!tpl || !account) return null;
    const target = tpl.accountSize * (tpl.profitTargetPct / 100);
    const dailyCap = tpl.accountSize * (tpl.dailyLossPct / 100);
    const maxCap = tpl.accountSize * (tpl.maxLossPct / 100);
    const peak = Math.max(account.peakEquity || tpl.accountSize, equity);
    const floor = tpl.drawdownType === "Trailing" ? peak - maxCap : tpl.accountSize - maxCap;
    const dailyFloor = (account.dayStartEquity ?? tpl.accountSize) - dailyCap;
    return { target, dailyCap, maxCap, peak, floor, dailyFloor };
  }, [tpl, account, equity]);

  /* ---------- persist account state to the shared store ---------- */
  const pushAccount = useCallback(async (patch, extraTraders) => {
    if (!account) return;
    const updated = { ...account, ...patch };
    const next = {
      ...state,
      traders: (extraTraders || traders).map((t) => (t.id === account.id ? updated : t)),
    };
    setState(next);
    await saveState(next);
  }, [account, state, traders]);

  /* ---------- rule enforcement on every tick ---------- */
  useEffect(() => {
    if (!account || !rules || account.status !== "Active") return;
    const breachDaily = equity <= rules.dailyFloor;
    const breachTotal = equity <= rules.floor;
    if (breachDaily || breachTotal) {
      const reason = breachDaily ? "Daily loss limit" : `Max loss limit (${tpl.drawdownType.toLowerCase()})`;
      // close every position at market, bank the loss, mark breached
      const realised = positions.reduce((s, p) => s + positionPnl(p, prices[p.symbol]), 0);
      pushAccount({
        positions: [],
        balance: balance + realised,
        equity: balance + realised,
        peakEquity: rules.peak,
        status: "Breached",
        phase: "Closed",
        notes: [{ date: new Date().toISOString(), text: `${reason} breached at ${money(equity)} — all positions closed by the engine.` }, ...(account.notes || [])],
      });
      setMsg({ bad: true, t: `${reason} breached. Account closed and all positions liquidated.` });
      return;
    }
    const pnlTotal = equity - tpl.accountSize;
    if (pnlTotal >= rules.target && (account.tradingDays || 0) >= tpl.minTradingDays && account.phase === "Evaluation") {
      pushAccount({ phase: "Pass review", equity, peakEquity: rules.peak });
      setMsg({ t: "Profit target met. Account sent to pass review." });
    }
  }, [equity]); // eslint-disable-line

  /* ---------- SL / TP execution ---------- */
  useEffect(() => {
    if (!account || positions.length === 0) return;
    const hit = positions.find((p) => {
      const px = prices[p.symbol];
      if (p.sl && ((p.side === "buy" && px <= p.sl) || (p.side === "sell" && px >= p.sl))) return true;
      if (p.tp && ((p.side === "buy" && px >= p.tp) || (p.side === "sell" && px <= p.tp))) return true;
      return false;
    });
    if (hit) closePosition(hit.id, true);
  }, [prices]); // eslint-disable-line

  /* ---------- trading actions ---------- */
  const inst = INSTRUMENTS.find((i) => i.symbol === symbol);
  const mid = prices[symbol];
  const ask = mid + (inst.spread * inst.pipSize) / 2;
  const bid = mid - (inst.spread * inst.pipSize) / 2;

  const openPosition = async (side) => {
    if (!account || account.status !== "Active") return;
    const entry = side === "buy" ? ask : bid;
    const sl = slPips ? entry + (side === "buy" ? -1 : 1) * Number(slPips) * inst.pipSize : null;
    const tp = tpPips ? entry + (side === "buy" ? 1 : -1) * Number(tpPips) * inst.pipSize : null;
    const pos = {
      id: uid(), symbol, side, lots: Number(lots), entry, sl, tp,
      opened: new Date().toISOString(),
    };
    await pushAccount({
      positions: [...positions, pos],
      tradingDays: account.tradingDays || 0,
    });
    setMsg({ t: `${side === "buy" ? "Buy" : "Sell"} ${lots} ${symbol} at ${entry.toFixed(inst.digits)}` });
  };

  const closePosition = async (id, auto) => {
    const pos = positions.find((p) => p.id === id);
    if (!pos || !account) return;
    const px = prices[pos.symbol];
    const realised = positionPnl(pos, px);
    const newBalance = balance + realised;
    const closed = {
      ...pos, closedAt: new Date().toISOString(), exit: px, pnl: realised, auto: !!auto,
    };
    await pushAccount({
      positions: positions.filter((p) => p.id !== id),
      balance: newBalance,
      equity: newBalance + positions.filter((p) => p.id !== id)
        .reduce((s, p) => s + positionPnl(p, prices[p.symbol]), 0),
      peakEquity: Math.max(account.peakEquity || 0, newBalance),
      tradingDays: (account.tradingDays || 0) + ((account.closed || []).length === 0 ? 1 : 0),
      closed: [closed, ...(account.closed || [])].slice(0, 100),
    });
    setMsg({ bad: realised < 0, t: `Closed ${pos.symbol} ${auto ? "(SL/TP) " : ""}for ${money(realised)}` });
  };

  const closeAll = async () => {
    if (!account || positions.length === 0) return;
    const realised = positions.reduce((s, p) => s + positionPnl(p, prices[p.symbol]), 0);
    const nb = balance + realised;
    const closedRecords = positions.map((p) => ({
      ...p, closedAt: new Date().toISOString(), exit: prices[p.symbol], pnl: positionPnl(p, prices[p.symbol]),
    }));
    await pushAccount({
      positions: [], balance: nb, equity: nb,
      peakEquity: Math.max(account.peakEquity || 0, nb),
      closed: [...closedRecords, ...(account.closed || [])].slice(0, 100),
    });
    setMsg({ bad: realised < 0, t: `Closed all positions for ${money(realised)}` });
  };

  const importPaste = () => {
    try {
      const parsed = JSON.parse(paste);
      if (!parsed || !Array.isArray(parsed.traders)) { setMsg({ bad: true, t: "Not a CRM backup." }); return; }
      setState(parsed); setPaste(""); setMsg(null);
    } catch (e) { setMsg({ bad: true, t: "Invalid JSON." }); }
  };

  /* =========================================================
     RENDER
  ========================================================= */
  if (loading) return <div className="tp"><style>{CSS}</style><div className="mid dim">Loading…</div></div>;

  if (!account) {
    const tradable = traders.filter((t) => !t.voided);
    return (
      <div className="tp">
        <style>{CSS}</style>
        <div className="mid">
          <div className="brand">ELUVATE <span>TERMINAL</span></div>
          <p className="dim sm" style={{ maxWidth: 380, textAlign: "center", lineHeight: 1.6 }}>
            Simulated execution against a synthetic price feed. Every fill, position and equity change
            is written back to the same record the back office reads.
          </p>
          {tradable.length === 0 ? (
            <div className="card" style={{ maxWidth: 400 }}>
              <div className="ttl">No accounts found</div>
              <p className="dim sm">Paste the back-office backup to load accounts onto this device.</p>
              <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste CRM backup JSON" />
              <button className="btn" disabled={!paste.trim()} onClick={importPaste}>Load accounts</button>
            </div>
          ) : (
            <div className="card" style={{ maxWidth: 440 }}>
              <div className="ttl">Select an account to trade</div>
              {tradable.map((t) => {
                const at = templates.find((x) => x.id === t.templateId);
                return (
                  <button key={t.id} className="acct" onClick={() => setAccountId(t.id)} disabled={t.status !== "Active"}>
                    <div>
                      <div>{t.name}</div>
                      <div className="dim xs">{at?.name} · {t.email}</div>
                    </div>
                    <span className={"pill " + (t.status === "Active" ? "on" : "")}>{t.status}</span>
                  </button>
                );
              })}
            </div>
          )}
          {msg && <div className={"alert " + (msg.bad ? "bad" : "good")}>{msg.t}</div>}
        </div>
      </div>
    );
  }

  const locked = account.status !== "Active";

  return (
    <div className="tp">
      <style>{CSS}</style>

      {/* header */}
      <div className="bar">
        <div className="brand sm-brand">ELUVATE <span>TERMINAL</span></div>
        <div className="figs">
          <div><span className="dim xs">Balance</span><span className="mono">{money(balance)}</span></div>
          <div><span className="dim xs">Equity</span><span className="mono lg">{money(equity)}</span></div>
          <div><span className="dim xs">Open P&L</span>
            <span className={"mono " + (openPnl >= 0 ? "up" : "dn")}>{openPnl >= 0 ? "+" : ""}{money(openPnl)}</span></div>
        </div>
        <div className="ctrl">
          <button className="ico" onClick={() => setRunning(!running)} title={running ? "Pause feed" : "Resume feed"}>
            {running ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={1}>1×</option><option value={4}>4×</option><option value={10}>10×</option>
          </select>
          <button className="ghost xs-btn" onClick={() => setAccountId(null)}>Switch</button>
        </div>
      </div>

      {locked && (
        <div className="alert bad"><Lock size={13} /> Account {account.status.toLowerCase()} — trading disabled.</div>
      )}
      {msg && <div className={"alert " + (msg.bad ? "bad" : "good")}>{msg.t}</div>}

      {/* rule strip */}
      {rules && tpl && (
        <div className="rules">
          <RuleBar label="Profit target" value={equity - tpl.accountSize} limit={rules.target} kind="target" />
          <RuleBar label="Daily loss" value={Math.max(0, (account.dayStartEquity ?? tpl.accountSize) - equity)} limit={rules.dailyCap} kind="loss"
            foot={`Floor ${money(rules.dailyFloor)}`} />
          <RuleBar label={`Max loss (${tpl.drawdownType.toLowerCase()})`} value={Math.max(0, rules.peak - equity)} limit={rules.maxCap} kind="loss"
            foot={`Floor ${money(rules.floor)}`} />
        </div>
      )}

      <div className="grid">
        {/* watchlist */}
        <div className="panel">
          <div className="ph">Market <Activity size={13} className={running ? "pulse" : ""} /></div>
          {INSTRUMENTS.map((i) => {
            const p = prices[i.symbol];
            const up = p >= i.price;
            return (
              <button key={i.symbol} className={"row" + (symbol === i.symbol ? " sel" : "")} onClick={() => setSymbol(i.symbol)}>
                <div>
                  <div className="sym">{i.symbol}</div>
                  <div className="dim xs">{i.name}</div>
                </div>
                <div className="px">
                  <span className={"mono " + (up ? "up" : "dn")}>{p.toFixed(i.digits)}</span>
                  {up ? <ArrowUpRight size={12} className="up" /> : <ArrowDownRight size={12} className="dn" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* ticket */}
        <div className="panel">
          <div className="ph">{symbol}</div>
          <Spark data={historyRef.current[symbol] || []} />
          <div className="quote">
            <div className="q sell"><span className="dim xs">SELL</span><span className="mono">{bid.toFixed(inst.digits)}</span></div>
            <div className="sprd dim xs">{inst.spread} pip</div>
            <div className="q buy"><span className="dim xs">BUY</span><span className="mono">{ask.toFixed(inst.digits)}</span></div>
          </div>

          <label className="f"><span className="dim xs">Volume (lots)</span>
            <input className="mono" type="number" step="0.01" min="0.01" value={lots} onChange={(e) => setLots(e.target.value)} /></label>
          <div className="two">
            <label className="f"><span className="dim xs">Stop loss (pips)</span>
              <input className="mono" type="number" value={slPips} onChange={(e) => setSlPips(e.target.value)} placeholder="—" /></label>
            <label className="f"><span className="dim xs">Take profit (pips)</span>
              <input className="mono" type="number" value={tpPips} onChange={(e) => setTpPips(e.target.value)} placeholder="—" /></label>
          </div>
          <div className="dim xs">
            1.00 lot = {inst.contractSize.toLocaleString()} units · ~{money(inst.contractSize * inst.pipSize * Number(lots || 0))} per pip
          </div>
          <div className="two">
            <button className="btn dn-btn" disabled={locked} onClick={() => openPosition("sell")}><TrendingDown size={15} /> Sell</button>
            <button className="btn up-btn" disabled={locked} onClick={() => openPosition("buy")}><TrendingUp size={15} /> Buy</button>
          </div>
        </div>

        {/* positions */}
        <div className="panel wide">
          <div className="ph">
            Open positions ({positions.length})
            {positions.length > 0 && <button className="ghost xs-btn" style={{ marginLeft: "auto" }} onClick={closeAll}>Close all</button>}
          </div>
          {positions.length === 0 ? (
            <div className="dim sm" style={{ padding: "14px 0" }}>No open positions.</div>
          ) : (
            <table>
              <thead><tr><th>Symbol</th><th>Side</th><th>Lots</th><th>Entry</th><th>Now</th><th>SL / TP</th><th>P&L</th><th></th></tr></thead>
              <tbody>
                {positions.map((p) => {
                  const i = INSTRUMENTS.find((x) => x.symbol === p.symbol);
                  const pnl = positionPnl(p, prices[p.symbol]);
                  return (
                    <tr key={p.id}>
                      <td className="sym">{p.symbol}</td>
                      <td><span className={"side " + p.side}>{p.side.toUpperCase()}</span></td>
                      <td className="mono">{Number(p.lots).toFixed(2)}</td>
                      <td className="mono">{p.entry.toFixed(i.digits)}</td>
                      <td className="mono">{prices[p.symbol].toFixed(i.digits)}</td>
                      <td className="mono xs">{p.sl ? p.sl.toFixed(i.digits) : "—"} / {p.tp ? p.tp.toFixed(i.digits) : "—"}</td>
                      <td className={"mono strong " + (pnl >= 0 ? "up" : "dn")}>{pnl >= 0 ? "+" : ""}{money(pnl)}</td>
                      <td><button className="ico" onClick={() => closePosition(p.id)}><X size={14} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {(account.closed || []).length > 0 && (
            <>
              <div className="ph" style={{ marginTop: 14 }}>Recent closed</div>
              <table>
                <tbody>
                  {(account.closed || []).slice(0, 6).map((c) => (
                    <tr key={c.id + c.closedAt}>
                      <td className="sym">{c.symbol}</td>
                      <td><span className={"side " + c.side}>{c.side.toUpperCase()}</span></td>
                      <td className="mono">{Number(c.lots).toFixed(2)}</td>
                      <td className="dim xs">{hhmm(c.closedAt)}{c.auto ? " · SL/TP" : ""}</td>
                      <td className={"mono strong " + (c.pnl >= 0 ? "up" : "dn")}>{c.pnl >= 0 ? "+" : ""}{money(c.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleBar({ label, value, limit, kind, foot }) {
  const pct = limit ? Math.min(100, Math.max(0, (value / limit) * 100)) : 0;
  const danger = kind === "loss" && pct >= 100;
  const warn = kind === "loss" && pct >= 70;
  const col = danger ? "#E05A54" : warn ? "#D9A441" : kind === "target" && pct >= 100 ? "#4FBE8B" : "#2E9BF0";
  return (
    <div className="rule">
      <div className="rh"><span className="dim xs">{label}</span>
        <span className="mono xs">{money(value)} / {money(limit)}</span></div>
      <div className="trk"><div className="fil" style={{ width: pct + "%", background: col }} /></div>
      {foot && <div className="dim xs" style={{ marginTop: 4 }}>{foot}</div>}
    </div>
  );
}

function Spark({ data }) {
  if (!data || data.length < 2) return <div className="spark empty" />;
  const W = 300, H = 56;
  const lo = Math.min(...data), hi = Math.max(...data);
  const rng = hi - lo || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - lo) / rng) * H}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={up ? "#4FBE8B" : "#E05A54"} strokeWidth="1.5" />
    </svg>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500&display=swap');
*{box-sizing:border-box}
.tp{--bg:#070C14;--surf:#0D1620;--raise:#131F2C;--ink:#E8EEF6;--dim:#7B8CA3;--bd:#1D2A3A;--acc:#2E9BF0;
  font-family:'IBM Plex Sans',sans-serif;background:var(--bg);color:var(--ink);min-height:620px;
  border:1px solid var(--bd);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:11px}
.mono{font-family:'IBM Plex Mono',monospace}
.dim{color:var(--dim)} .sm{font-size:12.5px} .xs{font-size:11px} .lg{font-size:19px} .strong{font-weight:600}
.up{color:#4FBE8B} .dn{color:#E05A54}
.mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
.brand{font-family:'Space Grotesk',sans-serif;letter-spacing:.26em;font-size:20px}
.brand span{color:var(--acc);font-size:11px;letter-spacing:.3em}
.sm-brand{font-size:13px}
.card{background:var(--surf);border:1px solid var(--bd);border-radius:9px;padding:16px;display:flex;
  flex-direction:column;gap:9px;width:100%}
.ttl{font-family:'Space Grotesk',sans-serif;font-size:14px}
.acct{background:var(--raise);border:1px solid var(--bd);border-radius:7px;padding:10px 12px;display:flex;
  justify-content:space-between;align-items:center;cursor:pointer;font-family:inherit;color:var(--ink);font-size:13px;text-align:left}
.acct:hover:not(:disabled){border-color:var(--acc)}
.acct:disabled{opacity:.45;cursor:not-allowed}
.pill{font-size:11px;color:var(--dim);border:1px solid var(--bd);border-radius:5px;padding:2px 7px}
.pill.on{color:#4FBE8B;border-color:#1C3D31}

.bar{display:flex;align-items:center;gap:16px;background:var(--surf);border:1px solid var(--bd);
  border-radius:9px;padding:11px 14px;flex-wrap:wrap}
.figs{display:flex;gap:20px;flex:1}
.figs div{display:flex;flex-direction:column;gap:2px}
.ctrl{display:flex;gap:7px;align-items:center}
.ico{background:none;border:1px solid var(--bd);border-radius:6px;color:var(--dim);cursor:pointer;padding:5px 7px}
.ico:hover{border-color:var(--acc);color:var(--acc)}
select{background:var(--bg);border:1px solid var(--bd);color:var(--ink);border-radius:6px;padding:5px 7px;
  font-family:'IBM Plex Mono';font-size:11.5px}
.ghost{background:none;border:1px solid var(--bd);color:var(--ink);border-radius:6px;padding:6px 11px;
  font-size:12px;cursor:pointer;font-family:inherit}
.ghost:hover{border-color:var(--acc);color:var(--acc)}
.xs-btn{padding:4px 9px;font-size:11.5px}

.alert{border-radius:7px;padding:9px 12px;font-size:12.5px;display:flex;align-items:center;gap:7px}
.alert.good{background:#0F2620;color:#5FCB98;border:1px solid #1C3D31}
.alert.bad{background:#241417;color:#E8938E;border:1px solid #3A2326}

.rules{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.rule{background:var(--surf);border:1px solid var(--bd);border-radius:8px;padding:11px 12px}
.rh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}
.trk{height:5px;background:#182634;border-radius:3px;overflow:hidden}
.fil{height:100%;border-radius:3px;transition:width .3s}

.grid{display:grid;grid-template-columns:1fr 1fr;gap:11px;flex:1}
.panel{background:var(--surf);border:1px solid var(--bd);border-radius:9px;padding:13px;display:flex;flex-direction:column;gap:8px}
.panel.wide{grid-column:1 / -1}
.ph{font-family:'Space Grotesk',sans-serif;font-size:13px;display:flex;align-items:center;gap:7px;
  padding-bottom:8px;border-bottom:1px solid var(--bd)}
.pulse{color:#4FBE8B;animation:p 1.6s infinite}
@keyframes p{0%,100%{opacity:1}50%{opacity:.25}}

.row{display:flex;justify-content:space-between;align-items:center;background:none;border:none;
  border-bottom:1px solid var(--bd);padding:8px 4px;cursor:pointer;font-family:inherit;color:var(--ink);text-align:left}
.row:last-child{border-bottom:none}
.row.sel{background:#102132;border-radius:6px}
.sym{font-family:'IBM Plex Mono';font-size:12.5px;font-weight:600}
.px{display:flex;align-items:center;gap:5px}

.spark{width:100%;height:56px}
.spark.empty{background:var(--raise);border-radius:6px}
.quote{display:flex;align-items:center;gap:9px}
.q{flex:1;border:1px solid var(--bd);border-radius:7px;padding:9px;display:flex;flex-direction:column;gap:2px;align-items:center}
.q.sell{border-color:#3A2326} .q.buy{border-color:#1C3D31}
.q .mono{font-size:15px;font-weight:600}
.sprd{white-space:nowrap}
.f{display:flex;flex-direction:column;gap:4px}
input,textarea{background:var(--bg);border:1px solid var(--bd);color:var(--ink);border-radius:6px;
  padding:8px 10px;font-family:inherit;font-size:13px;width:100%}
input:focus,textarea:focus{outline:none;border-color:var(--acc)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btn{border:none;border-radius:6px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;
  display:flex;align-items:center;justify-content:center;gap:6px;font-family:inherit;background:var(--acc);color:#04121F}
.btn:disabled{opacity:.35;cursor:not-allowed}
.up-btn{background:#2F9E6B;color:#04180F}
.dn-btn{background:#C0504A;color:#1B0808}

table{width:100%;border-collapse:collapse}
thead th{text-align:left;font-size:10.5px;color:var(--dim);font-weight:500;padding:6px 6px;
  border-bottom:1px solid var(--bd);text-transform:uppercase;letter-spacing:.04em}
tbody td{padding:8px 6px;font-size:12.5px;border-bottom:1px solid var(--bd)}
tbody tr:last-child td{border-bottom:none}
.side{font-size:10.5px;font-weight:600;padding:2px 6px;border-radius:4px}
.side.buy{background:#10281F;color:#4FBE8B}
.side.sell{background:#2A1618;color:#E8938E}
`;
