"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/portal/auth/login", {
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
    router.push("/portal");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border px-3 py-2"
        />
        <input
          type="password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border px-3 py-2"
        />
        {needsTotp && (
          <input
            type="text"
            placeholder="6-digit code"
            value={totpToken}
            onChange={(e) => setTotpToken(e.target.value)}
            className="rounded border px-3 py-2"
          />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-white">
          Sign in
        </button>
      </form>
      <div className="flex justify-between text-sm">
        <Link href="/portal/register" className="underline">
          Create account
        </Link>
        <Link href="/portal/forgot-password" className="underline">
          Forgot password?
        </Link>
      </div>
    </main>
  );
}
