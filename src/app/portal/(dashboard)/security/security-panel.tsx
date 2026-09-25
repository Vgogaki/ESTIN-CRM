"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export default function SecurityPanel({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function startEnrollment() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth/2fa/enroll", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start enrollment.");
        return;
      }
      setOtpauthUri(data.otpauthUri);
      try {
        setSecret(new URL(data.otpauthUri).searchParams.get("secret"));
      } catch {
        setSecret(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function confirmEnrollment() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Invalid code.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (enabled) {
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Two-factor authentication</p>
            <p className="mt-1 text-xs text-sub">Required to request a payout.</p>
          </div>
          <Badge tone="success">Enabled</Badge>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <p className="text-sm font-medium">Two-factor authentication</p>
      <p className="mt-1 mb-4 text-xs text-sub">
        Not enabled. Required before you can request a payout, optional for signing in.
      </p>

      {!otpauthUri ? (
        <Button onClick={startEnrollment} disabled={loading}>
          {loading ? "Starting…" : "Set up two-factor authentication"}
        </Button>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1 text-xs text-sub">
              Add this key to an authenticator app (Google Authenticator, Authy, 1Password, etc.):
            </p>
            <p className="rounded-md border border-bd bg-bg px-3 py-2 font-mono text-sm break-all">
              {secret ?? otpauthUri}
            </p>
          </div>
          <Field label="Enter the 6-digit code from your app">
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              maxLength={6}
              autoFocus
            />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button onClick={confirmEnrollment} disabled={token.length !== 6 || loading} className="w-fit">
            {loading ? "Verifying…" : "Confirm"}
          </Button>
        </div>
      )}
      {error && !otpauthUri && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
    </Card>
  );
}
