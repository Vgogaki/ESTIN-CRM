import { useState, useEffect, useMemo } from "react";
import {
  BarChart3, ListChecks, Users, Banknote, Settings2, Search, X, Plus,
  Check, Clock, ArrowUpRight, ShieldAlert, Trophy, AlertTriangle, Download, Medal, Plug, TicketPercent
} from "lucide-react";

/* ---------------------------------------------------------------
   DEFAULT CHALLENGE TEMPLATES
   Rules are defined once per template; traders inherit them.
   Edit these in the Challenge Types screen.
----------------------------------------------------------------*/
const DEFAULT_TEMPLATES = [
  {
    id: "tpl-25k",
    name: "Evaluation 25K",
    accountSize: 25000,
    fee: 200,
    steps: 1,
    profitTargetPct: 10,
    dailyLossPct: 5,
    maxLossPct: 10,
    drawdownType: "Trailing",
    minTradingDays: 3,
    profitSplitPct: 80,
    payoutCycleDays: 14,
    kycTiming: "After evaluation",
    active: true,
  },
  {
    id: "tpl-50k",
    name: "Evaluation 50K",
    accountSize: 50000,
    fee: 300,
    steps: 1,
    profitTargetPct: 10,
    dailyLossPct: 5,
    maxLossPct: 10,
    drawdownType: "Trailing",
    minTradingDays: 3,
    profitSplitPct: 80,
    payoutCycleDays: 14,
    kycTiming: "After evaluation",
    active: true,
  },
  {
    id: "tpl-100k",
    name: "Evaluation 100K",
    accountSize: 100000,
    fee: 500,
    steps: 1,
    profitTargetPct: 10,
    dailyLossPct: 5,
    maxLossPct: 10,
    drawdownType: "Trailing",
    minTradingDays: 3,
    profitSplitPct: 80,
    payoutCycleDays: 14,
    kycTiming: "After evaluation",
    active: true,
  },
];

const PHASES = ["Evaluation", "Pass review", "Funded", "Closed"];
const STATUSES = ["Active", "Passed", "Breached", "Funded", "Closed"];
const KYC_STATES = ["Not started", "Submitted", "Verified", "Rejected"];
const WD_STATUS = ["Pending", "Approved", "Declined", "Paid"];

const TONE = {
  Active: "#B8791C", Passed: "#1C7C54", Funded: "#0F6E5C",
  Breached: "#B23A3A", Closed: "#6B7280",
  Pending: "#B8791C", Approved: "#1C7C54", Declined: "#B23A3A", Paid: "#0F6E5C",
  "Not started": "#6B7280", Submitted: "#B8791C", Verified: "#1C7C54", Rejected: "#B23A3A",
  Upcoming: "#3B6FA0", Live: "#1C7C54", Ended: "#6B7280", Settled: "#0F6E5C",
  Disqualified: "#B23A3A", Converted: "#0F6E5C", Entrant: "#6B7280",
  Sent: "#B8791C", Redeemed: "#1C7C54", Expired: "#6B7280", Withdrawn: "#B23A3A",
  Voided: "#6B7280",
};

const COMP_STATUS = ["Upcoming", "Live", "Ended", "Settled"];
const PRIZE_KINDS = ["Cash", "Funded account", "Free challenge", "Discount code"];

const OFFER_AUDIENCES = ["Breached traders", "All traders", "Competition entrants", "Specific trader"];
const OFFER_STATUS = ["Sent", "Redeemed", "Expired", "Withdrawn"];

const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const dt = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now() + Math.random().toString(16).slice(2));
const todayISO = () => new Date().toISOString().slice(0, 10);

/* ---------------- storage ----------------
   Artifact storage is unavailable in some clients (notably mobile). We probe it
   once; if neither scope works the app runs in memory and the user keeps their
   data via Backup (copy/paste JSON). Nothing is silently lost either way. */
const KEY = "crm-state-v2";
let SCOPE = null;        // true = shared, false = personal, "none" = unavailable

async function loadState() {
  if (!(typeof window !== "undefined" && window.storage)) { SCOPE = "none"; return null; }
  for (const shared of [true, false]) {
    try {
      const r = await window.storage.get(KEY, shared);
      SCOPE = shared;
      if (r) return JSON.parse(r.value);
    } catch (e) {
      if (String(e?.message || e).toLowerCase().includes("not found")) { SCOPE = shared; }
    }
  }
  if (SCOPE === null) SCOPE = "none";
  return null;
}

async function saveState(s) {
  if (SCOPE === "none" || !(typeof window !== "undefined" && window.storage)) {
    SCOPE = "none";
    return "none";
  }
  const payload = JSON.stringify(s);
  const order = SCOPE === null ? [true, false] : [SCOPE, !SCOPE];
  for (const shared of order) {
    try {
      const res = await window.storage.set(KEY, payload, shared);
      if (!res) throw new Error("no result returned");
      SCOPE = shared;
      return shared;
    } catch (e) { /* try the other scope */ }
  }
  SCOPE = "none";
  return "none";
}

/* ---------------- derived rule helpers ---------------- */
function rulesFor(trader, templates) {
  const t = templates.find((x) => x.id === trader.templateId) || templates[0];
  if (!t) return null;
  return {
    template: t,
    profitTarget: t.accountSize * (t.profitTargetPct / 100),
    dailyLossLimit: t.accountSize * (t.dailyLossPct / 100),
    maxLossLimit: t.accountSize * (t.maxLossPct / 100),
  };
}

/* =========================================================
   SMALL UI PIECES
========================================================= */
function Tag({ value }) {
  return (
    <span className="tag"><span className="dot" style={{ background: TONE[value] || "#6B7280" }} />{value}</span>
  );
}

