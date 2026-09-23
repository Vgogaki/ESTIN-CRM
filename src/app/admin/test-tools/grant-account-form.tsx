"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    return <p className="text-sm text-slate-600">No published challenge types yet — publish one first.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded border p-4">
      <label className="flex flex-col gap-1 text-sm">
        Trader email (must already have registered in the portal)
        <input
          type="email"
          required
          value={personEmail}
          onChange={(e) => setPersonEmail(e.target.value)}
          className="rounded border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Challenge type
        <select
          value={challengeTypeId}
          onChange={(e) => setChallengeTypeId(e.target.value)}
          className="rounded border px-3 py-2"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} (v{o.version})
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}
      <button type="submit" className="w-fit rounded bg-slate-900 px-3 py-2 text-sm text-white">
        Grant test account
      </button>
    </form>
  );
}
