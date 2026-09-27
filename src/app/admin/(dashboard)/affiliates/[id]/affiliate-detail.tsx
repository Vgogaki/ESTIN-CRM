"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type Commission = {
  id: string;
  orderRef: string;
  baseAmount: string;
  ratePct: string;
  amount: string;
  currency: string;
  status: "pending" | "approved" | "paid" | "voided";
  flag: string | null;
  reviewNote: string | null;
  paymentReference: string | null;
  voidReason: string | null;
  createdAt: string;
};

const TONE = { pending: "warning", approved: "accent", paid: "success", voided: "neutral" } as const;

function CommissionRow({ c }: { c: Commission }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: "approve" | "pay" | "void") {
    setError(null);
    setBusy(true);
    try {
      const body = action === "approve" ? { action, note: text || null } : action === "pay" ? { action, reference: text } : { action, reason: text };
      const res = await fetch(`/api/admin/affiliates/commissions/${c.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        return;
      }
      setText("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const open = c.status === "pending" || c.status === "approved";
  return (
    <div className="border-b border-bd px-4 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div>
          <p>
            <span className="font-mono">{c.orderRef}</span> · {c.baseAmount} {c.currency} × {c.ratePct}% ={" "}
            <span className="font-semibold">
              {c.amount} {c.currency}
            </span>
          </p>
          <p className="text-xs text-sub">{new Date(c.createdAt).toLocaleString()}</p>
        </div>
        <Badge tone={TONE[c.status]}>{c.status}</Badge>
      </div>
      {c.flag && (
        <div className="mt-2">
          <Alert tone="warning">Flagged: {c.flag}</Alert>
        </div>
      )}
      {c.reviewNote && <p className="mt-1 text-xs text-sub">Review note: {c.reviewNote}</p>}
      {c.paymentReference && <p className="mt-1 text-xs text-sub">Paid, reference: {c.paymentReference}</p>}
      {c.voidReason && <p className="mt-1 text-xs text-sub">Voided: {c.voidReason}</p>}
      {open && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={c.status === "pending" ? "Note (required if flagged) / reason to void" : "Payment reference / reason to void"}
          />
          {c.status === "pending" && (
            <Button disabled={busy} onClick={() => act("approve")}>
              Approve
            </Button>
          )}
          {c.status === "approved" && (
            <Button disabled={busy || !text.trim()} onClick={() => act("pay")}>
              Mark paid
            </Button>
          )}
          <Button variant="danger" disabled={busy || !text.trim()} onClick={() => act("void")}>
            Void
          </Button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export default function AffiliateDetail({
  id,
  status,
  hasPassword,
  commissions,
}: {
  id: string;
  status: "active" | "suspended";
  hasPassword: boolean;
  commissions: Commission[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await fetch(`/api/admin/affiliates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: status === "active" ? "suspended" : "active" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resendInvite() {
    setBusy(true);
    try {
      await fetch(`/api/admin/affiliates/${id}/invite`, { method: "POST" });
      setInviteSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Badge tone={status === "active" ? "success" : "neutral"}>{status}</Badge>
        <Button variant="ghost" disabled={busy} onClick={toggle}>
          {status === "active" ? "Suspend (stop earning commission)" : "Reactivate"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={resendInvite}>
          {hasPassword ? "Send password reset link" : "Resend portal invite"}
        </Button>
        {inviteSent && <span className="text-xs text-sub">Sent.</span>}
      </div>
      <Card>
        {commissions.length === 0 ? (
          <p className="p-4 text-sm text-sub">No referred purchases yet.</p>
        ) : (
          commissions.map((c) => <CommissionRow key={c.id + c.status} c={c} />)
        )}
      </Card>
    </div>
  );
}
