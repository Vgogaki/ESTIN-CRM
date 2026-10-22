"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

/** The tick-box, the optional referral code and "Continue". The price is NOT sent: the server works it out. */
export default function ReviewForm({ challengeTypeId, termsVersion, amountLabel }: { challengeTypeId: string; termsVersion: string; amountLabel: string }) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/portal/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeTypeId, acceptTerms: accepted, referralCode: code.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start checkout.");
        return;
      }
      router.push(`/portal/buy/checkout/${data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Referral code" hint="Optional. Only if someone introduced you to ESTIN.">
          <Input maxLength={64} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <label className="flex items-start gap-2 text-sm text-sub">
          <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>
            I have read the rules above and accept the challenge terms (version {termsVersion}). I understand this is a simulated account and that breaching a
            loss limit ends it.
          </span>
        </label>
        {error && <Alert tone="danger">{error}</Alert>}
        <div>
          <Button type="submit" disabled={busy || !accepted}>
            Continue to payment ({amountLabel})
          </Button>
        </div>
      </form>
    </Card>
  );
}
