"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

/**
 * The pay step. Only the demo driver exists today: it says so, loudly, and no money moves.
 * A real provider's hosted payment would replace the button, not the page around it.
 */
export default function PayPanel({ sessionId, amountLabel, demo }: { sessionId: string; amountLabel: string; demo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/checkout/${sessionId}/pay`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "The payment could not be completed.");
        router.refresh();
        return;
      }
      router.refresh(); // the page now shows "Purchase complete"
    } finally {
      setBusy(false);
    }
  }

  if (!demo) return <Alert tone="warning">Purchases aren&apos;t open yet.</Alert>;

  return (
    <div className="flex flex-col gap-3">
      <Alert tone="warning">
        <strong>Simulated payment.</strong> This is a test copy of ESTIN: no card is charged and no money moves, but the account, the order and the offer are created exactly as for a real purchase.
      </Alert>
      {error && <Alert tone="danger">{error}</Alert>}
      <div>
        <Button type="button" onClick={pay} disabled={busy}>
          {busy ? "Processing…" : `Complete simulated payment (${amountLabel})`}
        </Button>
      </div>
    </div>
  );
}
