"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export default function NewAffiliateForm() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", code: "", commissionPct: "", linkedTraderEmail: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/affiliates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, linkedTraderEmail: f.linkedTraderEmail || null, note: f.note || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        return;
      }
      router.push(`/admin/affiliates/${data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold">Add an affiliate</h2>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <Input value={f.name} onChange={set("name")} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={f.email} onChange={set("email")} required />
          </Field>
          <Field label="Referral code" hint="What checkout sends as affiliate_code. Letters, numbers, - and _.">
            <Input value={f.code} onChange={set("code")} required />
          </Field>
          <Field label="Commission %" hint="Of the amount the buyer pays. No default: you decide.">
            <Input value={f.commissionPct} onChange={set("commissionPct")} inputMode="decimal" required />
          </Field>
          <Field label="Also a trader? (email)" hint="Optional. Lets the system spot the affiliate buying through their own code.">
            <Input value={f.linkedTraderEmail} onChange={set("linkedTraderEmail")} />
          </Field>
          <Field label="Note">
            <Input value={f.note} onChange={set("note")} />
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={busy}>
            Add affiliate
          </Button>
        </div>
      </form>
    </Card>
  );
}
