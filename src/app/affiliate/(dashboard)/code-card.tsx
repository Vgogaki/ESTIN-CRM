"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Props = {
  code: string | null;
  createdAt: string | null;
  link: string | null;
  lastDeactivated: { value: string; date: string } | null;
  suspended: boolean;
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the text is selectable on screen */
    }
  }
  return (
    <div>
      <p className="text-xs text-sub uppercase">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded border border-bd bg-bg px-3 py-2 font-mono text-sm">{value}</code>
        <Button type="button" variant="ghost" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export default function CodeCard({ code, createdAt, link, lastDeactivated, suspended }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/affiliate/code", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not generate a code.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-5 p-5">
      <h2 className="mb-3 text-sm font-semibold">Your referral code</h2>
      {code && link ? (
        <div className="flex flex-col gap-3">
          <CopyField label="Code (give this to checkout or type it at sign-up)" value={code} />
          <CopyField label="Your sign-up link (share this)" value={link} />
          {createdAt && <p className="text-xs text-sub">Generated {new Date(createdAt).toLocaleString()}. It is yours alone: ESTIN records it and only this code earns you commission.</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lastDeactivated && (
            <Alert tone="warning">
              Your previous code {lastDeactivated.value} was deactivated by ESTIN on {new Date(lastDeactivated.date).toLocaleDateString()}. It no longer earns commission.
            </Alert>
          )}
          <p className="text-sm text-sub">
            You don&apos;t have a referral code yet. Generate one and ESTIN will create it for you: codes can&apos;t be chosen or typed, so each one is unique and recorded against your account.
          </p>
          {error && <Alert tone="danger">{error}</Alert>}
          <div>
            <Button type="button" onClick={generate} disabled={busy || suspended}>
              {busy ? "Generating…" : "Generate my referral code"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
