"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"pending" | "ok" | "error">(token ? "pending" : "error");
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

  if (status === "pending") return <p className="text-sm text-sub">Verifying…</p>;
  if (status === "error") return <Alert tone="danger">{error}</Alert>;
  return (
    <Alert tone="success">
      Email verified.{" "}
      <Link href="/portal/login" className="underline">
        Sign in
      </Link>
    </Alert>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="font-display text-lg font-semibold tracking-[0.14em]">ESTIN</div>
      </div>
      <Card className="p-6">
        <h1 className="mb-5 font-display text-lg font-semibold">Verifying your email</h1>
        <Suspense fallback={null}>
          <VerifyEmailInner />
        </Suspense>
      </Card>
    </main>
  );
}
