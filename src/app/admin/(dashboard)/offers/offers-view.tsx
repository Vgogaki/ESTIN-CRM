"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

type Campaign = {
  id: string;
  name: string;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: string;
  audience: "all_traders" | "breached_traders" | "specific_trader";
  challengeTypeFamilyId: string | null;
  validFrom: string;
  validTo: string;
  maxUses: number | null;
  active: boolean;
  usedCount: number;
};
type EligibleTrader = {
  personId: string;
  fullName: string;
  email: string;
  challengeTypeName: string;
  challengeTypeFamilyId: string;
  breachedAt: string;
};
type IssuedOffer = {
  id: string;
  traderName: string;
  traderEmail: string;
  campaignName: string;
  code: string;
  challengeTypeName: string;
  normalFee: string;
  offerFee: string;
  currency: string;
  status: "sent" | "redeemed" | "withdrawn";
  issuedAt: string;
  expiresAt: string;
  withdrawnReason: string | null;
};
type ChallengeTypeOption = { id: string; familyId: string; name: string; fee: string; currency: string };

function money(value: string, currency: string) {
  const n = Number(value);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

const STATUS_TONE: Record<IssuedOffer["status"], "success" | "danger" | "neutral"> = {
  sent: "neutral",
  redeemed: "success",
  withdrawn: "danger",
};

function NewCampaignForm({ challengeTypes, onDone }: { challengeTypes: ChallengeTypeOption[]; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("20");
  const [audience, setAudience] = useState<Campaign["audience"]>("breached_traders");
  const [familyId, setFamilyId] = useState("");
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [maxUses, setMaxUses] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const families = Array.from(new Map(challengeTypes.map((c) => [c.familyId, c.name])).entries());

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/offers/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code,
          discountType,
          discountValue: Number(discountValue),
          audience,
          challengeTypeFamilyId: familyId || null,
          validFrom: new Date(validFrom).toISOString(),
          validTo: new Date(validTo).toISOString(),
          maxUses: maxUses ? Number(maxUses) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create campaign.");
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
      <h2 className="mb-3 font-display text-sm font-semibold">New campaign</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Breach retry — 20% off" />
        </Field>
        <Field label="Code" hint="Shown to the trader, applied at checkout">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="RETRY20" />
        </Field>
        <Field label="Discount type">
          <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed")}>
            <option value="percent">Percent</option>
            <option value="fixed">Fixed amount</option>
          </Select>
        </Field>
        <Field label={discountType === "percent" ? "Discount %" : "Discount amount"}>
          <Input type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
        </Field>
        <Field label="Audience">
          <Select value={audience} onChange={(e) => setAudience(e.target.value as Campaign["audience"])}>
            <option value="breached_traders">Breached traders</option>
            <option value="all_traders">All traders</option>
            <option value="specific_trader">Specific trader</option>
          </Select>
        </Field>
        <Field label="Applies to" hint="Leave blank for any challenge">
          <Select value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
            <option value="">Any challenge</option>
            {families.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valid from">
          <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </Field>
        <Field label="Valid to">
          <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </Field>
        <Field label="Max uses" hint="Leave blank for unlimited">
          <Input type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        </Field>
      </div>
      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button onClick={submit} disabled={!name || !code || saving}>
          {saving ? "Creating…" : "Create campaign"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export default function OffersView({
  campaigns,
  eligibleTraders,
  issuedOffers,
  challengeTypes,
}: {
  campaigns: Campaign[];
  eligibleTraders: EligibleTrader[];
  issuedOffers: IssuedOffer[];
  challengeTypes: ChallengeTypeOption[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"campaigns" | "send" | "issued">("campaigns");
  const [showNew, setShowNew] = useState(false);
  const [issuingFor, setIssuingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawReason, setWithdrawReason] = useState("");

  const redeemed = issuedOffers.filter((o) => o.status === "redeemed");
  const outstanding = issuedOffers.filter((o) => o.status === "sent");
  const revenueFromOffers = redeemed.reduce((s, o) => s + Number(o.offerFee), 0);
  const discountGiven = redeemed.reduce((s, o) => s + (Number(o.normalFee) - Number(o.offerFee)), 0);

  async function issue(personId: string, campaignId: string, challengeTypeId: string) {
    setError(null);
    setIssuingFor(`${personId}:${campaignId}`);
    try {
      const res = await fetch("/api/admin/offers/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, campaignId, challengeTypeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to issue offer.");
        return;
      }
      router.refresh();
    } finally {
      setIssuingFor(null);
    }
  }

  async function confirmWithdraw(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/offers/${id}/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: withdrawReason.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to withdraw.");
      return;
    }
    setWithdrawingId(null);
    setWithdrawReason("");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="grid flex-1 grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="text-xs text-sub uppercase">Active campaigns</p>
            <p className="mt-1 font-display text-xl font-semibold">{campaigns.filter((c) => c.active).length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-sub uppercase">Offers outstanding</p>
            <p className="mt-1 font-display text-xl font-semibold">{outstanding.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-sub uppercase">Redeemed</p>
            <p className="mt-1 font-display text-xl font-semibold">{redeemed.length}</p>
            <p className="mt-0.5 text-xs text-sub">
              {issuedOffers.length ? Math.round((redeemed.length / issuedOffers.length) * 100) : 0}% take-up
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-sub uppercase">Revenue from offers</p>
            <p className="mt-1 font-display text-xl font-semibold">{money(String(revenueFromOffers), "EUR")}</p>
            <p className="mt-0.5 text-xs text-sub">{money(String(discountGiven), "EUR")} discount given</p>
          </Card>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1.5">
          {(
            [
              ["campaigns", "Campaigns"],
              ["send", `Ready to send (${eligibleTraders.length})`],
              ["issued", `Issued (${issuedOffers.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                tab === id ? "border-acc bg-accbg text-acc" : "border-bd text-sub hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "campaigns" && !showNew && (
          <Button onClick={() => setShowNew(true)}>New campaign</Button>
        )}
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {showNew && (
        <div className="mb-4">
          <NewCampaignForm challengeTypes={challengeTypes} onDone={() => setShowNew(false)} />
        </div>
      )}

      {tab === "campaigns" &&
        (campaigns.length === 0 ? (
          <Card className="p-6 text-sm text-sub">
            No campaigns yet. A retry discount for breached traders is the usual first one.
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            {campaigns.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-bd px-4 py-3 text-sm last:border-b-0">
                <div>
                  <p>{c.name}</p>
                  <p className="text-xs text-sub">
                    <span className="font-mono">{c.code}</span> ·{" "}
                    {c.discountType === "percent" ? `${c.discountValue}%` : money(c.discountValue, "EUR")} off ·{" "}
                    {c.audience.replace("_", " ")} · {c.usedCount}
                    {c.maxUses ? ` / ${c.maxUses}` : ""} used
                  </p>
                </div>
                <Badge tone={c.active ? "success" : "neutral"}>{c.active ? "Active" : "Closed"}</Badge>
              </div>
            ))}
          </Card>
        ))}

      {tab === "send" &&
        (eligibleTraders.length === 0 ? (
          <Card className="p-6 text-sm text-sub">No breached traders awaiting an offer.</Card>
        ) : (
          <Card className="overflow-hidden p-0">
            {eligibleTraders.map((t) => {
              const usable = campaigns.filter(
                (c) =>
                  c.active &&
                  new Date(c.validTo) > new Date() &&
                  (c.audience === "breached_traders" || c.audience === "all_traders") &&
                  (c.challengeTypeFamilyId === null || c.challengeTypeFamilyId === t.challengeTypeFamilyId) &&
                  (c.maxUses === null || c.usedCount < c.maxUses),
              );
              // The current active version of the family they breached on —
              // not necessarily the exact version they originally bought,
              // since a re-purchase should reflect what's sellable today.
              const ct = challengeTypes.find((c) => c.familyId === t.challengeTypeFamilyId);
              return (
                <div key={t.personId} className="flex items-center justify-between border-b border-bd px-4 py-3 text-sm last:border-b-0">
                  <div>
                    <p>{t.fullName}</p>
                    <p className="text-xs text-sub">
                      {t.email} · {t.challengeTypeName}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {usable.length === 0 ? (
                      <span className="text-xs text-sub">No matching campaign</span>
                    ) : (
                      usable.map((c) => (
                        <Button
                          key={c.id}
                          variant="ghost"
                          disabled={!ct || issuingFor === `${t.personId}:${c.id}`}
                          onClick={() => ct && issue(t.personId, c.id, ct.id)}
                        >
                          {issuingFor === `${t.personId}:${c.id}` ? "Sending…" : `Send ${c.code}`}
                        </Button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        ))}

      {tab === "issued" &&
        (issuedOffers.length === 0 ? (
          <Card className="p-6 text-sm text-sub">No offers issued yet.</Card>
        ) : (
          <Card className="overflow-hidden p-0">
            {issuedOffers.map((o) => (
              <div key={o.id} className="flex flex-col gap-1 border-b border-bd px-4 py-3 text-sm last:border-b-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p>{o.traderName}</p>
                    <p className="text-xs text-sub">
                      {o.traderEmail} · {o.campaignName} (<span className="font-mono">{o.code}</span>)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-sub line-through">{money(o.normalFee, o.currency)}</span>
                    <span className="font-medium">{money(o.offerFee, o.currency)}</span>
                    <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>
                  </div>
                </div>
                {o.status === "sent" &&
                  (withdrawingId === o.id ? (
                    <div className="mt-1 flex gap-2">
                      <Input
                        value={withdrawReason}
                        onChange={(e) => setWithdrawReason(e.target.value)}
                        placeholder="Reason"
                        autoFocus
                      />
                      <Button variant="danger" disabled={withdrawReason.trim().length < 4} onClick={() => confirmWithdraw(o.id)}>
                        Confirm
                      </Button>
                      <Button variant="ghost" onClick={() => setWithdrawingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" className="mt-1 w-fit" onClick={() => setWithdrawingId(o.id)}>
                      Withdraw
                    </Button>
                  ))}
                {o.withdrawnReason && <p className="text-xs text-sub">{o.withdrawnReason}</p>}
              </div>
            ))}
          </Card>
        ))}
    </div>
  );
}
