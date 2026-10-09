"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

export default function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, totpToken: totpToken || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.name === "TwoFactorRequiredError") {
          setNeedsTotp(true);
          setError("Enter your two-factor code.");
        } else {
          setError(data.error ?? "Login failed.");
        }
        return;
      }
      router.push("/admin");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="font-display text-lg font-semibold tracking-[0.14em]">ESTIN</div>
        <div className="mt-1 text-xs tracking-wide text-sub">BACK OFFICE</div>
      </div>
      <Card className="p-6">
        <h1 className="mb-5 font-display text-lg font-semibold">Sign in</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {needsTotp && (
            <Field label="Two-factor code" hint="The 6-digit code from your app, or one of your recovery codes.">
              <Input
                value={totpToken}
                onChange={(e) => setTotpToken(e.target.value)}
                autoComplete="one-time-code"
                autoFocus
              />
            </Field>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
