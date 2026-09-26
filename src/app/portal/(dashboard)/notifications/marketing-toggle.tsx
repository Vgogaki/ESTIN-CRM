"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";

export default function MarketingToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    setError(null);
    const res = await fetch("/api/portal/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketingConsent: next }),
    });
    if (!res.ok) {
      setError("Couldn't save. Try again.");
      return;
    }
    setOn(next);
  }

  return (
    <Card className="mb-4 p-4">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={on} onChange={(e) => change(e.target.checked)} />
        <span>
          Email me offers and promotions
          <span className="block text-xs text-sub">Account, payout and security emails are always sent.</span>
        </span>
      </label>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </Card>
  );
}
