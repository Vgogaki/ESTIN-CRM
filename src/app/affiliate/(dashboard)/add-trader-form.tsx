"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export default function AddTraderForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      const res = await fetch("/api/affiliate/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not add this person.");
        return;
      }
      setName("");
      setEmail("");
      setDone(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-5 p-5">
      <h2 className="mb-1 text-sm font-semibold">Add a trader you are introducing</h2>
      <p className="mb-3 text-sm text-sub">
        ESTIN does not contact them. Share your link or code yourself; when this email registers or buys, they are matched to you and move forward below.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {done && <Alert tone="success">Added. They will appear below.</Alert>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} required />
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={busy || disabled}>
            Add trader
          </Button>
        </div>
      </form>
    </Card>
  );
}
