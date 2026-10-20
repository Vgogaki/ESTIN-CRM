"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** "Start review" on a pending task; "Put back" on one under review. Refreshes the page (and the sidebar count) when done. */
export default function TaskActions({ id, status }: { id: string; status: "pending" | "in_review" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "claim" | "release") {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tasks/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed.");
      }
      // On a clash ("already being reviewed") the refresh shows who has it now.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {status === "pending" ? (
        <Button type="button" disabled={busy} onClick={() => act("claim")}>
          Start review
        </Button>
      ) : (
        <Button type="button" variant="ghost" disabled={busy} onClick={() => act("release")}>
          Put back
        </Button>
      )}
      {error && <span className="max-w-48 text-right text-xs text-danger">{error}</span>}
    </div>
  );
}
