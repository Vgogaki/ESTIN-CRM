"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function ThreadStatusButton({ threadId, resolved }: { threadId: string; resolved: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await fetch(`/api/admin/support/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: resolved ? "admin_reopen" : "admin_resolve" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" disabled={busy} onClick={go}>
      {resolved ? "Reopen" : "Mark resolved"}
    </Button>
  );
}
