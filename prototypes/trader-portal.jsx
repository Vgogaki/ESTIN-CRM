import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard, Trophy, Banknote, Medal, LogOut, ArrowRight,
  AlertTriangle, CheckCircle2, Clock, ShieldCheck, TrendingUp
} from "lucide-react";

/* Reads the SAME storage key the back office writes to.
   Two interfaces, one dataset — this is the API relationship, made literal. */
const KEY = "crm-state-v2";
let SCOPE = null;

async function loadState() {
  if (!(typeof window !== "undefined" && window.storage)) { SCOPE = "none"; return null; }
  for (const shared of [true, false]) {
    try {
      const r = await window.storage.get(KEY, shared);
      SCOPE = shared;
      if (r) return JSON.parse(r.value);
    } catch (e) { /* try next */ }
  }
  if (SCOPE === null) SCOPE = "none";
  return null;
}

async function saveState(s) {
  if (SCOPE === "none" || !(typeof window !== "undefined" && window.storage)) return false;
  const payload = JSON.stringify(s);
  for (const shared of SCOPE === null ? [true, false] : [SCOPE, !SCOPE]) {
    try {
      const res = await window.storage.set(KEY, payload, shared);
      if (res) { SCOPE = shared; return true; }
    } catch (e) { /* try next */ }
  }
  SCOPE = "none";
  return false;
}

const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const dt = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now() + Math.random().toString(16).slice(2));

const TONE = {
  Active: "#D9A441", Passed: "#4FBE8B", Funded: "#2E9BF0", Breached: "#D96B66", Closed: "#7B8CA3",
  Pending: "#D9A441", Approved: "#4FBE8B", Declined: "#D96B66", Paid: "#2E9BF0",
  "Not started": "#7B8CA3", Submitted: "#D9A441", Verified: "#4FBE8B", Rejected: "#D96B66",
  Upcoming: "#5B8FC7", Live: "#4FBE8B", Ended: "#7B8CA3", Settled: "#2E9BF0",
};

function Tag({ v }) {
  return <span className="tag"><i style={{ background: TONE[v] || "#7B8CA3" }} />{v}</span>;
}

/* Objective card — mirrors the rule meters the back office enforces */
function Objective({ label, used, limit, sub, mode }) {
  const pct = limit ? Math.min(100, Math.abs(used / limit) * 100) : 0;
  const failed = mode === "loss" && pct >= 100;
  const passed = mode === "target" && pct >= 100;
  const color = failed ? "#D96B66" : passed ? "#4FBE8B" : pct >= 75 && mode === "loss" ? "#D9A441" : "#2E9BF0";
  return (
    <div className="obj">
      <div className="obj-label">{label}</div>
      <div className="obj-val mono">
        {money(used)} <span className="dim">/ {money(limit)}</span>
      </div>
      <div className="track"><div className="fill" style={{ width: pct + "%", background: color }} /></div>
      <div className="obj-sub">
        {failed ? <span className="bad"><AlertTriangle size={12} /> Limit breached</span>
          : passed ? <span className="good"><CheckCircle2 size={12} /> Objective met</span>
            : sub}
      </div>
    </div>
  );
}

