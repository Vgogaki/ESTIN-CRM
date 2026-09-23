"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

type ChallengeTypeOption = { id: string; name: string; version: number };

export default function GrantAccountForm({ options }: { options: ChallengeTypeOption[] }) {
  const router = useRouter();
  const [personEmail, setPersonEmail] = useState("");
  const [challengeTypeId, setChallengeTypeId] = useState(options[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/test-tools/grant-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personEmail, challengeTypeId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed.");
      return;
    }
    setMessage(`Account created: ${data.orderRef}`);
    router.refresh();
  }

  if (options.length === 0) {
    return (
      <Card className="p-4 text-sm text-sub">
        No published challenge types yet — publish one first.
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Trader email" hint="Must already have registered in the portal">
          <Input
            type="email"
            required
            value={personEmail}
            onChange={(e) => setPersonEmail(e.target.value)}
          />
        </Field>
        <Field label="Challenge type">
          <Select value={challengeTypeId} onChange={(e) => setChallengeTypeId(e.target.value)}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} (v{o.version})
              </option>
            ))}
          </Select>
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        {message && <Alert tone="success">{message}</Alert>}
        <Button type="submit" className="w-fit">
          Grant test account
        </Button>
      </form>
    </Card>
  );
}
