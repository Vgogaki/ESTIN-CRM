"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("CY");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const res = await fetch("/api/portal/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, country, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Registration failed.");
      return;
    }
    setMessage(data.message);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="font-display text-lg font-semibold tracking-[0.14em]">ESTIN</div>
      </div>
      <Card className="p-6">
        <h1 className="mb-5 font-display text-lg font-semibold">Create your account</h1>
        {message ? (
          <Alert tone="success">
            {message} (Dev note: no email provider is configured yet — check the server log for
            the verification link.)
          </Alert>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="Full name">
              <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Country" hint="2-letter code, e.g. CY">
              <Input
                required
                maxLength={2}
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Password" hint="Minimum 10 characters">
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" className="w-full">
              Create account
            </Button>
          </form>
        )}
        <div className="mt-5 text-center text-sm">
          <Link href="/portal/login" className="text-sub hover:text-acc">
            Already have an account? Sign in
          </Link>
        </div>
      </Card>
    </main>
  );
}