function Stat({ label, value, sub, icon: Icon }) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="lbl">{label}</span>
        {Icon && <Icon size={14} strokeWidth={1.75} color="#6B7280" />}
      </div>
      <div className="stat-val">{value}</div>
      {sub && <div className="lbl" style={{ marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Meter({ label, used, limit, invert }) {
  const pct = limit ? Math.min(100, Math.abs(used / limit) * 100) : 0;
  const danger = pct >= 100;
  const warn = pct >= 75 && !danger;
  const color = danger ? "#B23A3A" : warn ? "#B8791C" : "#0F6E5C";
  return (
    <div className="meter">
      <div className="meter-head">
        <span className="lbl">{label}</span>
        <span className="mono meter-num">{money(used)} <span className="lbl">/ {money(limit)}</span></span>
      </div>
      <div className="meter-track"><div className="meter-fill" style={{ width: pct + "%", background: color }} /></div>
      {!invert && <div className="lbl" style={{ marginTop: 4 }}>{money(Math.max(0, limit - Math.abs(used)))} remaining</div>}
    </div>
  );
}

/* =========================================================
   ADD TRADER
========================================================= */
function AddTrader({ templates, onCancel, onSave }) {
  const active = templates.filter((t) => t.active);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [templateId, setTemplateId] = useState(active[0]?.id || "");
  const [startDate, setStartDate] = useState(todayISO());
  const tpl = templates.find((t) => t.id === templateId);
  const ok = name.trim().length > 1 && /\S+@\S+\.\S+/.test(email) && tpl;

  return (
    <Drawer title="Add trader" onClose={onCancel} footer={
      <>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={!ok} onClick={() => onSave({
          id: uid(), name: name.trim(), email: email.trim(), country: country.trim() || "—",
          templateId, feePaid: tpl.fee, phase: "Evaluation", status: "Active", kyc: "Not started",
          startDate, equity: tpl.accountSize, peakEquity: tpl.accountSize, dayStartEquity: tpl.accountSize,
          tradingDays: 0, notes: [],
        })}>Add trader</button>
      </>
    }>
      <Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Michaelides" /></Field>
      <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" /></Field>
      <Field label="Country"><input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="CY" /></Field>
      <Field label="Challenge">
        <div className="chips">
          {active.map((t) => (
            <button key={t.id} className={"chip" + (templateId === t.id ? " on" : "")} onClick={() => setTemplateId(t.id)}>{t.name}</button>
          ))}
        </div>
      </Field>
      {tpl && (
        <div className="inherit">
          <div className="lbl" style={{ marginBottom: 8 }}>Rules inherited from this challenge</div>
          <div className="kv"><span>Account size</span><span className="mono">{money(tpl.accountSize)}</span></div>
          <div className="kv"><span>Fee</span><span className="mono">{money(tpl.fee)}</span></div>
          <div className="kv"><span>Profit target</span><span className="mono">{tpl.profitTargetPct}% · {money(tpl.accountSize * tpl.profitTargetPct / 100)}</span></div>
          <div className="kv"><span>Daily loss limit</span><span className="mono">{tpl.dailyLossPct}% · {money(tpl.accountSize * tpl.dailyLossPct / 100)}</span></div>
          <div className="kv"><span>Max loss ({tpl.drawdownType.toLowerCase()})</span><span className="mono">{tpl.maxLossPct}% · {money(tpl.accountSize * tpl.maxLossPct / 100)}</span></div>
          <div className="kv"><span>Profit split</span><span className="mono">{tpl.profitSplitPct}%</span></div>
        </div>
      )}
      <Field label="Start date"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
    </Drawer>
  );
}

/* =========================================================
   PERSON DETAIL — one person, many accounts
========================================================= */
function TraderDetail({ person, templates, withdrawals, onClose, onUpdate, onRequestWithdrawal, onVoid, onResolveIdentity }) {
  const [note, setNote] = useState("");
  const [accId, setAccId] = useState(person.accounts[0]?.id);
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  const trader = person.accounts.find((a) => a.id === accId) || person.accounts[0];
  const r = trader ? rulesFor(trader, templates) : null;
  if (!trader || !r) return null;
  const { template: tpl } = r;

  const pnl = trader.equity - tpl.accountSize;
  const dailyLoss = Math.max(0, trader.dayStartEquity - trader.equity);
  const totalLoss = tpl.drawdownType === "Trailing"
    ? Math.max(0, trader.peakEquity - trader.equity)
    : Math.max(0, tpl.accountSize - trader.equity);

  const breachDaily = dailyLoss >= r.dailyLossLimit;
  const breachTotal = totalLoss >= r.maxLossLimit;
  const hitTarget = pnl >= r.profitTarget && trader.tradingDays >= tpl.minTradingDays;

  const set = (patch) => onUpdate({ ...trader, ...patch });
  const addNote = () => {
    if (!note.trim()) return;
    set({ notes: [{ date: new Date().toISOString(), text: note.trim() }, ...trader.notes] });
    setNote("");
  };

  const myWd = withdrawals.filter((w) => w.traderId === trader.id);
  const names = [...new Set(person.accounts.map((a) => a.name))];
  const mismatch = names.length > 1 && !person.identityResolved;

  return (
    <Drawer wide title={person.name} subtitle={person.email} onClose={onClose}>
      {mismatch && (
        <div className="banner warn">
          <div><AlertTriangle size={14} /> Identity mismatch — this email has purchased under different names:</div>
          <div className="mono" style={{ fontSize: 11.5, paddingLeft: 21 }}>{names.join(" · ")}</div>
          <div style={{ paddingLeft: 21, fontSize: 11.5 }}>
            Not a reason to block trading, but payouts stay blocked until reviewed.
          </div>
          <button className="mini" style={{ marginLeft: 21, width: "fit-content" }}
            onClick={() => onResolveIdentity(person.email)}>Mark reviewed — same person</button>
        </div>
      )}

      {/* account switcher */}
      <div className="acct-tabs">
        {person.accounts.map((a) => {
          const at = templates.find((x) => x.id === a.templateId);
          return (
            <button key={a.id} className={"acct-tab" + (a.id === trader.id ? " on" : "") + (a.voided ? " void" : "")}
              onClick={() => setAccId(a.id)}>
              <span>{at?.name}</span>
              <Tag value={a.voided ? "Voided" : a.status} />
            </button>
          );
        })}
      </div>

      {trader.voided && (
        <div className="banner bad">
          <div><AlertTriangle size={14} /> This account is voided and excluded from all statistics.</div>
          <div style={{ paddingLeft: 21, fontSize: 11.5 }}>
            {trader.voidReason} — {dt(trader.voidedAt)}
          </div>
        </div>
      )}

      {!trader.voided && (breachDaily || breachTotal || hitTarget) && (
        <div className={"banner " + (breachDaily || breachTotal ? "bad" : "good")}>
          {breachDaily && <div><AlertTriangle size={14} /> Daily loss limit exceeded — eligible to mark Breached.</div>}
          {breachTotal && <div><AlertTriangle size={14} /> Max loss limit exceeded — eligible to mark Breached.</div>}
          {hitTarget && !breachDaily && !breachTotal && <div><Trophy size={14} /> Profit target met with minimum trading days — eligible to pass.</div>}
        </div>
      )}

      <div className="grid2">
        <KV k="Challenge" v={tpl.name} />
        <KV k="Account size" v={money(tpl.accountSize)} mono />
        <KV k="Fee paid" v={money(trader.feePaid)} mono />
        <KV k="Country" v={trader.country} />
        <KV k="Started" v={dt(trader.startDate)} mono />
        <KV k="Trading days" v={`${trader.tradingDays} / ${tpl.minTradingDays} min`} mono />
      </div>

      <Section title="Live rule tracking">
        <div className="meters">
          <Meter label="Profit target" used={Math.max(0, pnl)} limit={r.profitTarget} />
          <Meter label="Daily loss used" used={dailyLoss} limit={r.dailyLossLimit} />
          <Meter label={`Max loss (${tpl.drawdownType.toLowerCase()})`} used={totalLoss} limit={r.maxLossLimit} />
        </div>
        <div className="sim">
          <div className="lbl">Simulate account state (until the trading feed is connected)</div>
          <div className="sim-row">
            <label>Equity <input className="mono" type="number" value={trader.equity}
              onChange={(e) => {
                const eq = Number(e.target.value);
                set({ equity: eq, peakEquity: Math.max(trader.peakEquity, eq) });
              }} /></label>
            <label>Day start <input className="mono" type="number" value={trader.dayStartEquity}
              onChange={(e) => set({ dayStartEquity: Number(e.target.value) })} /></label>
            <label>Trading days <input className="mono" type="number" value={trader.tradingDays}
              onChange={(e) => set({ tradingDays: Number(e.target.value) })} /></label>
          </div>
          <div className="lbl">Peak equity {money(trader.peakEquity)} · Open P&L {money(pnl)}</div>
        </div>
      </Section>

      <Section title="Status">
        <div className="chips">
          {STATUSES.map((s) => (
            <button key={s} className={"chip" + (trader.status === s ? " on" : "")}
              style={trader.status === s ? { borderColor: TONE[s], color: TONE[s] } : {}}
              onClick={() => set({ status: s })}>{s}</button>
          ))}
        </div>
      </Section>

      <Section title="Phase">
        <div className="chips">
          {PHASES.map((p) => (
            <button key={p} className={"chip" + (trader.phase === p ? " on" : "")} onClick={() => set({ phase: p })}>{p}</button>
          ))}
        </div>
      </Section>

      <Section title="KYC">
        <div className="chips">
          {KYC_STATES.map((k) => (
            <button key={k} className={"chip" + (trader.kyc === k ? " on" : "")}
              style={trader.kyc === k ? { borderColor: TONE[k], color: TONE[k] } : {}}
              onClick={() => set({ kyc: k })}>{k}</button>
          ))}
        </div>
        <div className="lbl">KYC belongs to the person — set it once and it applies to every account on this email.</div>
      </Section>

      <Section title="Withdrawals">
        {mismatch && <div className="lbl">Payouts blocked while the identity mismatch is unresolved.</div>}
        {!mismatch && trader.phase !== "Funded" && <div className="lbl">Trader must be Funded before a payout can be requested.</div>}
        {!mismatch && trader.phase === "Funded" && (
          <button className="btn-ghost" onClick={() => onRequestWithdrawal(trader)}>
            <Plus size={13} /> Log payout request
          </button>
        )}
        <div className="mini-list">
          {myWd.length === 0 && <div className="lbl">No payout requests.</div>}
          {myWd.map((w) => (
            <div key={w.id} className="mini-row">
              <span className="mono">{money(w.amount)}</span>
              <span className="lbl">{dt(w.created)}</span>
              <Tag value={w.status} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Notes">
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Log a call, a breach detail, a payout decision…" />
        <button className="btn-ghost" style={{ alignSelf: "flex-end" }} onClick={addNote}>Add note</button>
        <div className="notes">
          {trader.notes.length === 0 && <div className="lbl">No notes yet.</div>}
          {trader.notes.map((n, i) => (
            <div key={i} className="note"><div className="lbl mono">{dt(n.date)}</div><div>{n.text}</div></div>
          ))}
        </div>
      </Section>

      {!trader.voided && (
        <Section title="Void this account">
          {!voiding ? (
            <>
              <div className="lbl" style={{ lineHeight: 1.55 }}>
                Records are never deleted — a void keeps the audit trail and removes the account from
                statistics and queues. Use for duplicates, test data or orders created in error.
              </div>
              <button className="btn-ghost danger" style={{ width: "fit-content" }} onClick={() => setVoiding(true)}>
                Void account
              </button>
            </>
          ) : (
            <>
              <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Reason — e.g. duplicate of order WEB-00418" />
              <div className="row-actions">
                <button className="mini" disabled={voidReason.trim().length < 4}
                  onClick={() => { onVoid(trader.id, voidReason.trim()); setVoiding(false); setVoidReason(""); }}>
                  Confirm void
                </button>
                <button className="mini" onClick={() => { setVoiding(false); setVoidReason(""); }}>Cancel</button>
              </div>
            </>
          )}
        </Section>
      )}
    </Drawer>
  );
}

/* =========================================================
   TEMPLATE EDITOR
========================================================= */
function TemplateEditor({ tpl, onClose, onSave, onDelete }) {
  const [d, setD] = useState(tpl);
  const upd = (k, v) => setD({ ...d, [k]: v });
  const num = (k) => (e) => upd(k, Number(e.target.value));

  return (
    <Drawer title={tpl.isNew ? "New challenge type" : d.name} onClose={onClose} footer={
      <>
        {!tpl.isNew && <button className="btn-ghost danger" onClick={() => onDelete(d.id)}>Delete</button>}
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={() => onSave(d)}>Save</button>
      </>
    }>
      <Field label="Name"><input value={d.name} onChange={(e) => upd("name", e.target.value)} /></Field>
      <div className="grid2">
        <Field label="Account size ($)"><input className="mono" type="number" value={d.accountSize} onChange={num("accountSize")} /></Field>
        <Field label="Fee ($)"><input className="mono" type="number" value={d.fee} onChange={num("fee")} /></Field>
      </div>
      <Section title="Drawdown configuration">
        <div className="grid2">
          <Field label="Profit target %"><input className="mono" type="number" value={d.profitTargetPct} onChange={num("profitTargetPct")} /></Field>
          <Field label="Daily loss %"><input className="mono" type="number" value={d.dailyLossPct} onChange={num("dailyLossPct")} /></Field>
          <Field label="Max loss %"><input className="mono" type="number" value={d.maxLossPct} onChange={num("maxLossPct")} /></Field>
          <Field label="Min trading days"><input className="mono" type="number" value={d.minTradingDays} onChange={num("minTradingDays")} /></Field>
        </div>
        <Field label="Drawdown type">
          <div className="chips">
            {["Trailing", "Static"].map((x) => (
              <button key={x} className={"chip" + (d.drawdownType === x ? " on" : "")} onClick={() => upd("drawdownType", x)}>{x}</button>
            ))}
          </div>
        </Field>
      </Section>
      <Section title="Payout rules">
        <div className="grid2">
          <Field label="Profit split % to trader"><input className="mono" type="number" value={d.profitSplitPct} onChange={num("profitSplitPct")} /></Field>
          <Field label="Payout cycle (days)"><input className="mono" type="number" value={d.payoutCycleDays} onChange={num("payoutCycleDays")} /></Field>
        </div>
        <Field label="KYC timing">
          <div className="chips">
            {["At account creation", "After evaluation", "At first payout"].map((x) => (
              <button key={x} className={"chip" + (d.kycTiming === x ? " on" : "")} onClick={() => upd("kycTiming", x)}>{x}</button>
            ))}
          </div>
        </Field>
      </Section>
      <Field label="Availability">
        <div className="chips">
          <button className={"chip" + (d.active ? " on" : "")} onClick={() => upd("active", true)}>Sellable</button>
          <button className={"chip" + (!d.active ? " on" : "")} onClick={() => upd("active", false)}>Archived</button>
        </div>
      </Field>
    </Drawer>
  );
}

/* =========================================================
   COMPETITION EDITOR
========================================================= */
function CompetitionEditor({ comp, onClose, onSave, onDelete }) {
  const [d, setD] = useState(comp);
  const upd = (k, v) => setD({ ...d, [k]: v });
  const num = (k) => (e) => upd(k, Number(e.target.value));

  const setPrize = (i, patch) =>
    upd("prizes", d.prizes.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPrize = () =>
    upd("prizes", [...d.prizes, { rank: d.prizes.length + 1, kind: "Cash", value: 0, note: "" }]);
  const removePrize = (i) =>
    upd("prizes", d.prizes.filter((_, j) => j !== i).map((p, j) => ({ ...p, rank: j + 1 })));

  return (
    <Drawer wide title={comp.isNew ? "New competition" : d.name} onClose={onClose} footer={
      <>
        {!comp.isNew && <button className="btn-ghost danger" onClick={() => onDelete(d.id)}>Delete</button>}
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={() => onSave(d)}>Save</button>
      </>
    }>
      <Field label="Name"><input value={d.name} onChange={(e) => upd("name", e.target.value)} placeholder="September $50K Sprint" /></Field>
      <div className="grid2">
        <Field label="Starts"><input type="date" value={d.startDate} onChange={(e) => upd("startDate", e.target.value)} /></Field>
        <Field label="Ends"><input type="date" value={d.endDate} onChange={(e) => upd("endDate", e.target.value)} /></Field>
      </div>

      <Section title="Entry">
        <div className="grid2">
          <Field label="Entry fee ($) — 0 for free"><input className="mono" type="number" value={d.entryFee} onChange={num("entryFee")} /></Field>
          <Field label="Max entrants (0 = unlimited)"><input className="mono" type="number" value={d.maxEntrants} onChange={num("maxEntrants")} /></Field>
          <Field label="Demo account size ($)"><input className="mono" type="number" value={d.accountSize} onChange={num("accountSize")} /></Field>
          <Field label="Min trades to qualify"><input className="mono" type="number" value={d.minTrades} onChange={num("minTrades")} /></Field>
        </div>
        <Field label="Ranked by">
          <div className="chips">
            {["Return %", "Absolute P&L"].map((x) => (
              <button key={x} className={"chip" + (d.rankBy === x ? " on" : "")} onClick={() => upd("rankBy", x)}>{x}</button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Risk rules for entrants">
        <div className="grid2">
          <Field label="Daily loss %"><input className="mono" type="number" value={d.dailyLossPct} onChange={num("dailyLossPct")} /></Field>
          <Field label="Max loss %"><input className="mono" type="number" value={d.maxLossPct} onChange={num("maxLossPct")} /></Field>
        </div>
        <div className="lbl">Entrants who breach are disqualified from the leaderboard but stay on the list for follow-up.</div>
      </Section>

      <Section title="Prizes">
        {d.prizes.map((p, i) => (
          <div key={i} className="prize-row">
            <span className="rank mono">#{p.rank}</span>
            <select value={p.kind} onChange={(e) => setPrize(i, { kind: e.target.value })}>
              {PRIZE_KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
            <input className="mono" type="number" value={p.value} onChange={(e) => setPrize(i, { value: Number(e.target.value) })} placeholder="Value" />
            <button className="ico" onClick={() => removePrize(i)}><X size={14} /></button>
          </div>
        ))}
        <button className="btn-ghost" onClick={addPrize}><Plus size={13} /> Add prize</button>
        <div className="lbl">
          Cash and funded-account prizes are a real cost — the total shows on the competition card so you can weigh it against entry revenue.
        </div>
      </Section>

      <Field label="Status">
        <div className="chips">
          {COMP_STATUS.map((s) => (
            <button key={s} className={"chip" + (d.status === s ? " on" : "")}
              style={d.status === s ? { borderColor: TONE[s], color: TONE[s] } : {}}
              onClick={() => upd("status", s)}>{s}</button>
          ))}
        </div>
      </Field>
    </Drawer>
  );
}

/* =========================================================
   COMPETITION DETAIL — leaderboard + entrants
========================================================= */
function CompetitionDetail({ comp, entries, traders, onClose, onAddEntry, onUpdateEntry, onEdit }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const mine = entries.filter((e) => e.competitionId === comp.id);
  const ranked = useMemo(() => {
    const eligible = mine.filter((e) => e.status !== "Disqualified" && e.trades >= comp.minTrades);
    const scored = eligible.map((e) => ({
      ...e,
      pnl: e.equity - comp.accountSize,
      ret: comp.accountSize ? ((e.equity - comp.accountSize) / comp.accountSize) * 100 : 0,
    }));
    scored.sort((a, b) => (comp.rankBy === "Return %" ? b.ret - a.ret : b.pnl - a.pnl));
    return scored;
  }, [mine, comp]);

  const others = mine.filter((e) => !ranked.some((r) => r.id === e.id));
  const prizeCost = comp.prizes.reduce((s, p) => s + (p.kind === "Cash" || p.kind === "Funded account" ? p.value : 0), 0);
  const entryRevenue = mine.length * comp.entryFee;
  const converted = mine.filter((e) => e.status === "Converted").length;

  const canAdd = name.trim().length > 1 && /\S+@\S+\.\S+/.test(email)
    && (!comp.maxEntrants || mine.length < comp.maxEntrants);

  return (
    <Drawer wide title={comp.name} subtitle={`${dt(comp.startDate)} – ${dt(comp.endDate)}`} onClose={onClose}>
      <div className="grid2">
        <KV k="Status" v={<Tag value={comp.status} />} />
        <KV k="Entry fee" v={comp.entryFee ? money(comp.entryFee) : "Free"} mono />
        <KV k="Demo account" v={money(comp.accountSize)} mono />
        <KV k="Ranked by" v={comp.rankBy} />
        <KV k="Entrants" v={`${mine.length}${comp.maxEntrants ? " / " + comp.maxEntrants : ""}`} mono />
        <KV k="Converted to paid" v={`${converted}`} mono />
      </div>

      <Section title="Economics">
        <div className="grid2">
          <KV k="Entry revenue" v={money(entryRevenue)} mono />
          <KV k="Prize cost" v={money(prizeCost)} mono />
        </div>
        <div className={"banner " + (entryRevenue - prizeCost >= 0 ? "good" : "bad")}>
          <div>Direct margin {money(entryRevenue - prizeCost)} — before any challenge sales this competition drives.</div>
        </div>
        <div className="lbl">
          A free competition will always show negative here. Judge it on the converted count above, not this number.
        </div>
      </Section>

      <Section title="Prizes">
        {comp.prizes.length === 0 && <div className="lbl">No prizes configured yet.</div>}
        {comp.prizes.map((p, i) => {
          const winner = ranked[i];
          return (
            <div key={i} className="prize-line">
              <span className="rank mono">#{p.rank}</span>
              <span>{p.kind}{p.value ? ` · ${money(p.value)}` : ""}</span>
              <span className="lbl" style={{ marginLeft: "auto" }}>{winner ? winner.name : "—"}</span>
            </div>
          );
        })}
      </Section>

      <Section title="Leaderboard">
        {ranked.length === 0 && <div className="lbl">No qualifying entrants yet. Entrants need at least {comp.minTrades} trades.</div>}
        {ranked.map((e, i) => (
          <div key={e.id} className="lb-row">
            <span className={"rank mono" + (i < comp.prizes.length ? " prize" : "")}>{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div>{e.name}</div>
              <div className="lbl">{e.trades} trades · {e.email}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="mono strong" style={{ color: e.ret >= 0 ? "#1C7C54" : "#B23A3A" }}>
                {e.ret >= 0 ? "+" : ""}{e.ret.toFixed(2)}%
              </div>
              <div className="lbl mono">{money(e.pnl)}</div>
            </div>
          </div>
        ))}
      </Section>

      <Section title="All entrants">
        <div className="entry-add">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Entrant name" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
          <button className="btn-ghost" disabled={!canAdd} onClick={() => { onAddEntry(comp, name.trim(), email.trim()); setName(""); setEmail(""); }}>
            <Plus size={13} /> Add
          </button>
        </div>
        {comp.maxEntrants > 0 && mine.length >= comp.maxEntrants && <div className="lbl">Entrant cap reached.</div>}

        <div className="mini-list">
          {mine.length === 0 && <div className="lbl">No entrants yet.</div>}
          {mine.map((e) => (
            <div key={e.id} className="entrant">
              <div style={{ flex: 1 }}>
                <div>{e.name}</div>
                <div className="lbl">{e.email}</div>
              </div>
              <input className="mono eq" type="number" value={e.equity}
                onChange={(ev) => onUpdateEntry({ ...e, equity: Number(ev.target.value) })} title="Equity" />
              <input className="mono tr" type="number" value={e.trades}
                onChange={(ev) => onUpdateEntry({ ...e, trades: Number(ev.target.value) })} title="Trades" />
              <select value={e.status} onChange={(ev) => onUpdateEntry({ ...e, status: ev.target.value })}>
                {["Entrant", "Disqualified", "Converted"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="lbl">
          Mark an entrant Converted once they buy a challenge — that is how you tell whether the competition paid for itself.
        </div>
      </Section>

      <div className="drawer-foot" style={{ borderTop: "none", paddingTop: 0 }}>
        <button className="btn-ghost" onClick={() => onEdit(comp)}>Edit competition</button>
      </div>
    </Drawer>
  );
}

/* =========================================================
   LAYOUT HELPERS
========================================================= */
function Drawer({ title, subtitle, children, footer, onClose, wide }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className={"drawer" + (wide ? " wide" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div><h2>{title}</h2>{subtitle && <div className="lbl mono">{subtitle}</div>}</div>
          <button className="ico" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </div>
  );
}
const Field = ({ label, children }) => (<label className="field"><span className="lbl">{label}</span>{children}</label>);
const Section = ({ title, children }) => (<div className="sec"><div className="sec-title">{title}</div>{children}</div>);
const KV = ({ k, v, mono }) => (<div><div className="lbl">{k}</div><div className={mono ? "mono" : ""}>{v}</div></div>);

/* =========================================================
   APP
========================================================= */
export default function App() {
  const [state, setState] = useState({ traders: [], templates: DEFAULT_TEMPLATES, withdrawals: [], competitions: [], entries: [], campaigns: [], issued: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("stats");
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editTpl, setEditTpl] = useState(null);
  const [editComp, setEditComp] = useState(null);
  const [editCamp, setEditCamp] = useState(null);
  const [openComp, setOpenComp] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [wdFilter, setWdFilter] = useState("Pending");

  useEffect(() => {
    (async () => {
      const s = await loadState();
      if (s) setState({ templates: DEFAULT_TEMPLATES, competitions: [], entries: [], campaigns: [], issued: [], ...s });
      setLoading(false);
    })();
  }, []);

  const [saveState_, setSaveState_] = useState({ status: "idle", scope: null });

  const commit = async (next) => {
    setState(next);
    setSaveState_((p) => ({ ...p, status: "saving" }));
    const scope = await saveState(next);
    setSaveState_({ status: scope === "none" ? "memory" : "saved", scope });
  };

  const retrySave = async () => {
    setSaveState_((p) => ({ ...p, status: "saving" }));
    const scope = await saveState(state);
    setSaveState_({ status: scope === "none" ? "memory" : "saved", scope });
  };
  void retrySave;

  const { traders, templates, withdrawals, competitions = [], entries = [], campaigns = [], issued = [] } = state;

  /* --- pending task counts --- */
  const tasks = useMemo(() => {
    const act = traders.filter((t) => !t.voided);
    const passReview = act.filter((t) => t.phase === "Pass review").length;
    const kycNeeded = act.filter((t) => t.kyc === "Submitted").length;
    const kycMissing = act.filter((t) => t.phase === "Funded" && t.kyc !== "Verified").length;
    const pendingWd = withdrawals.filter((w) => w.status === "Pending");
    const flagged = act.filter((t) => {
      const r = rulesFor(t, templates); if (!r || t.status !== "Active") return false;
      const daily = Math.max(0, t.dayStartEquity - t.equity);
      const total = r.template.drawdownType === "Trailing"
        ? Math.max(0, t.peakEquity - t.equity) : Math.max(0, r.template.accountSize - t.equity);
      return daily >= r.dailyLossLimit || total >= r.maxLossLimit;
    });
    const readyPass = act.filter((t) => {
      const r = rulesFor(t, templates); if (!r || t.status !== "Active") return false;
      return (t.equity - r.template.accountSize) >= r.profitTarget && t.tradingDays >= r.template.minTradingDays;
    });
    return {
      passReview, kycNeeded, kycMissing, flagged, readyPass,
      pendingWd, pendingWdTotal: pendingWd.reduce((s, w) => s + w.amount, 0),
      total: passReview + kycNeeded + kycMissing + pendingWd.length + flagged.length + readyPass.length,    };
  }, [traders, templates, withdrawals]);

  const stats = useMemo(() => {
    const act = traders.filter((t) => !t.voided);
    const revenue = act.reduce((s, t) => s + (t.feePaid || 0), 0);
    const paid = withdrawals.filter((w) => w.status === "Paid" || w.status === "Approved").reduce((s, w) => s + w.amount, 0);
    const compEntryRev = competitions.reduce((s, c) =>
      s + entries.filter((e) => e.competitionId === c.id).length * c.entryFee, 0);
    const compPrizeCost = competitions.reduce((s, c) =>
      s + c.prizes.reduce((p, x) => p + (x.kind === "Cash" || x.kind === "Funded account" ? x.value : 0), 0), 0);
    const compConverted = entries.filter((e) => e.status === "Converted").length;
    return {
      revenue, paid, net: revenue - paid,
      compEntryRev, compPrizeCost, compConverted,
      liveComps: competitions.filter((c) => c.status === "Live").length,
      sold: act.length,
      active: act.filter((t) => t.status === "Active").length,
      funded: act.filter((t) => t.phase === "Funded").length,
      breached: act.filter((t) => t.status === "Breached").length,
      passRate: act.length ? Math.round(act.filter((t) => ["Passed", "Funded"].includes(t.status)).length / act.length * 100) : 0,
    };
  }, [traders, withdrawals, competitions, entries]);

  /* --- group accounts into people by email --- */
  const people = useMemo(() => {
    const map = new Map();
    traders.forEach((t) => {
      const key = (t.email || "").trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          email: t.email, name: t.name, accounts: [],
          kyc: t.kyc, country: t.country,
          identityResolved: !!t.identityResolved,
        });
      }
      const p = map.get(key);
      p.accounts.push(t);
      if (t.identityResolved) p.identityResolved = true;
      // person-level KYC = most advanced state across their accounts
      const rank = { "Not started": 0, Submitted: 1, Rejected: 1, Verified: 2 };
      if ((rank[t.kyc] ?? 0) > (rank[p.kyc] ?? 0)) p.kyc = t.kyc;
    });
    return [...map.values()].map((p) => ({
      ...p,
      liveAccounts: p.accounts.filter((a) => !a.voided),
      names: [...new Set(p.accounts.map((a) => a.name))],
    }));
  }, [traders]);

  const identityFlags = useMemo(
    () => people.filter((p) => p.names.length > 1 && !p.identityResolved),
    [people]
  );

  const filteredTraders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
        || p.names.some((n) => n.toLowerCase().includes(q));
      const matchesStatus = filter === "All" || p.liveAccounts.some((a) => a.status === filter);
      return matchesSearch && matchesStatus;
    });
  }, [people, search, filter]);

  const filteredWd = useMemo(() =>
    withdrawals.filter((w) => wdFilter === "All" || w.status === wdFilter), [withdrawals, wdFilter]);

  const addWithdrawal = (trader) => {
    const r = rulesFor(trader, templates);
    const profit = Math.max(0, trader.equity - r.template.accountSize);
    const share = profit * (r.template.profitSplitPct / 100);
    const w = {
      id: uid(), traderId: trader.id, traderName: trader.name, email: trader.email,
      country: trader.country, accountSize: r.template.accountSize,
      profit, splitPct: r.template.profitSplitPct, amount: Math.round(share * 100) / 100,
      kyc: trader.kyc, method: "Bank transfer", status: "Pending", created: new Date().toISOString(),
    };
    commit({ ...state, withdrawals: [w, ...withdrawals] });
  };

  const setWdStatus = (id, status) =>
    commit({ ...state, withdrawals: withdrawals.map((w) => w.id === id ? { ...w, status } : w) });

  const addEntry = (comp, name, email) => {
    const e = {
      id: uid(), competitionId: comp.id, name, email,
      equity: comp.accountSize, trades: 0, status: "Entrant",
      joined: new Date().toISOString(),
    };
    commit({ ...state, entries: [...entries, e] });
  };
  const updateEntry = (u) =>
    commit({ ...state, entries: entries.map((e) => (e.id === u.id ? u : e)) });

  const [showBackup, setShowBackup] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);

  /* Mirrors exactly what POST /api/v1/orders would do server-side:
     look up the challenge type, create the trader, seed equity from the template. */
  const simulateOrder = (payload) => {
    const tpl = templates.find((t) => t.id === payload.challenge_type_id);
    if (!tpl) { setLastOrder({ ok: false, msg: "Unknown challenge_type_id — rejected." }); return; }
    const t = {
      id: uid(), name: payload.full_name, email: payload.email, country: payload.country || "—",
      templateId: tpl.id, feePaid: tpl.fee, phase: "Evaluation", status: "Active", kyc: "Not started",
      startDate: todayISO(), equity: tpl.accountSize, peakEquity: tpl.accountSize,
      dayStartEquity: tpl.accountSize, tradingDays: 0,
      notes: [{ date: new Date().toISOString(), text: `Created from order ${payload.order_ref} via API.` }],
    };
    commit({ ...state, traders: [t, ...traders] });
    setLastOrder({ ok: true, msg: `201 Created — trader ${t.name} on ${tpl.name}.` });
  };

  const issueOffer = (trader, camp, tpl) => {
    const normalFee = tpl?.fee || 0;
    const paidFee = camp.discountType === "Percent"
      ? normalFee * (1 - camp.discountValue / 100)
      : Math.max(0, normalFee - camp.discountValue);
    const o = {
      id: uid(), campaignId: camp.id, campaignName: camp.name, code: camp.code,
      traderId: trader.id, traderName: trader.name, email: trader.email,
      normalFee, paidFee: Math.round(paidFee * 100) / 100,
      expires: camp.validTo, status: "Sent", sent: new Date().toISOString(),
    };
    const note = { date: new Date().toISOString(), text: `Offer ${camp.code} sent — ${money(o.paidFee)} (normally ${money(normalFee)}).` };
    commit({
      ...state,
      issued: [o, ...issued],
      traders: traders.map((t) => t.id === trader.id ? { ...t, notes: [note, ...t.notes] } : t),
    });
  };

  const setOfferStatus = (id, status) =>
    commit({ ...state, issued: issued.map((o) => o.id === id ? { ...o, status } : o) });

  const exportCsv = () => {
    const rows = [["Trader", "Email", "Country", "Account size", "Profit", "Split %", "Amount", "KYC", "Status", "Created"]];
    withdrawals.forEach((w) => rows.push([w.traderName, w.email, w.country, w.accountSize, w.profit, w.splitPct, w.amount, w.kyc, w.status, w.created]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "withdrawals.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const selectedPerson = people.find((p) => p.email === selected);

  const voidAccount = (id, reason) => {
    commit({
      ...state,
      traders: traders.map((t) => t.id === id ? {
        ...t, voided: true, voidReason: reason, voidedAt: new Date().toISOString(),
        notes: [{ date: new Date().toISOString(), text: `Account voided: ${reason}` }, ...t.notes],
      } : t),
    });
  };

  const resolveIdentity = (email) => {
    const key = email.trim().toLowerCase();
    commit({
      ...state,
      traders: traders.map((t) => (t.email || "").trim().toLowerCase() === key
        ? { ...t, identityResolved: true } : t),
    });
  };

  const offerLeads = useMemo(() =>
    traders.filter((t) => t.status === "Breached" &&
      !issued.some((o) => o.traderId === t.id && o.status === "Sent")).length,
    [traders, issued]);

  const NAV = [
    { id: "stats", label: "Firm statistics", icon: BarChart3 },
    { id: "tasks", label: "Pending tasks", icon: ListChecks, badge: tasks.total },
    { id: "traders", label: "Traders", icon: Users },
    { id: "withdrawals", label: "Withdrawals", icon: Banknote, badge: tasks.pendingWd.length },
    { id: "competitions", label: "Competitions", icon: Medal },
    { id: "offers", label: "Offers", icon: TicketPercent, badge: offerLeads },
    { id: "types", label: "Challenge types", icon: Settings2 },
    { id: "api", label: "Integrations", icon: Plug },
  ];

  return (
    <div className="app">
      <style>{CSS}</style>

      <aside className="side">
        <div className="brand">ELUVATE<span>BACK OFFICE</span></div>
        {NAV.map((n) => (
          <button key={n.id} className={"nav" + (view === n.id ? " on" : "")} onClick={() => setView(n.id)}>
            <n.icon size={15} /> <span>{n.label}</span>
            {n.badge > 0 && <span className="badge">{n.badge}</span>}
          </button>
        ))}
        <div className="side-foot">
          {saveState_.status === "memory" && (
            <div style={{ color: "#D9A441", fontSize: 11.5, marginBottom: 4 }}>Memory only</div>
          )}
          <div className="lbl" style={{ fontSize: 10.5, lineHeight: 1.45, marginBottom: 7 }}>
            {saveState_.status === "memory"
              ? "This device blocks artifact storage. Work is live but clears on reload."
              : saveState_.status === "saving" ? "Saving…"
                : saveState_.status === "saved"
                  ? "Saved" + (saveState_.scope === false ? " (private)" : "")
                  : "Draft build"}
          </div>
          <button className="mini" onClick={() => setShowBackup(true)}>Backup / restore</button>
        </div>
      </aside>

      <main className="main">
        {/* ---------- FIRM STATISTICS ---------- */}
        {view === "stats" && (
          <>
            <Head title="Firm statistics" onAdd={() => setShowAdd(true)} />
            <div className="stats">
              <Stat label="Challenge revenue" value={money(stats.revenue)} sub="Fees collected" />
              <Stat label="Payouts approved" value={money(stats.paid)} sub="Trader share paid out" />
              <Stat label="Net position" value={money(stats.net)} sub="Revenue less payouts" />
              <Stat label="Challenges sold" value={stats.sold} icon={Users} />
              <Stat label="Funded traders" value={stats.funded} icon={Trophy} />
              <Stat label="Pass rate" value={stats.passRate + "%"} sub="Passed or funded" />
            </div>
            <div className="sec-title" style={{ marginTop: 22 }}>Needs attention</div>
            <div className="stats">
              <Stat label="Ready to pass" value={tasks.readyPass.length} icon={Trophy} />
              <Stat label="Breach flagged" value={tasks.flagged.length} icon={ShieldAlert} />
              <Stat label="Pending payouts" value={money(tasks.pendingWdTotal)} sub={`${tasks.pendingWd.length} requests`} />
              <Stat label="KYC to review" value={tasks.kycNeeded} icon={Clock} />
            </div>
            <div className="sec-title" style={{ marginTop: 22 }}>Competitions as acquisition</div>
            <div className="stats">
              <Stat label="Live competitions" value={stats.liveComps} icon={Medal} />
              <Stat label="Entry revenue" value={money(stats.compEntryRev)} />
              <Stat label="Prize cost committed" value={money(stats.compPrizeCost)} />
              <Stat label="Entrants converted" value={stats.compConverted} sub="Bought a challenge after entering" />
            </div>

            <div className="sec-title" style={{ marginTop: 22 }}>Recent traders</div>
            <TraderTable rows={people.slice(0, 6)} templates={templates} loading={loading} onSelect={setSelected} onAdd={() => setShowAdd(true)} />
          </>
        )}

        {/* ---------- PENDING TASKS ---------- */}
        {view === "tasks" && (
          <>
            <Head title="Pending tasks" onAdd={() => setShowAdd(true)} />
            <p className="lbl" style={{ marginTop: -6, marginBottom: 16 }}>
              Everything waiting on your team, derived from the rules on each challenge type.
            </p>

            <TaskBlock title="Rule breaches flagged" count={tasks.flagged.length} tone="bad">
              {tasks.flagged.map((t) => <TaskRow key={t.id} t={t} templates={templates} note="Loss limit exceeded" onOpen={() => setSelected(t.id)} />)}
            </TaskBlock>

            <TaskBlock title="Ready to pass" count={tasks.readyPass.length} tone="good">
              {tasks.readyPass.map((t) => <TaskRow key={t.id} t={t} templates={templates} note="Target met" onOpen={() => setSelected(t.id)} />)}
            </TaskBlock>

            <TaskBlock title="Pass review needed" count={tasks.passReview}>
              {traders.filter((t) => t.phase === "Pass review").map((t) => <TaskRow key={t.id} t={t} templates={templates} note="Awaiting verification" onOpen={() => setSelected(t.id)} />)}
            </TaskBlock>

            <TaskBlock title="KYC submitted — awaiting review" count={tasks.kycNeeded}>
              {traders.filter((t) => t.kyc === "Submitted").map((t) => <TaskRow key={t.id} t={t} templates={templates} note="Documents uploaded" onOpen={() => setSelected(t.id)} />)}
            </TaskBlock>

            <TaskBlock title="Funded without verified KYC" count={tasks.kycMissing} tone="bad">
              {traders.filter((t) => t.phase === "Funded" && t.kyc !== "Verified").map((t) => <TaskRow key={t.id} t={t} templates={templates} note={`KYC: ${t.kyc}`} onOpen={() => setSelected(t.id)} />)}
            </TaskBlock>

            <TaskBlock title="Identity mismatch — same email, different names" count={identityFlags.length} tone="bad">
              {identityFlags.map((p) => (
                <div key={p.email} className="task-row" onClick={() => setSelected(p.email)}>
                  <div>
                    <div>{p.email}</div>
                    <div className="lbl">{p.names.join(" · ")}</div>
                  </div>
                  <ArrowUpRight size={14} color="#6B7280" />
                </div>
              ))}
            </TaskBlock>

            <TaskBlock title="Breached traders awaiting a re-purchase offer" count={offerLeads}>
              {traders.filter((t) => t.status === "Breached" && !issued.some((o) => o.traderId === t.id && o.status === "Sent"))
                .map((t) => <TaskRow key={t.id} t={t} templates={templates} note="No offer sent" onOpen={() => setView("offers")} />)}
            </TaskBlock>

            <TaskBlock title="Pending withdrawals" count={tasks.pendingWd.length} extra={money(tasks.pendingWdTotal)}>
              {tasks.pendingWd.map((w) => (
                <div key={w.id} className="task-row" onClick={() => setView("withdrawals")}>
                  <div><div>{w.traderName}</div><div className="lbl">{money(w.amount)} · {w.splitPct}% split</div></div>
                  <ArrowUpRight size={14} color="#6B7280" />
                </div>
              ))}
            </TaskBlock>

            {tasks.total === 0 && <div className="empty">Nothing pending. Add traders to see tasks appear here.</div>}
          </>
        )}

        {/* ---------- TRADERS ---------- */}
        {view === "traders" && (
          <>
            <Head title="Traders" onAdd={() => setShowAdd(true)} />
            <div className="toolbar">
              <div className="search"><Search size={14} color="#6B7280" />
                <input placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {["All", ...STATUSES].map((s) => (
                <button key={s} className={"fchip" + (filter === s ? " on" : "")} onClick={() => setFilter(s)}>{s}</button>
              ))}
            </div>
            <TraderTable rows={filteredTraders} templates={templates} loading={loading} onSelect={setSelected} onAdd={() => setShowAdd(true)} />
          </>
        )}

        {/* ---------- WITHDRAWALS ---------- */}
        {view === "withdrawals" && (
          <>
            <div className="head">
              <h1>Withdrawals</h1>
              <button className="btn-ghost" onClick={exportCsv}><Download size={14} /> Export CSV</button>
            </div>
            <div className="stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
              <Stat label="Pending requests" value={tasks.pendingWd.length} />
              <Stat label="Pending value" value={money(tasks.pendingWdTotal)} />
              <Stat label="Paid to date" value={money(stats.paid)} />
            </div>
            <div className="toolbar" style={{ marginTop: 16 }}>
              {["All", ...WD_STATUS].map((s) => (
                <button key={s} className={"fchip" + (wdFilter === s ? " on" : "")} onClick={() => setWdFilter(s)}>{s}</button>
              ))}
            </div>
            {filteredWd.length === 0 ? (
              <div className="empty">No withdrawal requests here. Log one from a funded trader's record.</div>
            ) : (
              <table>
                <thead><tr>
                  <th>Trader</th><th>Country</th><th>Account</th><th>Profit</th><th>Split</th>
                  <th>Amount</th><th>KYC</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  {filteredWd.map((w) => (
                    <tr key={w.id}>
                      <td><div>{w.traderName}</div><div className="lbl">{dt(w.created)}</div></td>
                      <td>{w.country}</td>
                      <td className="mono">{money(w.accountSize)}</td>
                      <td className="mono">{money(w.profit)}</td>
                      <td className="mono">{w.splitPct}%</td>
                      <td className="mono strong">{money(w.amount)}</td>
                      <td><Tag value={w.kyc} /></td>
                      <td><Tag value={w.status} /></td>
                      <td>
                        {w.status === "Pending" && (
                          <div className="row-actions">
                            <button className="mini" disabled={w.kyc !== "Verified"} title={w.kyc !== "Verified" ? "KYC must be verified first" : ""}
                              onClick={() => setWdStatus(w.id, "Approved")}>Approve</button>
                            <button className="mini danger" onClick={() => setWdStatus(w.id, "Declined")}>Decline</button>
                          </div>
                        )}
                        {w.status === "Approved" && <button className="mini" onClick={() => setWdStatus(w.id, "Paid")}>Mark paid</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* ---------- COMPETITIONS ---------- */}
        {view === "competitions" && (
          <>
            <div className="head">
              <h1>Competitions</h1>
              <button className="btn" onClick={() => setEditComp({
                id: uid(), isNew: true, name: "", startDate: todayISO(), endDate: todayISO(),
                entryFee: 0, maxEntrants: 0, accountSize: 50000, minTrades: 5, rankBy: "Return %",
                dailyLossPct: 5, maxLossPct: 10, status: "Upcoming",
                prizes: [{ rank: 1, kind: "Funded account", value: 50000, note: "" }],
              })}><Plus size={15} /> New competition</button>
            </div>
            <p className="lbl" style={{ marginTop: -6, marginBottom: 16 }}>
              Contests on demo accounts, used to bring in traders who then buy a challenge. Track the conversion, not just the entries.
            </p>

            {competitions.length === 0 ? (
              <div className="empty">
                <div>No competitions yet.</div>
                <div className="lbl" style={{ marginTop: 6 }}>A free monthly contest with a funded account as first prize is the usual starting format.</div>
              </div>
            ) : (
              <div className="comp-grid">
                {competitions.map((c) => {
                  const ents = entries.filter((e) => e.competitionId === c.id);
                  const conv = ents.filter((e) => e.status === "Converted").length;
                  const prizeCost = c.prizes.reduce((s, p) => s + (p.kind === "Cash" || p.kind === "Funded account" ? p.value : 0), 0);
                  return (
                    <div key={c.id} className="comp-card" onClick={() => setOpenComp(c.id)}>
                      <div className="comp-top">
                        <div>
                          <div className="comp-name">{c.name || "Untitled competition"}</div>
                          <div className="lbl">{dt(c.startDate)} – {dt(c.endDate)}</div>
                        </div>
                        <Tag value={c.status} />
                      </div>
                      <div className="comp-figs">
                        <div><div className="lbl">Entrants</div><div className="mono strong">{ents.length}{c.maxEntrants ? `/${c.maxEntrants}` : ""}</div></div>
                        <div><div className="lbl">Entry</div><div className="mono strong">{c.entryFee ? money(c.entryFee) : "Free"}</div></div>
                        <div><div className="lbl">Prize cost</div><div className="mono strong">{money(prizeCost)}</div></div>
                        <div><div className="lbl">Converted</div><div className="mono strong">{conv}</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ---------- OFFERS ---------- */}
        {view === "offers" && (
          <OffersView
            campaigns={campaigns} issued={issued} traders={traders} templates={templates}
            onNew={() => setEditCamp({
              id: uid(), isNew: true, name: "", code: "", discountType: "Percent", discountValue: 30,
              appliesTo: "any", audience: "Breached traders", delayDays: 3,
              validFrom: todayISO(), validTo: todayISO(), maxUses: 0, perTrader: 1, active: true,
            })}
            onEdit={setEditCamp} onIssue={issueOffer} onSetStatus={setOfferStatus} />
        )}

        {/* ---------- INTEGRATIONS ---------- */}
        {view === "api" && (
          <IntegrationsView templates={templates} onOrder={simulateOrder} lastOrder={lastOrder} />
        )}

        {/* ---------- CHALLENGE TYPES ---------- */}
        {view === "types" && (
          <>
            <div className="head">
              <h1>Challenge types</h1>
              <button className="btn" onClick={() => setEditTpl({
                id: uid(), isNew: true, name: "New challenge", accountSize: 50000, fee: 300, steps: 1,
                profitTargetPct: 10, dailyLossPct: 5, maxLossPct: 10, drawdownType: "Trailing",
                minTradingDays: 3, profitSplitPct: 80, payoutCycleDays: 14, kycTiming: "After evaluation", active: true,
              })}><Plus size={15} /> New type</button>
            </div>
            <p className="lbl" style={{ marginTop: -6, marginBottom: 16 }}>
              Rules live here, not on individual traders. Every trader inherits the rules of the challenge they bought.
            </p>
            <table>
              <thead><tr>
                <th>Name</th><th>Account</th><th>Fee</th><th>Target</th><th>Daily loss</th>
                <th>Max loss</th><th>Split</th><th>KYC timing</th><th>Status</th>
              </tr></thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} onClick={() => setEditTpl(t)}>
                    <td>{t.name}</td>
                    <td className="mono">{money(t.accountSize)}</td>
                    <td className="mono">{money(t.fee)}</td>
                    <td className="mono">{t.profitTargetPct}%</td>
                    <td className="mono">{t.dailyLossPct}%</td>
                    <td className="mono">{t.maxLossPct}% {t.drawdownType.toLowerCase()}</td>
                    <td className="mono">{t.profitSplitPct}%</td>
                    <td>{t.kycTiming}</td>
                    <td><Tag value={t.active ? "Active" : "Closed"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </main>

      {showAdd && <AddTrader templates={templates} onCancel={() => setShowAdd(false)}
        onSave={(t) => { commit({ ...state, traders: [t, ...traders] }); setShowAdd(false); }} />}

      {selectedPerson && <TraderDetail person={selectedPerson} templates={templates} withdrawals={withdrawals}
        onClose={() => setSelected(null)}
        onUpdate={(u) => commit({ ...state, traders: traders.map((t) => t.id === u.id ? u : t) })}
        onRequestWithdrawal={addWithdrawal}
        onVoid={voidAccount}
        onResolveIdentity={resolveIdentity} />}

      {editCamp && <CampaignEditor camp={editCamp} templates={templates} onClose={() => setEditCamp(null)}
        onSave={(d) => {
          const clean = { ...d }; delete clean.isNew;
          const exists = campaigns.some((c) => c.id === d.id);
          commit({ ...state, campaigns: exists ? campaigns.map((c) => c.id === d.id ? clean : c) : [...campaigns, clean] });
          setEditCamp(null);
        }}
        onDelete={(id) => { commit({ ...state, campaigns: campaigns.filter((c) => c.id !== id) }); setEditCamp(null); }} />}

      {showBackup && <BackupDrawer state={state} onClose={() => setShowBackup(false)}
        onRestore={(s) => { commit(s); setShowBackup(false); }} />}

      {openComp && competitions.find((c) => c.id === openComp) && (
        <CompetitionDetail
          comp={competitions.find((c) => c.id === openComp)}
          entries={entries} traders={traders}
          onClose={() => setOpenComp(null)}
          onAddEntry={addEntry} onUpdateEntry={updateEntry}
          onEdit={(c) => { setOpenComp(null); setEditComp(c); }} />
      )}

      {editComp && <CompetitionEditor comp={editComp} onClose={() => setEditComp(null)}
        onSave={(d) => {
          const clean = { ...d }; delete clean.isNew;
          const exists = competitions.some((c) => c.id === d.id);
          commit({ ...state, competitions: exists ? competitions.map((c) => c.id === d.id ? clean : c) : [...competitions, clean] });
          setEditComp(null);
        }}
        onDelete={(id) => {
          commit({ ...state, competitions: competitions.filter((c) => c.id !== id), entries: entries.filter((e) => e.competitionId !== id) });
          setEditComp(null);
        }} />}

      {editTpl && <TemplateEditor tpl={editTpl} onClose={() => setEditTpl(null)}
        onSave={(d) => {
          const clean = { ...d }; delete clean.isNew;
          const exists = templates.some((t) => t.id === d.id);
          commit({ ...state, templates: exists ? templates.map((t) => t.id === d.id ? clean : t) : [...templates, clean] });
          setEditTpl(null);
        }}
        onDelete={(id) => { commit({ ...state, templates: templates.filter((t) => t.id !== id) }); setEditTpl(null); }} />}
    </div>
  );
}

/* =========================================================
   OFFER CAMPAIGN EDITOR
========================================================= */
function CampaignEditor({ camp, templates, onClose, onSave, onDelete }) {
  const [d, setD] = useState(camp);
  const upd = (k, v) => setD({ ...d, [k]: v });
  const num = (k) => (e) => upd(k, Number(e.target.value));

  const exampleTpl = templates.find((t) => t.id === d.appliesTo) || templates[0];
  const preview = exampleTpl
    ? (d.discountType === "Percent"
      ? exampleTpl.fee * (1 - d.discountValue / 100)
      : Math.max(0, exampleTpl.fee - d.discountValue))
    : 0;

  return (
    <Drawer wide title={camp.isNew ? "New offer campaign" : d.name} onClose={onClose} footer={
      <>
        {!camp.isNew && <button className="btn-ghost danger" onClick={() => onDelete(d.id)}>Delete</button>}
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={() => onSave(d)}>Save</button>
      </>
    }>
      <Field label="Campaign name"><input value={d.name} onChange={(e) => upd("name", e.target.value)} placeholder="Second chance — 30% off" /></Field>
      <Field label="Coupon code"><input className="mono" value={d.code} onChange={(e) => upd("code", e.target.value.toUpperCase())} placeholder="RETRY30" /></Field>

      <Section title="Discount">
        <div className="chips">
          {["Percent", "Fixed amount"].map((x) => (
            <button key={x} className={"chip" + (d.discountType === x ? " on" : "")} onClick={() => upd("discountType", x)}>{x}</button>
          ))}
        </div>
        <Field label={d.discountType === "Percent" ? "Discount %" : "Discount amount ($)"}>
          <input className="mono" type="number" value={d.discountValue} onChange={num("discountValue")} />
        </Field>
        <Field label="Applies to challenge">
          <select value={d.appliesTo} onChange={(e) => upd("appliesTo", e.target.value)}>
            <option value="any">Any challenge</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        {exampleTpl && (
          <div className="inherit">
            <div className="kv"><span>{exampleTpl.name} normal fee</span><span className="mono">{money(exampleTpl.fee)}</span></div>
            <div className="kv"><span>With this offer</span><span className="mono strong">{money(preview)}</span></div>
            <div className="kv"><span>Revenue given up per sale</span><span className="mono">{money(exampleTpl.fee - preview)}</span></div>
          </div>
        )}
      </Section>

      <Section title="Who receives it">
        <div className="chips">
          {OFFER_AUDIENCES.map((a) => (
            <button key={a} className={"chip" + (d.audience === a ? " on" : "")} onClick={() => upd("audience", a)}>{a}</button>
          ))}
        </div>
        {d.audience === "Breached traders" && (
          <Field label="Send this many days after the breach">
            <input className="mono" type="number" value={d.delayDays} onChange={num("delayDays")} />
            <div className="lbl" style={{ marginTop: 5, lineHeight: 1.5 }}>
              A delay of a few days performs better than an immediate send and avoids pressuring someone
              in the moment they have just lost money. Zero means send straight away.
            </div>
          </Field>
        )}
      </Section>

      <Section title="Validity">
        <div className="grid2">
          <Field label="Valid from"><input type="date" value={d.validFrom} onChange={(e) => upd("validFrom", e.target.value)} /></Field>
          <Field label="Expires"><input type="date" value={d.validTo} onChange={(e) => upd("validTo", e.target.value)} /></Field>
          <Field label="Max redemptions (0 = unlimited)"><input className="mono" type="number" value={d.maxUses} onChange={num("maxUses")} /></Field>
          <Field label="Limit per trader"><input className="mono" type="number" value={d.perTrader} onChange={num("perTrader")} /></Field>
        </div>
      </Section>

      <Field label="Status">
        <div className="chips">
          <button className={"chip" + (d.active ? " on" : "")} onClick={() => upd("active", true)}>Active</button>
          <button className={"chip" + (!d.active ? " on" : "")} onClick={() => upd("active", false)}>Paused</button>
        </div>
      </Field>
    </Drawer>
  );
}

/* =========================================================
   OFFERS VIEW
========================================================= */
function OffersView({ campaigns, issued, traders, templates, onNew, onEdit, onIssue, onSetStatus }) {
  const [tab, setTab] = useState("campaigns");

  const discountedFee = (camp, tpl) => {
    if (!tpl) return 0;
    return camp.discountType === "Percent"
      ? tpl.fee * (1 - camp.discountValue / 100)
      : Math.max(0, tpl.fee - camp.discountValue);
  };

  /* Breached traders with no live offer — the re-purchase opportunity */
  const eligible = traders.filter((t) =>
    t.status === "Breached" &&
    !issued.some((o) => o.traderId === t.id && o.status === "Sent")
  );

  const redeemed = issued.filter((o) => o.status === "Redeemed");
  const revenueFromOffers = redeemed.reduce((s, o) => s + o.paidFee, 0);
  const discountGiven = redeemed.reduce((s, o) => s + (o.normalFee - o.paidFee), 0);

  return (
    <>
      <div className="head">
        <h1>Offers</h1>
        <button className="btn" onClick={onNew}><Plus size={15} /> New campaign</button>
      </div>
      <p className="lbl" style={{ marginTop: -6, marginBottom: 14, lineHeight: 1.6, maxWidth: 640 }}>
        Discount campaigns and re-purchase offers. A trader who has just breached is your warmest lead —
        this is where that is handled deliberately rather than ad hoc.
      </p>

      <div className="stats" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 16 }}>
        <Stat label="Active campaigns" value={campaigns.filter((c) => c.active).length} icon={TicketPercent} />
        <Stat label="Offers outstanding" value={issued.filter((o) => o.status === "Sent").length} />
        <Stat label="Redeemed" value={redeemed.length} sub={`${issued.length ? Math.round(redeemed.length / issued.length * 100) : 0}% take-up`} />
        <Stat label="Revenue from offers" value={money(revenueFromOffers)} sub={`${money(discountGiven)} discount given`} />
      </div>

      <div className="toolbar">
        {[["campaigns", "Campaigns"], ["send", `Ready to send (${eligible.length})`], ["issued", `Issued (${issued.length})`]].map(([id, label]) => (
          <button key={id} className={"fchip" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {/* ---- CAMPAIGNS ---- */}
      {tab === "campaigns" && (
        campaigns.length === 0 ? (
          <div className="empty">
            <div>No campaigns yet.</div>
            <div className="lbl" style={{ marginTop: 6 }}>A retry discount for breached traders is the usual first one.</div>
          </div>
        ) : (
          <table>
            <thead><tr>
              <th>Campaign</th><th>Code</th><th>Discount</th><th>Audience</th><th>Valid</th><th>Redemptions</th><th>Status</th>
            </tr></thead>
            <tbody>
              {campaigns.map((c) => {
                const uses = issued.filter((o) => o.campaignId === c.id && o.status === "Redeemed").length;
                return (
                  <tr key={c.id} onClick={() => onEdit(c)}>
                    <td>{c.name}</td>
                    <td className="mono">{c.code}</td>
                    <td className="mono">{c.discountType === "Percent" ? c.discountValue + "%" : money(c.discountValue)}</td>
                    <td>{c.audience}</td>
                    <td className="mono">{dt(c.validFrom)} – {dt(c.validTo)}</td>
                    <td className="mono">{uses}{c.maxUses ? " / " + c.maxUses : ""}</td>
                    <td><Tag value={c.active ? "Active" : "Closed"} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      )}

      {/* ---- READY TO SEND ---- */}
      {tab === "send" && (
        eligible.length === 0 ? (
          <div className="empty">No breached traders awaiting an offer.</div>
        ) : (
          <table>
            <thead><tr><th>Trader</th><th>Challenge</th><th>Breached</th><th>Send offer</th></tr></thead>
            <tbody>
              {eligible.map((t) => {
                const tpl = templates.find((x) => x.id === t.templateId);
                const usable = campaigns.filter((c) => c.active &&
                  (c.audience === "Breached traders" || c.audience === "All traders" || c.audience === "Specific trader") &&
                  (c.appliesTo === "any" || c.appliesTo === t.templateId));
                return (
                  <tr key={t.id}>
                    <td><div>{t.name}</div><div className="lbl">{t.email}</div></td>
                    <td>{tpl?.name}</td>
                    <td className="mono">{dt(t.startDate)}</td>
                    <td>
                      {usable.length === 0 ? <span className="lbl">No matching campaign</span> : (
                        <div className="row-actions">
                          {usable.map((c) => (
                            <button key={c.id} className="mini" onClick={() => onIssue(t, c, tpl)}>
                              {c.code} → {money(discountedFee(c, tpl))}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      )}

      {/* ---- ISSUED ---- */}
      {tab === "issued" && (
        issued.length === 0 ? (
          <div className="empty">No offers issued yet.</div>
        ) : (
          <table>
            <thead><tr>
              <th>Trader</th><th>Campaign</th><th>Code</th><th>Normal</th><th>Offer price</th><th>Expires</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {issued.map((o) => (
                <tr key={o.id}>
                  <td><div>{o.traderName}</div><div className="lbl">{o.email}</div></td>
                  <td>{o.campaignName}</td>
                  <td className="mono">{o.code}</td>
                  <td className="mono lbl">{money(o.normalFee)}</td>
                  <td className="mono strong">{money(o.paidFee)}</td>
                  <td className="mono">{dt(o.expires)}</td>
                  <td><Tag value={o.status} /></td>
                  <td>
                    {o.status === "Sent" && (
                      <div className="row-actions">
                        <button className="mini" onClick={() => onSetStatus(o.id, "Redeemed")}>Mark redeemed</button>
                        <button className="mini danger" onClick={() => onSetStatus(o.id, "Withdrawn")}>Withdraw</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </>
  );
}

function BackupDrawer({ state, onClose, onRestore }) {
  const json = JSON.stringify(state, null, 2);
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState(null);

  const copy = async () => {
    try { await navigator.clipboard.writeText(json); setMsg({ ok: true, t: "Copied. Paste it somewhere safe." }); }
    catch (e) { setMsg({ ok: false, t: "Copy blocked — select the text below and copy manually." }); }
  };

  const restore = () => {
    try {
      const parsed = JSON.parse(paste);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.traders)) {
        setMsg({ ok: false, t: "That does not look like a CRM backup." }); return;
      }
      onRestore(parsed);
    } catch (e) { setMsg({ ok: false, t: "Not valid JSON — check the paste is complete." }); }
  };

  return (
    <Drawer wide title="Backup / restore" onClose={onClose}>
      <p className="lbl" style={{ lineHeight: 1.6 }}>
        Your device blocks the artifact's storage, so data lives in memory only. Copy this text to keep your
        work, and paste it back after a reload to pick up where you left off.
      </p>

      <Section title="Copy your data out">
        <button className="btn" onClick={copy}>Copy backup to clipboard</button>
        <textarea readOnly rows={7} value={json} onFocus={(e) => e.target.select()} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }} />
      </Section>

      <Section title="Restore from a backup">
        <textarea rows={5} value={paste} onChange={(e) => setPaste(e.target.value)}
          placeholder="Paste a previous backup here" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }} />
        <button className="btn-ghost" disabled={!paste.trim()} onClick={restore}>Restore — replaces current data</button>
      </Section>

      {msg && <div className={"banner " + (msg.ok ? "good" : "bad")}><div>{msg.t}</div></div>}
    </Drawer>
  );
}

function IntegrationsView({ templates, onOrder, lastOrder }) {
  const [f, setF] = useState({ full_name: "", email: "", country: "CY", challenge_type_id: templates[0]?.id || "" });
  const upd = (k, v) => setF({ ...f, [k]: v });
  const ready = f.full_name.trim().length > 1 && /\S+@\S+\.\S+/.test(f.email);

  return (
    <>
      <div className="head"><h1>Integrations</h1></div>
      <p className="lbl" style={{ marginTop: -6, marginBottom: 16, lineHeight: 1.6, maxWidth: 640 }}>
        The contract between your website checkout, the trading platform, the trader front end and this back office.
        This prototype has no server, so nothing here is a live endpoint — it is the specification your developers
        build against, plus a simulator below that runs the same logic the real endpoint would.
      </p>

      <div className="api-block">
        <div className="api-head"><span className="verb post">POST</span><span className="path">/api/v1/orders</span></div>
        <div className="api-desc">
          Called by your website or checkout provider the moment a challenge purchase is paid. Creates the trader,
          attaches the challenge type, and seeds the account. Idempotent on <span className="mono">order_ref</span> so a
          retried webhook never creates a duplicate trader.
        </div>
        <pre>{`{
  "order_ref": "WEB-2026-00418",
  "full_name": "Jane Michaelides",
  "email": "jane@example.com",
  "country": "CY",
  "challenge_type_id": "tpl-50k",
  "amount_paid": 300,
  "currency": "EUR",
  "payment_provider": "stripe",
  "affiliate_code": "PARTNER22"
}`}</pre>
      </div>

      <div className="api-block">
        <div className="api-head"><span className="verb post">POST</span><span className="path">/api/v1/accounts/:id/equity</span></div>
        <div className="api-desc">
          Called by the trading platform on every tick or on a schedule. This is the feed that drives the rule meters,
          breach detection and the pending-task queue. Everything else in this CRM already works — this endpoint is the
          only reason the equity fields are currently manual.
        </div>
        <pre>{`{
  "equity": 51240.55,
  "balance": 50980.00,
  "open_pnl": 260.55,
  "closed_trades": 14,
  "trading_day": "2026-09-10",
  "timestamp": "2026-09-10T14:22:03Z"
}`}</pre>
      </div>

      <div className="api-block">
        <div className="api-head"><span className="verb get">GET</span><span className="path">/api/v1/me/accounts</span></div>
        <div className="api-desc">
          Called by the trader front end. Returns the same data the back office holds, filtered to the logged-in trader —
          their challenges, rule progress and payout history. Two interfaces, one database.
        </div>
      </div>

      <div className="api-block">
        <div className="api-head"><span className="verb post">POST</span><span className="path">/api/v1/withdrawals</span></div>
        <div className="api-desc">
          Trader requests a payout from the front end; it lands in the Withdrawals queue as Pending and blocks on KYC,
          exactly as the back office enforces today.
        </div>
      </div>

      <div className="api-block" style={{ borderColor: "var(--acc)" }}>
        <div className="api-head"><Plug size={15} color="var(--acc)" /><span className="path">Simulate an incoming order</span></div>
        <div className="api-desc">
          Fires the same handler <span className="mono">POST /api/v1/orders</span> would. Submit and the trader appears
          under Traders with the challenge rules already attached — this is the end-to-end flow you asked about.
        </div>
        <div className="hook">
          <div className="field"><span className="lbl">full_name</span>
            <input value={f.full_name} onChange={(e) => upd("full_name", e.target.value)} placeholder="Jane Michaelides" /></div>
          <div className="field"><span className="lbl">email</span>
            <input value={f.email} onChange={(e) => upd("email", e.target.value)} placeholder="jane@example.com" /></div>
          <div className="field"><span className="lbl">country</span>
            <input value={f.country} onChange={(e) => upd("country", e.target.value)} /></div>
          <div className="field"><span className="lbl">challenge_type_id</span>
            <select value={f.challenge_type_id} onChange={(e) => upd("challenge_type_id", e.target.value)}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.id} — {t.name}</option>)}
            </select></div>
          <button className="btn" disabled={!ready} onClick={() => onOrder({ ...f, order_ref: "WEB-" + Math.floor(Math.random() * 99999) })}>
            Send order
          </button>
        </div>
        {lastOrder && (
          <div className={"banner " + (lastOrder.ok ? "good" : "bad")} style={{ marginTop: 12 }}>
            <div className="mono">{lastOrder.msg}</div>
          </div>
        )}
      </div>
    </>
  );
}

function Head({ title, onAdd }) {
  return (
    <div className="head">
      <h1>{title}</h1>
      <button className="btn" onClick={onAdd}><Plus size={15} /> Add trader</button>
    </div>
  );
}

function TaskBlock({ title, count, children, tone, extra }) {
  if (!count) return null;
  return (
    <div className="tblock">
      <div className="tblock-head">
        <span className={"tcount " + (tone || "")}>{count}</span>
        <span>{title}</span>
        {extra && <span className="lbl mono" style={{ marginLeft: "auto" }}>{extra}</span>}
      </div>
      <div className="tblock-body">{children}</div>
    </div>
  );
}

function TaskRow({ t, templates, note, onOpen }) {
  const r = rulesFor(t, templates);
  return (
    <div className="task-row" onClick={onOpen}>
      <div>
        <div>{t.name}</div>
        <div className="lbl">{r?.template.name} · {note}</div>
      </div>
      <ArrowUpRight size={14} color="#6B7280" />
    </div>
  );
}

function TraderTable({ rows, templates, loading, onSelect, onAdd }) {
  if (loading) return <div className="empty">Loading…</div>;
  if (!rows.length) return (
    <div className="empty">
      <div>No traders yet.</div>
      <button className="btn" style={{ margin: "12px auto 0" }} onClick={onAdd}><Plus size={15} /> Add your first trader</button>
    </div>
  );
  return (
    <table>
      <thead><tr>
        <th>Trader</th><th>Accounts</th><th>Total equity</th><th>KYC</th><th>Since</th>
      </tr></thead>
      <tbody>
        {rows.map((p) => {
          const totalEquity = p.liveAccounts.reduce((s, a) => s + a.equity, 0);
          const invested = p.liveAccounts.reduce((s, a) => s + (a.feePaid || 0), 0);
          const first = p.accounts.map((a) => a.startDate).sort()[0];
          const flagged = p.names.length > 1 && !p.identityResolved;
          return (
            <tr key={p.email} onClick={() => onSelect(p.email)}>
              <td>
                <div>{p.name} {flagged && <AlertTriangle size={12} color="#D9A441" style={{ verticalAlign: "-1px" }} />}</div>
                <div className="lbl">{p.email}</div>
              </td>
              <td>
                <div className="acct-pills">
                  {p.accounts.map((a) => {
                    const at = templates.find((x) => x.id === a.templateId);
                    return (
                      <span key={a.id} className={"acct-pill" + (a.voided ? " void" : "")}>
                        <span className="dot" style={{ background: a.voided ? "#6B7280" : TONE[a.status] }} />
                        {at?.name || "—"}
                      </span>
                    );
                  })}
                </div>
                <div className="lbl">{money(invested)} in fees</div>
              </td>
              <td className="mono">{money(totalEquity)}</td>
              <td><Tag value={p.kyc} /></td>
              <td className="mono">{first ? dt(first) : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* =========================================================
   STYLES
========================================================= */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
* { box-sizing: border-box; }
.app {
  --bg:#080D16; --surface:#0E1622; --raise:#141F2E; --ink:#E8EEF6; --sub:#7B8CA3;
  --bd:#1E2B3C; --acc:#2E9BF0; --accbg:#122436; --gold:#C9A227;
  font-family:'IBM Plex Sans',sans-serif; color:var(--ink); background:var(--bg);
  display:flex; min-height:620px; border:1px solid var(--bd); border-radius:10px; overflow:hidden;
}
.mono{font-family:'IBM Plex Mono',monospace}
.lbl{color:var(--sub);font-size:12px}
.strong{font-weight:600}
h1{font-family:'Space Grotesk',sans-serif;font-size:20px;margin:0;font-weight:600;letter-spacing:.01em}
h2{font-family:'Space Grotesk',sans-serif;font-size:17px;margin:0 0 2px}

.side{width:206px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--bd);padding:18px 12px;display:flex;flex-direction:column;gap:2px}
.brand{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:15px;padding:0 8px 16px;border-bottom:1px solid var(--bd);margin-bottom:12px;display:flex;flex-direction:column;letter-spacing:.14em}
.brand span{font-family:'IBM Plex Sans';font-weight:400;font-size:11px;color:var(--sub);letter-spacing:.06em;margin-top:3px}
.nav{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:6px;font-size:13.5px;color:var(--sub);cursor:pointer;border:none;background:none;text-align:left;width:100%;font-family:inherit}
.nav:hover{background:var(--raise);color:var(--ink)}
.nav.on{background:var(--accbg);color:var(--acc);font-weight:500;box-shadow:inset 2px 0 0 var(--acc)}
.badge{margin-left:auto;background:#C2453F;color:#fff;font-size:10.5px;border-radius:9px;padding:1px 6px;font-family:'IBM Plex Mono'}
.side-foot{margin-top:auto;padding:10px 8px 0;border-top:1px solid var(--bd);line-height:1.4}

.main{flex:1;padding:22px 26px;overflow-y:auto}
.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.btn{background:var(--acc);color:#04121F;border:none;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-ghost{background:none;border:1px solid var(--bd);color:var(--ink);padding:7px 13px;border-radius:6px;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit}
.btn-ghost:hover{border-color:var(--acc);color:var(--acc)}
.btn-ghost.danger{color:#D96B66;border-color:#3A2326}
.ico{background:none;border:none;cursor:pointer;color:var(--sub)}

.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:11px}
.stat{background:var(--surface);border:1px solid var(--bd);border-radius:8px;padding:12px 13px}
.stat-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}
.stat-val{font-family:'IBM Plex Mono';font-size:19px;font-weight:600}
.sec-title{font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:600;margin-bottom:9px}

.toolbar{display:flex;gap:8px;margin-bottom:13px;align-items:center;flex-wrap:wrap}
.search{display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--bd);border-radius:6px;padding:7px 10px;flex:1;max-width:250px}
.search input{border:none;outline:none;font-size:13px;width:100%;font-family:inherit;background:none;color:var(--ink)}
.fchip{border:1px solid var(--bd);background:var(--surface);border-radius:6px;padding:6px 11px;font-size:12.5px;cursor:pointer;color:var(--sub);font-family:inherit}
.fchip.on{border-color:var(--acc);color:var(--acc);background:var(--accbg)}

table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--bd);border-radius:8px;overflow:hidden}
thead th{text-align:left;font-size:11px;color:var(--sub);font-weight:500;padding:10px 13px;border-bottom:1px solid var(--bd);letter-spacing:.04em;text-transform:uppercase}
tbody td{padding:10px 13px;font-size:13px;border-bottom:1px solid var(--bd);vertical-align:top}
tbody tr:last-child td{border-bottom:none}
tbody tr{cursor:pointer}
tbody tr:hover{background:var(--raise)}
.row-actions{display:flex;gap:5px}
.mini{border:1px solid var(--bd);background:none;border-radius:5px;padding:4px 8px;font-size:11.5px;cursor:pointer;font-family:inherit;color:var(--ink)}
.mini:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}
.mini:disabled{opacity:.35;cursor:not-allowed}
.mini.danger{color:#D96B66}

.tag{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;white-space:nowrap}
.dot{width:7px;height:7px;border-radius:50%}
.empty{text-align:center;padding:48px 20px;color:var(--sub);background:var(--surface);border:1px solid var(--bd);border-radius:8px}

.tblock{background:var(--surface);border:1px solid var(--bd);border-radius:8px;margin-bottom:12px;overflow:hidden}
.tblock-head{display:flex;align-items:center;gap:9px;padding:11px 13px;border-bottom:1px solid var(--bd);font-size:13.5px;font-weight:500}
.tcount{font-family:'IBM Plex Mono';background:var(--accbg);color:var(--acc);border-radius:5px;padding:1px 7px;font-size:12.5px}
.tcount.bad{background:#2A1618;color:#E08A85}
.tcount.good{background:#10281F;color:#4FBE8B}
.task-row{display:flex;justify-content:space-between;align-items:center;padding:10px 13px;border-bottom:1px solid var(--bd);cursor:pointer;font-size:13px}
.task-row:last-child{border-bottom:none}
.task-row:hover{background:var(--raise)}

.overlay{position:fixed;inset:0;background:rgba(4,8,14,.66);display:flex;justify-content:flex-end;z-index:30}
.drawer{width:390px;background:var(--surface);height:100%;padding:20px;overflow-y:auto;display:flex;flex-direction:column;border-left:1px solid var(--bd)}
.drawer.wide{width:470px}
.drawer-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
.drawer-body{flex:1;display:flex;flex-direction:column;gap:15px}
.drawer-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-top:13px;border-top:1px solid var(--bd)}
.field{display:flex;flex-direction:column;gap:5px}
input,textarea{font-family:inherit;font-size:13.5px;color:var(--ink);border:1px solid var(--bd);border-radius:6px;padding:8px 10px;background:var(--bg);width:100%}
input:focus,textarea:focus{outline:none;border-color:var(--acc)}
textarea{resize:vertical}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid var(--bd);background:none;border-radius:6px;padding:6px 10px;font-size:12.5px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px;color:var(--sub)}
.chip.on{border-color:var(--acc);color:var(--acc);background:var(--accbg);font-weight:500}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px 10px;font-size:13.5px}
.sec{display:flex;flex-direction:column;gap:9px;padding-top:13px;border-top:1px solid var(--bd)}
.inherit{background:var(--raise);border-radius:7px;padding:11px 12px}
.kv{display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0}

.meters{display:flex;flex-direction:column;gap:12px}
.meter-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px}
.meter-num{font-size:13px;font-weight:600}
.meter-track{height:6px;background:#1A2635;border-radius:3px;overflow:hidden}
.meter-fill{height:100%;border-radius:3px}
.sim{background:var(--raise);border-radius:7px;padding:11px 12px;display:flex;flex-direction:column;gap:8px}
.sim-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.sim-row label{display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--sub)}
.sim-row input{padding:6px 8px;font-size:12.5px}

.banner{border-radius:7px;padding:10px 12px;font-size:12.5px;display:flex;flex-direction:column;gap:6px}
.banner div{display:flex;align-items:center;gap:7px}
.banner.bad{background:#241417;color:#E8938E;border:1px solid #3A2326}
.banner.good{background:#0F2620;color:#5FCB98;border:1px solid #1C3D31}
.notes{display:flex;flex-direction:column;gap:9px}
.note{font-size:13px;border-left:2px solid var(--bd);padding-left:10px}
.mini-list{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.mini-row{display:flex;align-items:center;gap:10px;font-size:12.5px}

select{font-family:inherit;font-size:12.5px;border:1px solid var(--bd);border-radius:6px;padding:6px 8px;background:var(--bg);color:var(--ink)}
.comp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.comp-card{background:var(--surface);border:1px solid var(--bd);border-radius:8px;padding:14px;cursor:pointer}
.comp-card:hover{border-color:var(--acc)}
.comp-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px}
.comp-name{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:14.5px}
.comp-figs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding-top:11px;border-top:1px solid var(--bd)}
.comp-figs .strong{font-size:14px}

.prize-row{display:flex;align-items:center;gap:7px}
.prize-row input{width:90px}
.prize-line{display:flex;align-items:center;gap:9px;font-size:13px;padding:5px 0;border-bottom:1px solid var(--bd)}
.prize-line:last-child{border-bottom:none}
.rank{background:var(--raise);border-radius:5px;padding:2px 7px;font-size:12px;min-width:26px;text-align:center}
.rank.prize{background:#2A2412;color:var(--gold);font-weight:600}
.lb-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--bd);font-size:13px}
.lb-row:last-child{border-bottom:none}
.entry-add{display:grid;grid-template-columns:1fr 1fr auto;gap:6px}
.entry-add input{font-size:12.5px;padding:7px 9px}
.entrant{display:flex;align-items:center;gap:7px;font-size:13px;padding:7px 0;border-bottom:1px solid var(--bd)}
.entrant:last-child{border-bottom:none}
.entrant .eq{width:88px;padding:5px 7px;font-size:12px}
.entrant .tr{width:52px;padding:5px 7px;font-size:12px}

.api-block{background:var(--surface);border:1px solid var(--bd);border-radius:8px;padding:15px;margin-bottom:12px}
.api-head{display:flex;align-items:center;gap:9px;margin-bottom:9px}
.verb{font-family:'IBM Plex Mono';font-size:11px;font-weight:600;padding:2px 7px;border-radius:4px;letter-spacing:.05em}
.verb.post{background:#10281F;color:#4FBE8B}
.verb.get{background:var(--accbg);color:var(--acc)}
.path{font-family:'IBM Plex Mono';font-size:13px}
.api-desc{font-size:12.5px;color:var(--sub);line-height:1.55;margin-bottom:10px}
pre{background:var(--bg);border:1px solid var(--bd);border-radius:6px;padding:11px;font-family:'IBM Plex Mono';font-size:11.5px;overflow-x:auto;margin:0;color:#A9C4DE;line-height:1.6}
.hook{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}
.hook .field{flex:1;min-width:120px}
.save-err{font-size:11px;color:var(--sub)}

.banner.warn{background:#2A2312;color:#DDBB63;border:1px solid #3D3620}
.acct-tabs{display:flex;gap:6px;flex-wrap:wrap;padding-bottom:13px;border-bottom:1px solid var(--bd)}
.acct-tab{background:var(--bg);border:1px solid var(--bd);border-radius:7px;padding:8px 11px;font-size:12.5px;
  cursor:pointer;font-family:inherit;color:var(--sub);display:flex;flex-direction:column;gap:5px;align-items:flex-start}
.acct-tab.on{border-color:var(--acc);color:var(--ink)}
.acct-tab.void{opacity:.5;text-decoration:line-through}
.acct-pills{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:4px}
.acct-pill{display:inline-flex;align-items:center;gap:5px;background:var(--raise);border-radius:5px;
  padding:2px 7px;font-size:11.5px}
.acct-pill.void{opacity:.45;text-decoration:line-through}
`;
