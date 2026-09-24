"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { hasPermission } from "@/server/permissions";

type Account = {
  id: string;
  orderRef: string;
  status: "active" | "passed" | "breached" | "closed";
  phase: "evaluation" | "pass_review" | "funded" | "closed";
  equity: string;
  balance: string;
  dayStartEquity: string;
  peakEquity: string;
  tradingDays: number;
  startedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  challengeTypeName: string;
  accountSize: string;
  currency: string;
  minTradingDays: number;
  drawdownType: string;
  equityTickCount: number;
  rule: {
    pnl: string;
    profitTarget: string | null;
    dailyLossCap: string;
    maxLossCap: string;
    dailyLossUsed: string;
    totalLossUsed: string;
    breachedDaily: boolean;
    breachedTotal: boolean;
    hitTarget: boolean;
  } | null;
};

type Note = { id: string; text: string; createdAt: string; authorName: string };
type Payment = {
  id: string;
  orderRef: string;
  amountPaid: string;
  currency: string;
  status: string;
  createdAt: string;
};
type KycDocument = {
  id: string;
  type: string;
  originalName: string;
  sizeBytes: number;
  uploadedAt: string;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  identity_front: "Identity document (front)",
  identity_back: "Identity document (back)",
  proof_of_address: "Proof of address",
  selfie: "Selfie",
};

type Props = {
  permissions: string[];
  person: {
    id: string;
    fullName: string;
    email: string;
    country: string;
    kycStatus: "not_started" | "submitted" | "verified" | "rejected";
    identityMismatch: boolean;
    kycRejectionReason: string | null;
  };
  accounts: Account[];
  notes: Note[];
  payments: Payment[];
  kycDocuments: KycDocument[];
};