/* Equity curve — only drawn when there is real history from the feed */
function EquityCurve({ history, accountSize, target, floor }) {
  if (!history || history.length < 2) {
    return (
      <div className="chart-empty">
        <TrendingUp size={22} color="#3A4A5E" />
        <div>Your equity curve appears here once trading activity is recorded.</div>
      </div>
    );
  }
  const W = 640, H = 200, pad = 8;
  const vals = history.map((h) => h.equity);
  const lo = Math.min(floor, ...vals) * 0.998;
  const hi = Math.max(target, ...vals) * 1.002;
  const x = (i) => pad + (i / (history.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2);
  const path = history.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h.equity).toFixed(1)}`).join(" ");
  const area = `${path} L${x(history.length - 1)},${H - pad} L${x(0)},${H - pad} Z`;
  const last = vals[vals.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart">
      <defs>
        <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2E9BF0" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#2E9BF0" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={pad} x2={W - pad} y1={y(target)} y2={y(target)} stroke="#4FBE8B" strokeWidth="1" strokeDasharray="4 4" />
      <text x={W - pad} y={y(target) - 5} textAnchor="end" className="cl good">Target {money(target)}</text>
      <line x1={pad} x2={W - pad} y1={y(floor)} y2={y(floor)} stroke="#D96B66" strokeWidth="1" strokeDasharray="4 4" />
      <text x={W - pad} y={y(floor) + 13} textAnchor="end" className="cl bad">Breach {money(floor)}</text>
      <line x1={pad} x2={W - pad} y1={y(accountSize)} y2={y(accountSize)} stroke="#2B3A4D" strokeWidth="1" />
      <path d={area} fill="url(#eq)" />
      <path d={path} fill="none" stroke="#2E9BF0" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(history.length - 1)} cy={y(last)} r="3.5" fill="#2E9BF0" />
    </svg>
  );
}

export default function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [me, setMe] = useState(null);          // logged-in email
  const [tab, setTab] = useState("dash");
  const [activeId, setActiveId] = useState(null);
  const [flash, setFlash] = useState(null);
  const [paste, setPaste] = useState("");

  const importPaste = () => {
    try {
      const parsed = JSON.parse(paste);
      if (!parsed || !Array.isArray(parsed.traders)) {
        setFlash({ bad: true, msg: "That does not look like a CRM backup." }); return;
      }
      setState(parsed);
      setPaste("");
      setFlash(null);
    } catch (e) {
      setFlash({ bad: true, msg: "Not valid JSON — make sure the whole backup was pasted." });
    }
  };

  const refresh = async () => {
    const s = await loadState();
    setState(s || { traders: [], templates: [], withdrawals: [], competitions: [], entries: [] });
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const traders = state?.traders || [];
  const templates = state?.templates || [];
  const withdrawals = state?.withdrawals || [];
  const competitions = state?.competitions || [];
  const entries = state?.entries || [];

  const myAccounts = useMemo(
    () => traders.filter((t) => t.email.toLowerCase() === (me || "").toLowerCase()),
    [traders, me]
  );
  const active = myAccounts.find((a) => a.id === activeId) || myAccounts[0];
  const tpl = active ? templates.find((t) => t.id === active.templateId) : null;

  const rules = useMemo(() => {
    if (!active || !tpl) return null;
    const target = tpl.accountSize * (tpl.profitTargetPct / 100);
    const daily = tpl.accountSize * (tpl.dailyLossPct / 100);
    const max = tpl.accountSize * (tpl.maxLossPct / 100);
    const pnl = active.equity - tpl.accountSize;
    const dailyUsed = Math.max(0, active.dayStartEquity - active.equity);
    const totalUsed = tpl.drawdownType === "Trailing"
      ? Math.max(0, active.peakEquity - active.equity)
      : Math.max(0, tpl.accountSize - active.equity);
    const floor = tpl.drawdownType === "Trailing" ? active.peakEquity - max : tpl.accountSize - max;
    return { target, daily, max, pnl, dailyUsed, totalUsed, floor };
  }, [active, tpl]);

  const login = () => {
    const target = email.trim().toLowerCase();
    const found = traders.some((t) => (t.email || "").trim().toLowerCase() === target);
    if (!found) {
      setFlash({
        bad: true,
        msg: traders.length === 0
          ? "No trader data loaded on this device yet — see below."
          : `No account on ${email.trim()}. Loaded emails: ${[...new Set(traders.map((t) => t.email))].join(", ")}`,
      });
      return;
    }
    setMe(email.trim()); setFlash(null);
  };

  /* Mirrors POST /api/v1/withdrawals — writes into the same queue the back office reviews */
  const requestPayout = async () => {
    if (!active || !tpl) return;
    const profit = Math.max(0, active.equity - tpl.accountSize);
    const w = {
      id: uid(), traderId: active.id, traderName: active.name, email: active.email,
      country: active.country, accountSize: tpl.accountSize, profit,
      splitPct: tpl.profitSplitPct, amount: Math.round(profit * (tpl.profitSplitPct / 100) * 100) / 100,
      kyc: active.kyc, method: "Bank transfer", status: "Pending", created: new Date().toISOString(),
    };
    const next = { ...state, withdrawals: [w, ...withdrawals] };
    setState(next); await saveState(next);
    setFlash({ msg: `Payout request for ${money(w.amount)} submitted for review.` });
  };

  const myWithdrawals = withdrawals.filter((w) => w.email?.toLowerCase() === (me || "").toLowerCase());
  const myEntries = entries.filter((e) => e.email?.toLowerCase() === (me || "").toLowerCase());

  /* ---------------- LOGIN ---------------- */
  if (loading) return <div className="app"><style>{CSS}</style><div className="center dim">Loading…</div></div>;

  if (!me) {
    return (
      <div className="app">
        <style>{CSS}</style>
        <div className="login">
          <div className="logo">ELUVATE</div>
          <div className="tagline">Trading a brighter tomorrow</div>
          <div className="login-card">
            <div className="login-title">Trader portal</div>
            <p className="dim sm">Sign in with the email on your challenge account.</p>
            <input value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()} placeholder="you@example.com" />
            <button className="btn" onClick={login}>Continue <ArrowRight size={15} /></button>
            {flash?.bad && <div className="alert bad">{flash.msg}</div>}

            {traders.length === 0 && (
              <div className="import">
                <div className="alert warn" style={{ marginBottom: 9 }}>
                  No trader data reached this device. Paste the backup from the back office
                  (sidebar → Backup / restore → Copy) to load your accounts.
                </div>
                <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)}
                  placeholder="Paste CRM backup JSON here" />
                <button className="ghost" disabled={!paste.trim()} onClick={importPaste}>Load data</button>
              </div>
            )}

            <p className="dim xs">
              No password in this prototype — real auth is a backend concern. Any trader email from the
              back office works.
            </p>
          </div>
          {traders.length > 0 && (
            <div className="hint">
              <span className="dim xs">Accounts available:</span>
              {[...new Set(traders.map((t) => t.email))].slice(0, 4).map((e) => (
                <button key={e} className="hint-chip" onClick={() => setEmail(e)}>{e}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- PORTAL ---------------- */
  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="top">
        <div className="logo sm-logo">ELUVATE</div>
        <nav className="tabs">
          {[
            { id: "dash", label: "Dashboard", icon: LayoutDashboard },
            { id: "plans", label: "My plans", icon: Trophy },
            { id: "payouts", label: "Payouts", icon: Banknote },
            { id: "comps", label: "Competitions", icon: Medal },
          ].map((t) => (
            <button key={t.id} className={"tab" + (tab === t.id ? " on" : "")} onClick={() => setTab(t.id)}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </nav>
        <div className="who">
          <span className="dim sm">{me}</span>
          <button className="ghost sm" onClick={() => { setMe(null); setTab("dash"); setFlash(null); }}><LogOut size={14} /></button>
        </div>
      </header>

      <main className="body">
        {flash && !flash.bad && <div className="alert good">{flash.msg}</div>}

        {myAccounts.length === 0 && <div className="chart-empty">No accounts on this email yet.</div>}

        {/* ---------- DASHBOARD ---------- */}
        {tab === "dash" && active && tpl && rules && (
          <>
            {myAccounts.length > 1 && (
              <div className="switcher">
                {myAccounts.map((a) => {
                  const at = templates.find((x) => x.id === a.templateId);
                  return (
                    <button key={a.id} className={"sw" + (a.id === active.id ? " on" : "")} onClick={() => setActiveId(a.id)}>
                      {at?.name} <Tag v={a.status} />
                    </button>
                  );
                })}
              </div>
            )}

            <div className="hero">
              <div>
                <div className="dim sm">{tpl.name} · {active.phase}</div>
                <div className="equity mono">{money(active.equity)}</div>
                <div className={"pnl mono " + (rules.pnl >= 0 ? "good" : "bad")}>
                  {rules.pnl >= 0 ? "+" : ""}{money(rules.pnl)} since start
                </div>
              </div>
              <div className="hero-side">
                <Tag v={active.status} />
                <div className="dim xs">Started {dt(active.startDate)}</div>
              </div>
            </div>

            <div className="objs">
              <Objective mode="target" label="Profit target" used={Math.max(0, rules.pnl)} limit={rules.target}
                sub={`${money(Math.max(0, rules.target - rules.pnl))} to go`} />
              <Objective mode="loss" label="Daily loss used" used={rules.dailyUsed} limit={rules.daily}
                sub={`${money(Math.max(0, rules.daily - rules.dailyUsed))} buffer left today`} />
              <Objective mode="loss" label={`Max loss · ${tpl.drawdownType.toLowerCase()}`} used={rules.totalUsed} limit={rules.max}
                sub={`Account closes below ${money(rules.floor)}`} />
            </div>

            <div className="panel">
              <div className="panel-head">Equity curve</div>
              <EquityCurve history={active.history} accountSize={tpl.accountSize}
                target={tpl.accountSize + rules.target} floor={rules.floor} />
            </div>

            <div className="two">
              <div className="panel">
                <div className="panel-head">Your objectives</div>
                <div className="rule-row"><span>Minimum trading days</span>
                  <span className="mono">{active.tradingDays} / {tpl.minTradingDays}
                    {active.tradingDays >= tpl.minTradingDays && <CheckCircle2 size={13} color="#4FBE8B" style={{ marginLeft: 6 }} />}
                  </span></div>
                <div className="rule-row"><span>Profit target</span><span className="mono">{tpl.profitTargetPct}%</span></div>
                <div className="rule-row"><span>Daily loss limit</span><span className="mono">{tpl.dailyLossPct}%</span></div>
                <div className="rule-row"><span>Max loss limit</span><span className="mono">{tpl.maxLossPct}% {tpl.drawdownType.toLowerCase()}</span></div>
                <div className="rule-row"><span>Your profit share</span><span className="mono">{tpl.profitSplitPct}%</span></div>
                <div className="rule-row"><span>Payout cycle</span><span className="mono">every {tpl.payoutCycleDays} days</span></div>
              </div>

              <div className="panel">
                <div className="panel-head">Verification</div>
                <div className="kyc">
                  <ShieldCheck size={17} color={TONE[active.kyc]} />
                  <div>
                    <div>KYC · <Tag v={active.kyc} /></div>
                    <div className="dim xs">
                      {active.kyc === "Verified" ? "You are cleared for payouts."
                        : active.kyc === "Submitted" ? "Documents received and under review."
                          : active.kyc === "Rejected" ? "Documents were not accepted — please resubmit."
                            : `Required ${tpl.kycTiming.toLowerCase()}.`}
                    </div>
                  </div>
                </div>
                {active.kyc === "Not started" && <button className="ghost">Upload documents</button>}
              </div>
            </div>
          </>
        )}

        {/* ---------- MY PLANS ---------- */}
        {tab === "plans" && (
          <>
            <h2>My plans</h2>
            {myAccounts.map((a) => {
              const at = templates.find((x) => x.id === a.templateId);
              const p = at ? a.equity - at.accountSize : 0;
              const steps = ["Evaluation", "Pass review", "Funded"];
              const idx = steps.indexOf(a.phase);
              return (
                <div key={a.id} className="plan">
                  <div className="plan-main">
                    <div>
                      <div className="plan-name">{at?.name}</div>
                      <div className="dim xs">Purchased {dt(a.startDate)}</div>
                    </div>
                    <div className="stepper">
                      {steps.map((s, i) => (
                        <div key={s} className={"step" + (i <= idx ? " on" : "")}>
                          <span className="node" />{s}
                        </div>
                      ))}
                    </div>
                    <div className="plan-fig">
                      <div className="mono strong">{money(a.equity)}</div>
                      <div className={"mono xs " + (p >= 0 ? "good" : "bad")}>{p >= 0 ? "+" : ""}{money(p)}</div>
                    </div>
                    <Tag v={a.status} />
                  </div>
                  <button className="ghost sm" onClick={() => { setActiveId(a.id); setTab("dash"); }}>View stats</button>
                </div>
              );
            })}
          </>
        )}

        {/* ---------- PAYOUTS ---------- */}
        {tab === "payouts" && (
          <>
            <h2>Payouts</h2>
            {active && tpl && (
              <div className="panel">
                <div className="panel-head">Request a payout</div>
                {active.phase !== "Funded" ? (
                  <p className="dim sm">Payouts unlock once your account is funded. Keep going.</p>
                ) : active.kyc !== "Verified" ? (
                  <div className="alert warn">Verification must be completed before a payout can be released.</div>
                ) : (
                  <>
                    <div className="rule-row"><span>Profit on account</span>
                      <span className="mono">{money(Math.max(0, active.equity - tpl.accountSize))}</span></div>
                    <div className="rule-row"><span>Your share ({tpl.profitSplitPct}%)</span>
                      <span className="mono strong">{money(Math.max(0, active.equity - tpl.accountSize) * tpl.profitSplitPct / 100)}</span></div>
                    <button className="btn" onClick={requestPayout}>Request payout</button>
                  </>
                )}
              </div>
            )}
            <div className="panel">
              <div className="panel-head">History</div>
              {myWithdrawals.length === 0 && <p className="dim sm">No payout requests yet.</p>}
              {myWithdrawals.map((w) => (
                <div key={w.id} className="rule-row">
                  <span>{dt(w.created)} · {w.method}</span>
                  <span className="mono">{money(w.amount)} <Tag v={w.status} /></span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---------- COMPETITIONS ---------- */}
        {tab === "comps" && (
          <>
            <h2>Competitions</h2>
            {competitions.length === 0 && <p className="dim sm">No competitions running right now.</p>}
            {competitions.map((c) => {
              const ents = entries.filter((e) => e.competitionId === c.id);
              const ranked = ents
                .filter((e) => e.status !== "Disqualified" && e.trades >= c.minTrades)
                .map((e) => ({ ...e, ret: c.accountSize ? ((e.equity - c.accountSize) / c.accountSize) * 100 : 0 }))
                .sort((a, b) => b.ret - a.ret);
              const mine = myEntries.find((e) => e.competitionId === c.id);
              const myRank = mine ? ranked.findIndex((r) => r.id === mine.id) + 1 : 0;
              return (
                <div key={c.id} className="panel">
                  <div className="panel-head">
                    {c.name} <Tag v={c.status} />
                  </div>
                  <div className="dim xs" style={{ marginBottom: 10 }}>
                    {dt(c.startDate)} – {dt(c.endDate)} · {c.entryFee ? money(c.entryFee) + " entry" : "Free entry"} · ranked by {c.rankBy}
                  </div>
                  {mine && (
                    <div className="myrank">
                      <span className="dim xs">Your position</span>
                      <span className="mono strong">{myRank ? "#" + myRank : "Not qualified"}</span>
                      {mine.trades < c.minTrades && <span className="dim xs">{c.minTrades - mine.trades} more trades to qualify</span>}
                    </div>
                  )}
                  {ranked.slice(0, 5).map((e, i) => (
                    <div key={e.id} className={"lb" + (mine && e.id === mine.id ? " me" : "")}>
                      <span className={"rk" + (i < c.prizes.length ? " prize" : "")}>{i + 1}</span>
                      <span style={{ flex: 1 }}>{e.name}</span>
                      <span className={"mono " + (e.ret >= 0 ? "good" : "bad")}>{e.ret >= 0 ? "+" : ""}{e.ret.toFixed(2)}%</span>
                    </div>
                  ))}
                  {ranked.length === 0 && <p className="dim sm">Leaderboard opens once entrants start trading.</p>}
                </div>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500&display=swap');
*{box-sizing:border-box}
.app{
  --bg:#070C14;--surf:#0D1620;--raise:#131F2C;--ink:#E8EEF6;--dim:#7B8CA3;--bd:#1D2A3A;--acc:#2E9BF0;
  font-family:'IBM Plex Sans',sans-serif;background:var(--bg);color:var(--ink);
  min-height:620px;border:1px solid var(--bd);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;
}
.mono{font-family:'IBM Plex Mono',monospace}
.dim{color:var(--dim)} .sm{font-size:12.5px} .xs{font-size:11.5px} .strong{font-weight:600}
.good{color:#4FBE8B} .bad{color:#D96B66}
h2{font-family:'Space Grotesk',sans-serif;font-size:19px;margin:0 0 14px;font-weight:600}
.center{padding:60px;text-align:center}

.logo{font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.3em;font-size:26px;
  background:linear-gradient(92deg,#E8EEF6 40%,#2E9BF0);-webkit-background-clip:text;background-clip:text;color:transparent}
.sm-logo{font-size:15px;letter-spacing:.22em}
.tagline{color:var(--dim);font-size:11.5px;letter-spacing:.22em;text-transform:uppercase;margin-top:8px}

.login{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:40px 20px;
  background:radial-gradient(ellipse at 50% 0%,#10243A 0%,transparent 62%)}
.login-card{background:var(--surf);border:1px solid var(--bd);border-radius:10px;padding:22px;width:100%;max-width:330px;
  display:flex;flex-direction:column;gap:10px;margin-top:8px}
.login-title{font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600}
.hint{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;max-width:400px}
.hint-chip{background:var(--raise);border:1px solid var(--bd);border-radius:5px;padding:4px 8px;font-size:11px;
  color:var(--dim);cursor:pointer;font-family:'IBM Plex Mono'}
.hint-chip:hover{border-color:var(--acc);color:var(--acc)}

input{font-family:inherit;font-size:13.5px;color:var(--ink);background:var(--bg);border:1px solid var(--bd);
  border-radius:6px;padding:9px 11px;width:100%}
input:focus{outline:none;border-color:var(--acc)}
.btn{background:var(--acc);color:#04121F;border:none;border-radius:6px;padding:9px 15px;font-size:13px;font-weight:600;
  cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:inherit}
.ghost{background:none;border:1px solid var(--bd);color:var(--ink);border-radius:6px;padding:7px 12px;font-size:12.5px;
  cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit;width:fit-content}
.ghost:hover{border-color:var(--acc);color:var(--acc)}

.top{display:flex;align-items:center;gap:18px;padding:13px 20px;border-bottom:1px solid var(--bd);background:var(--surf)}
.tabs{display:flex;gap:4px;flex:1}
.tab{background:none;border:none;color:var(--dim);font-family:inherit;font-size:13px;padding:7px 11px;border-radius:6px;
  cursor:pointer;display:flex;align-items:center;gap:6px}
.tab:hover{color:var(--ink)}
.tab.on{background:#122436;color:var(--acc)}
.who{display:flex;align-items:center;gap:9px}

.body{flex:1;padding:20px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}
.alert{border-radius:7px;padding:10px 12px;font-size:12.5px}
.alert.good{background:#0F2620;color:#5FCB98;border:1px solid #1C3D31}
.alert.bad{background:#241417;color:#E8938E;border:1px solid #3A2326}
.alert.warn{background:#2A2312;color:#DDBB63;border:1px solid #3D3620}

.switcher{display:flex;gap:7px;flex-wrap:wrap}
.sw{background:var(--surf);border:1px solid var(--bd);border-radius:7px;padding:8px 12px;font-size:12.5px;
  color:var(--dim);cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:8px}
.sw.on{border-color:var(--acc);color:var(--ink)}

.hero{background:linear-gradient(135deg,#101E2E,#0C1622);border:1px solid var(--bd);border-radius:10px;
  padding:20px;display:flex;justify-content:space-between;align-items:flex-start}
.equity{font-size:32px;font-weight:600;margin:6px 0 3px;letter-spacing:-.01em}
.pnl{font-size:13px}
.hero-side{display:flex;flex-direction:column;align-items:flex-end;gap:7px}

.objs{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:11px}
.obj{background:var(--surf);border:1px solid var(--bd);border-radius:9px;padding:14px}
.obj-label{font-size:12px;color:var(--dim);margin-bottom:7px}
.obj-val{font-size:17px;font-weight:600;margin-bottom:9px}
.obj-val .dim{font-size:13px;font-weight:400}
.track{height:5px;background:#182634;border-radius:3px;overflow:hidden}
.fill{height:100%;border-radius:3px;transition:width .3s}
.obj-sub{font-size:11.5px;color:var(--dim);margin-top:7px;display:flex;align-items:center;gap:5px}
.obj-sub .good,.obj-sub .bad{display:flex;align-items:center;gap:5px}

.panel{background:var(--surf);border:1px solid var(--bd);border-radius:9px;padding:15px;display:flex;flex-direction:column;gap:9px}
.panel-head{font-family:'Space Grotesk',sans-serif;font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:9px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.rule-row{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--bd)}
.rule-row:last-child{border-bottom:none}
.kyc{display:flex;gap:11px;align-items:flex-start;font-size:12.5px}

.chart{width:100%;height:auto}
.cl{font-family:'IBM Plex Mono';font-size:9px}
.cl.good{fill:#4FBE8B} .cl.bad{fill:#D96B66}
.chart-empty{display:flex;flex-direction:column;align-items:center;gap:9px;padding:34px 20px;color:var(--dim);
  font-size:12.5px;text-align:center;background:var(--surf);border:1px solid var(--bd);border-radius:9px}

.plan{background:var(--surf);border:1px solid var(--bd);border-radius:9px;padding:15px;display:flex;
  justify-content:space-between;align-items:center;gap:14px;margin-bottom:10px}
.plan-main{display:flex;align-items:center;gap:24px;flex:1;flex-wrap:wrap}
.plan-name{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:14px}
.plan-fig{text-align:right}
.stepper{display:flex;gap:16px}
.step{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dim)}
.step.on{color:var(--acc)}
.node{width:8px;height:8px;border-radius:50%;border:1.5px solid currentColor}
.step.on .node{background:currentColor}

.tag{display:inline-flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap}
.tag i{width:6px;height:6px;border-radius:50%;display:inline-block}

.import{display:flex;flex-direction:column;gap:8px}
.import textarea{font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--ink);background:var(--bg);
  border:1px solid var(--bd);border-radius:6px;padding:8px;width:100%;resize:vertical}
.import textarea:focus{outline:none;border-color:var(--acc)}
.myrank{display:flex;align-items:center;gap:10px;background:var(--raise);border-radius:7px;padding:9px 11px;margin-bottom:6px}
.lb{display:flex;align-items:center;gap:10px;font-size:12.5px;padding:7px 0;border-bottom:1px solid var(--bd)}
.lb:last-child{border-bottom:none}
.lb.me{color:var(--acc)}
.rk{font-family:'IBM Plex Mono';background:var(--raise);border-radius:4px;padding:2px 7px;font-size:11.5px;min-width:24px;text-align:center}
.rk.prize{background:#2A2412;color:#C9A227;font-weight:600}
`;
