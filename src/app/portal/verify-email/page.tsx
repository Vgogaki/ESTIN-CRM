"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"pending" | "ok" | "error">(
    token ? "pending" : "error",
  );
  const [error, setError] = useState<string | null>(
    token ? null : "Missing verification token.",
  );

  const requestedRef = useRef(false);

  useEffect(() => {
    if (!token || requestedRef.current) return;
    requestedRef.current = true;
    fetch("/api/portal/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Verification failed.");
        setStatus("ok");
      })
      .catch((err) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Verification failed.");
      });
  }, [token]);

  if (status === "pending") return <p>Verifying…</p>;
  if (status === "error") return <p className="text-red-600">{error}</p>;
  return (
    <p className="text-green-700">
      Email verified. <Link href="/portal/login" className="underline">Sign in</Link>
    </p>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold">Verifying your email</h1>
      <Suspense fallback={null}>
        <VerifyEmailInner />
      </Suspense>
    </main>
  );
}