function money(value: string, currency: string) {
  const n = Number(value);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function Meter({ label, used, limit, currency }: { label: string; used: string; limit: string; currency: string }) {
  const pct = Math.min(100, (Number(used) / Math.max(Number(limit), 0.01)) * 100);
  const danger = pct >= 100;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-sub">{label}</span>
        <span className={danger ? "font-medium text-danger" : "font-medium"}>
          {money(used, currency)} / {money(limit, currency)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-raise">
        <div
          className={`h-full rounded-full ${danger ? "bg-danger" : "bg-acc"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const STATUSES: Account["status"][] = ["active", "passed", "breached", "closed"];
const PHASES: Account["phase"][] = ["evaluation", "pass_review", "funded", "closed"];
const KYC_STATES = ["not_started", "submitted", "verified", "rejected"] as const;

export default function TraderDetail({
  permissions,
  person,
  accounts,
  notes,
  payments,
  kycDocuments,
}: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(accounts[0]?.id);
  const account = accounts.find((a) => a.id === selectedId) ?? accounts[0];

  const canEdit = hasPermission(permissions, "traders.edit");
  const canVoid = hasPermission(permissions, "traders.void");
  const canDecideKyc = hasPermission(permissions, "kyc.decide");
  const canNote = hasPermission(permissions, "notes.create");

  // Manual override form state
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [equity, setEquity] = useState(account?.equity ?? "0");
  const [dayStartEquity, setDayStartEquity] = useState(account?.dayStartEquity ?? "0");
  const [peakEquity, setPeakEquity] = useState(account?.peakEquity ?? "0");
  const [tradingDays, setTradingDays] = useState(account?.tradingDays ?? 0);
  const [status, setStatus] = useState<Account["status"]>(account?.status ?? "active");
  const [phase, setPhase] = useState<Account["phase"]>(account?.phase ?? "evaluation");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideSaving, setOverrideSaving] = useState(false);

  function selectAccount(a: Account) {
    setSelectedId(a.id);
    setEquity(a.equity);
    setDayStartEquity(a.dayStartEquity);
    setPeakEquity(a.peakEquity);
    setTradingDays(a.tradingDays);
    setStatus(a.status);
    setPhase(a.phase);
    setOverrideOpen(false);
    setOverrideReason("");
  }

  async function saveOverride() {
    if (!account) return;
    setOverrideError(null);
    setOverrideSaving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: overrideReason,
          status,
          phase,
          equity: Number(equity),
          dayStartEquity: Number(dayStartEquity),
          peakEquity: Number(peakEquity),
          tradingDays: Number(tradingDays),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOverrideError(data.error ?? "Failed to save.");
        return;
      }
      setOverrideOpen(false);
      setOverrideReason("");
      router.refresh();
    } finally {
      setOverrideSaving(false);
    }
  }

  // Void form state
  const [voiding, setVoiding] = useState(false);
  const [voidReasonInput, setVoidReasonInput] = useState("");
  const [voidError, setVoidError] = useState<string | null>(null);

  async function confirmVoid() {
    if (!account) return;
    setVoidError(null);
    const res = await fetch(`/api/admin/accounts/${account.id}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: voidReasonInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setVoidError(data.error ?? "Failed to void.");
      return;
    }
    setVoiding(false);
    setVoidReasonInput("");
    router.refresh();
  }

  // KYC state
  const [kycSaving, setKycSaving] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  async function setKyc(newStatus: (typeof KYC_STATES)[number], reason?: string) {
    setKycError(null);
    setKycSaving(true);
    try {
      const res = await fetch(`/api/admin/traders/${person.id}/kyc`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKycError(data.error ?? "Failed to update KYC status.");
        return;
      }
      setRejecting(false);
      setRejectReason("");
      router.refresh();
    } finally {
      setKycSaving(false);
    }
  }

  function onKycClick(k: (typeof KYC_STATES)[number]) {
    if (k === "rejected") {
      setRejecting(true);
      return;
    }
    setKyc(k);
  }

  async function resolveIdentity() {
    await fetch(`/api/admin/traders/${person.id}/resolve-identity`, { method: "POST" });
    router.refresh();
  }

  // Notes state
  const [noteText, setNoteText] = useState("");
  async function addNote() {
    if (!noteText.trim()) return;
    await fetch(`/api/admin/traders/${person.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: noteText.trim() }),
    });
    setNoteText("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {person.identityMismatch && (
        <Alert tone="warning">
          <div className="flex items-center justify-between gap-4">
            <span>
              Identity mismatch — a later order under this email used a different name than the one
              on file. Not a reason to block trading, but payouts stay blocked until reviewed.
            </span>
            {canDecideKyc && (
              <Button variant="ghost" onClick={resolveIdentity} className="whitespace-nowrap">
                Mark reviewed
              </Button>
            )}
          </div>
        </Alert>
      )}

      {accounts.length === 0 ? (
        <Card className="p-6 text-sm text-sub">No accounts yet for this person.</Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => selectAccount(a)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  a.id === account?.id ? "border-acc bg-accbg text-acc" : "border-bd text-sub hover:text-ink"
                }`}
              >
                {a.challengeTypeName}{" "}
                <Badge tone={a.voidedAt ? "neutral" : a.status === "breached" ? "danger" : "neutral"}>
                  {a.voidedAt ? "voided" : a.status}
                </Badge>
              </button>
            ))}
          </div>

          {account && (
            <>
              {account.voidedAt && (
                <Alert tone="danger">
                  This account is voided and excluded from statistics. {account.voidReason}
                </Alert>
              )}

              {!account.voidedAt && account.phase === "evaluation" && account.rule &&
                (account.rule.breachedDaily || account.rule.breachedTotal || account.rule.hitTarget) && (
                <Alert tone={account.rule.breachedDaily || account.rule.breachedTotal ? "danger" : "success"}>
                  {account.rule.breachedDaily && "Daily loss limit exceeded — will auto-close on the next equity update. "}
                  {account.rule.breachedTotal && "Max loss limit exceeded — will auto-close on the next equity update. "}
                  {account.rule.hitTarget && !account.rule.breachedDaily && !account.rule.breachedTotal &&
                    "Profit target met with minimum trading days — will move to pass review on the next equity update."}
                </Alert>
              )}

              <Card className="grid grid-cols-2 gap-3 p-5 text-sm md:grid-cols-3">
                <div>
                  <p className="text-xs text-sub uppercase">Challenge</p>
                  <p>{account.challengeTypeName}</p>
                </div>
                <div>
                  <p className="text-xs text-sub uppercase">Account size</p>
                  <p>{money(account.accountSize, account.currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-sub uppercase">Order ref</p>
                  <p className="font-mono text-xs">{account.orderRef}</p>
                </div>
                <div>
                  <p className="text-xs text-sub uppercase">Started</p>
                  <p>{new Date(account.startedAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-sub uppercase">Trading days</p>
                  <p>
                    {account.tradingDays} / {account.minTradingDays} min
                  </p>
                </div>
                <div>
                  <p className="text-xs text-sub uppercase">Phase</p>
                  <p className="capitalize">{account.phase.replace("_", " ")}</p>
                </div>
              </Card>

              {account.rule && (
                <Card className="p-5">
                  <h2 className="mb-3 font-display text-sm font-semibold">Live rule tracking</h2>
                  <div className="flex flex-col gap-3">
                    {account.rule.profitTarget && (
                      <Meter
                        label="Profit target"
                        used={Math.max(0, Number(account.rule.pnl)).toString()}
                        limit={account.rule.profitTarget}
                        currency={account.currency}
                      />
                    )}
                    <Meter
                      label="Daily loss used"
                      used={account.rule.dailyLossUsed}
                      limit={account.rule.dailyLossCap}
                      currency={account.currency}
                    />
                    <Meter
                      label={`Max loss (${account.drawdownType})`}
                      used={account.rule.totalLossUsed}
                      limit={account.rule.maxLossCap}
                      currency={account.currency}
                    />
                  </div>
                  <p className="mt-3 text-xs text-sub">
                    Equity history: {account.equityTickCount} tick(s) recorded. Populates once a
                    trading platform feed is connected (spec §9, still open) — until then, use
                    &quot;simulate account state&quot; below.
                  </p>
                </Card>
              )}

              {canEdit && (
                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-sm font-semibold">
                      Manual override
                      <span className="ml-2 font-sans text-xs font-normal text-sub">
                        simulated equity — stands in for the live feed. If the new numbers breach a
                        limit or hit the target, status/phase update automatically; only set them
                        yourself here to force something else (e.g. closing for an unrelated reason)
                      </span>
                    </h2>
                    {!overrideOpen && (
                      <Button variant="ghost" onClick={() => setOverrideOpen(true)}>
                        Edit
                      </Button>
                    )}
                  </div>
                  {overrideOpen && (
                    <div className="mt-4 flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Field label="Equity">
                          <Input type="number" value={equity} onChange={(e) => setEquity(e.target.value)} />
                        </Field>
                        <Field label="Day start equity">
                          <Input
                            type="number"
                            value={dayStartEquity}
                            onChange={(e) => setDayStartEquity(e.target.value)}
                          />
                        </Field>
                        <Field label="Peak equity">
                          <Input type="number" value={peakEquity} onChange={(e) => setPeakEquity(e.target.value)} />
                        </Field>
                        <Field label="Trading days">
                          <Input
                            type="number"
                            value={tradingDays}
                            onChange={(e) => setTradingDays(Number(e.target.value))}
                          />
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Status">
                          <Select value={status} onChange={(e) => setStatus(e.target.value as Account["status"])}>
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Phase">
                          <Select value={phase} onChange={(e) => setPhase(e.target.value as Account["phase"])}>
                            {PHASES.map((p) => (
                              <option key={p} value={p}>
                                {p.replace("_", " ")}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <Field label="Reason" hint="Required — recorded in the audit log">
                        <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                      </Field>
                      {overrideError && <Alert tone="danger">{overrideError}</Alert>}
                      <div className="flex gap-2">
                        <Button onClick={saveOverride} disabled={overrideSaving}>
                          {overrideSaving ? "Saving…" : "Save"}
                        </Button>
                        <Button variant="ghost" onClick={() => setOverrideOpen(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {canVoid && !account.voidedAt && (
                <Card className="p-5">
                  <h2 className="mb-2 font-display text-sm font-semibold">Void this account</h2>
                  {!voiding ? (
                    <>
                      <p className="mb-3 text-xs text-sub">
                        Records are never deleted — a void keeps the audit trail and removes the
                        account from statistics and queues. Use for duplicates, test data or orders
                        created in error.
                      </p>
                      <Button variant="danger" onClick={() => setVoiding(true)}>
                        Void account
                      </Button>
                    </>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <Input
                        value={voidReasonInput}
                        onChange={(e) => setVoidReasonInput(e.target.value)}
                        placeholder="Reason — e.g. duplicate of order WEB-00418"
                      />
                      {voidError && <Alert tone="danger">{voidError}</Alert>}
                      <div className="flex gap-2">
                        <Button variant="danger" onClick={confirmVoid} disabled={voidReasonInput.trim().length < 4}>
                          Confirm void
                        </Button>
                        <Button variant="ghost" onClick={() => setVoiding(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </>
          )}
        </>
      )}

      <Card className="p-5">
        <h2 className="mb-3 font-display text-sm font-semibold">KYC</h2>
        <div className="flex flex-wrap gap-1.5">
          {KYC_STATES.map((k) => (
            <button
              key={k}
              disabled={!canDecideKyc || kycSaving}
              onClick={() => onKycClick(k)}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize disabled:cursor-not-allowed disabled:opacity-50 ${
                person.kycStatus === k ? "border-acc bg-accbg text-acc" : "border-bd text-sub hover:text-ink"
              }`}
            >
              {k.replace("_", " ")}
            </button>
          ))}
        </div>
        {rejecting && (
          <div className="mt-3 flex flex-col gap-2">
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason — shown to the trader"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                variant="danger"
                disabled={rejectReason.trim().length < 4 || kycSaving}
                onClick={() => setKyc("rejected", rejectReason.trim())}
              >
                Confirm reject
              </Button>
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {kycError && (
          <div className="mt-2">
            <Alert tone="danger">{kycError}</Alert>
          </div>
        )}
        {person.kycStatus === "rejected" && person.kycRejectionReason && (
          <p className="mt-2 text-xs text-sub">Rejection reason shown to trader: {person.kycRejectionReason}</p>
        )}
        <p className="mt-2 text-xs text-sub">
          KYC belongs to the person — set once, it applies to every account on this email.
        </p>

        {kycDocuments.length > 0 && (
          <div className="mt-4 border-t border-bd pt-4">
            <h3 className="mb-2 text-xs font-medium tracking-wide text-sub uppercase">Documents</h3>
            <div className="flex flex-col gap-1.5">
              {kycDocuments.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p>{DOC_TYPE_LABELS[d.type] ?? d.type}</p>
                    <p className="text-xs text-sub">
                      {(d.sizeBytes / 1024).toFixed(0)} KB · {new Date(d.uploadedAt).toLocaleString()}
                    </p>
                  </div>
                  {canDecideKyc ? (
                    <a
                      href={`/api/admin/kyc/documents/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-acc hover:underline"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-xs text-sub">No permission to view</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-display text-sm font-semibold">Payment history</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-sub">No payments recorded.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-mono text-xs text-sub">{p.orderRef}</p>
                  <p>{money(p.amountPaid, p.currency)}</p>
                </div>
                <Badge tone={p.status === "succeeded" ? "success" : "neutral"}>{p.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-display text-sm font-semibold">Notes</h2>
        {canNote && (
          <div className="mb-4 flex flex-col gap-2">
            <textarea
              rows={2}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Log a call, a breach detail, a payout decision…"
              className="w-full rounded-md border border-bd bg-bg px-3 py-2 text-sm text-ink placeholder:text-sub focus:border-acc focus:outline-none"
            />
            <Button variant="ghost" onClick={addNote} className="w-fit">
              Add note
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {notes.length === 0 && <p className="text-sm text-sub">No notes yet.</p>}
          {notes.map((n) => (
            <div key={n.id} className="border-l-2 border-bd pl-3 text-sm">
              <p className="font-mono text-xs text-sub">
                {new Date(n.createdAt).toLocaleString()} · {n.authorName}
              </p>
              <p>{n.text}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
