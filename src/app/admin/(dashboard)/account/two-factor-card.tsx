"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

type Props = { email: string; enabled: boolean; recoveryCodesRemaining: number };
type Mode = "idle" | "setup" | "turnOff" | "newCodes";

/** Shown once, right after setup or regeneration: the only time the codes are ever visible. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  function download() {
    const blob = new Blob([`ESTIN back office recovery codes\nEach works once. Keep them somewhere safe and private.\n\n${text}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "estin-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <Alert tone="warning">
        Save these recovery codes now. They are shown <strong>only once</strong>. If you lose your phone, each code lets you sign in a single time.
        Store them in a password manager or print them; don&apos;t keep them in the same place as your password.
      </Alert>
      <div className="grid grid-cols-2 gap-2 rounded-md border border-bd bg-bg p-3 font-mono text-sm">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="ghost" onClick={download}>
          Download .txt
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I have saved these codes somewhere safe
      </label>
      <div>
        <Button disabled={!saved} onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

export default function TwoFactorCard({ email, enabled, recoveryCodesRemaining }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [secret, setSecret] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setMode("idle");
    setSecret(null);
    setToken("");
    setPassword("");
    setCodes(null);
    setError(null);
    router.refresh();
  }

  async function post(url: string, body?: object) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That didn't work.");
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function startSetup() {
    const data = await post("/api/admin/auth/2fa/enroll");
    if (data) {
      setSecret(data.secret);
      setMode("setup");
    }
  }

  async function confirmSetup() {
    const data = await post("/api/admin/auth/2fa/confirm", { token });
    if (data) setCodes(data.recoveryCodes);
  }

  async function turnOff() {
    if (await post("/api/admin/auth/2fa/disable", { password, token })) reset();
  }

  async function newCodes() {
    const data = await post("/api/admin/auth/2fa/recovery-codes", { password, token });
    if (data) setCodes(data.recoveryCodes);
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold">Two-factor authentication</h2>
        <Badge tone={enabled ? "success" : "warning"}>{enabled ? "On" : "Off"}</Badge>
      </div>

      {codes ? (
        <RecoveryCodes codes={codes} onDone={reset} />
      ) : !enabled && mode === "idle" ? (
        <>
          <p className="mb-3 text-sm text-sub">
            Back-office accounts can reach payouts, identity documents and every trader&apos;s data, so a password alone shouldn&apos;t be
            enough. With two-factor on, signing in also needs a 6-digit code from an app on your phone.
          </p>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button disabled={busy} onClick={startSetup}>
            Set up two-factor
          </Button>
        </>
      ) : !enabled && mode === "setup" ? (
        <div className="flex flex-col gap-4">
          <ol className="list-decimal pl-5 text-sm text-sub">
            <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password...).</li>
            <li>Add an account by entering a key manually, with the details below.</li>
            <li>Type the 6-digit code the app shows for it.</li>
          </ol>
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1 rounded-md border border-bd bg-bg p-3 text-sm">
            <dt className="text-sub">Account</dt>
            <dd>{email}</dd>
            <dt className="text-sub">Issuer</dt>
            <dd>ESTIN CRM</dd>
            <dt className="text-sub">Key</dt>
            <dd className="font-mono break-all">{secret}</dd>
            <dt className="text-sub">Type</dt>
            <dd>Time-based, 6 digits</dd>
          </dl>
          <Field label="6-digit code from the app">
            <Input value={token} onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))} maxLength={6} inputMode="numeric" autoFocus />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex gap-2">
            <Button disabled={busy || token.length !== 6} onClick={confirmSetup}>
              Turn on
            </Button>
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      ) : enabled && mode === "idle" ? (
        <>
          <p className="text-sm text-sub">
            Signing in needs a code from your authenticator app.{" "}
            <span className={recoveryCodesRemaining <= 3 ? "text-warning" : ""}>
              {recoveryCodesRemaining} recovery code{recoveryCodesRemaining === 1 ? "" : "s"} left.
            </span>
          </p>
          {recoveryCodesRemaining <= 3 && (
            <p className="mt-1 text-xs text-warning">Running low: generate a fresh set so you can&apos;t be locked out.</p>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="ghost" onClick={() => setMode("newCodes")}>
              New recovery codes
            </Button>
            <Button variant="ghost" onClick={() => setMode("turnOff")}>
              Turn off
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-sub">
            {mode === "turnOff"
              ? "Turning two-factor off makes your account depend on the password alone. Confirm it's you:"
              : "This replaces your recovery codes; the old ones stop working. Confirm it's you:"}
          </p>
          <Field label="Your password">
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Current 6-digit code (or a recovery code)">
            <Input value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex gap-2">
            <Button
              variant={mode === "turnOff" ? "danger" : "primary"}
              disabled={busy || !password || !token.trim()}
              onClick={mode === "turnOff" ? turnOff : newCodes}
            >
              {mode === "turnOff" ? "Turn off two-factor" : "Generate new codes"}
            </Button>
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
