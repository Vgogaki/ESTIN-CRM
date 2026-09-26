"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type Severity = "low" | "medium" | "high";
type Flag = {
  id: string;
  type: string;
  source: "system" | "admin";
  severity: Severity;
  status: "open" | "reviewed" | "dismissed";
  summary: string;
  createdAt: string;
  reviewReason: string | null;
};
type Profile = {
  level: Severity | null;
  blocksPayout: boolean;
  signals: { identityMismatch: boolean; kycStatus: string; openStrongLinks: number; openCountryReviews: number };
  flags: Flag[];
};

const SEV_TONE = { low: "neutral", medium: "warning", high: "danger" } as const;

function FlagRow({ flag, canReview }: { flag: Flag; canReview: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(body: object) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/risk-flags/${flag.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        return;
      }
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-bd py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm">
          <p>{flag.summary}</p>
          <p className="text-xs text-sub">
            {flag.source === "system" ? "Raised automatically" : "Raised by staff"} · {new Date(flag.createdAt).toLocaleDateString()}
          </p>
          {flag.reviewReason && <p className="text-xs text-sub">Resolution: {flag.reviewReason}</p>}
        </div>
        <div className="flex gap-1.5">
          <Badge tone={SEV_TONE[flag.severity]}>{flag.severity}</Badge>
          <Badge tone={flag.status === "open" ? "warning" : "neutral"}>{flag.status}</Badge>
        </div>
      </div>
      {canReview && flag.status === "open" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="max-w-72" />
          <Button variant="ghost" disabled={busy || !reason.trim()} onClick={() => act({ action: "review", reason })}>
            Mark reviewed
          </Button>
          <Button variant="ghost" disabled={busy || !reason.trim()} onClick={() => act({ action: "dismiss", reason })}>
            Dismiss
          </Button>
          {flag.severity !== "high" && (
            <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => act({ action: "severity", severity: "high", reason })}>
              Escalate to high (blocks payouts)
            </Button>
          )}
          {flag.severity === "high" && (
            <Button variant="ghost" disabled={busy || !reason.trim()} onClick={() => act({ action: "severity", severity: "medium", reason })}>
              Lower to medium
            </Button>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export default function RiskCard({ personId, profile, canReview }: { personId: string; profile: Profile; canReview: boolean }) {
  const router = useRouter();
  const [severity, setSeverity] = useState<Severity>("medium");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const s = profile.signals;

  async function raise() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/traders/${personId}/risk-flags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ severity, summary }) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        return;
      }
      setSummary("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold">Risk profile</h2>
        <Badge tone={profile.level ? SEV_TONE[profile.level] : "success"}>{profile.level ? `${profile.level} risk` : "no open flags"}</Badge>
      </div>
      {profile.blocksPayout && <Alert tone="danger">An open high-severity flag is blocking payout approval for this trader.</Alert>}
      <p className="my-2 text-xs text-sub">
        Other signals: KYC {s.kycStatus.replace(/_/g, " ")} · identity mismatch {s.identityMismatch ? "YES" : "no"} · {s.openStrongLinks} open strong account link(s) · {s.openCountryReviews} open country review(s)
      </p>
      {profile.flags.length === 0 ? <p className="text-sm text-sub">No risk flags have been raised.</p> : profile.flags.map((f) => <FlagRow key={f.id + f.status + f.severity} flag={f} canReview={canReview} />)}
      {canReview && (
        <div className="mt-3 flex flex-col gap-2 border-t border-bd pt-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex items-center gap-2">
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className="max-w-32">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High (blocks payouts)</option>
            </Select>
            <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Describe the concern" />
            <Button disabled={busy || summary.trim().length < 5} onClick={raise}>
              Raise flag
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
