"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/portal/auth/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setMessage(
      `${data.message} (Dev note: no email provider is configured yet — check the server log for the reset link.)`,
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="font-display text-lg font-semibold tracking-[0.14em]">ESTIN</div>
      </div>
      <Card className="p-6">
        <h1 className="mb-5 font-display text-lg font-semibold">Reset your password</h1>
        {message ? (
          <Alert tone="success">{message}</Alert>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="Email">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full">
              Send reset link
            </Button>
          </form>
        )}
        <div className="mt-5 text-center text-sm">
          <Link href="/portal/login" className="text-sub hover:text-acc">
            Back to sign in
          </Link>
        </div>
      </Card>
    </main>
  );
}
