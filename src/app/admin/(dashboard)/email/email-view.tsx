"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type Template = {
  key: string;
  label: string;
  subject: string;
  body: string;
  enabled: boolean;
  customised: boolean;
  variables: string[];
  marketing: boolean;
};
type OutboxRow = {
  id: string;
  toEmail: string;
  templateKey: string;
  subject: string;
  body: string;
  status: "queued" | "sent" | "failed" | "skipped";
  attempts: number;
  lastError: string | null;
  createdAt: string;
};

const TONE = { queued: "warning", sent: "success", failed: "danger", skipped: "neutral" } as const;

function TemplateCard({ tpl }: { tpl: Template }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(tpl);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = draft.subject !== tpl.subject || draft.body !== tpl.body || draft.enabled !== tpl.enabled;

  async function call(method: "PUT" | "DELETE") {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/email/templates/${tpl.key}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "PUT" ? JSON.stringify({ subject: draft.subject, body: draft.body, enabled: draft.enabled }) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        return;
      }
      router.refresh();
      if (method === "DELETE") setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(!open)}>
        <span className="text-sm font-medium">{tpl.label}</span>
        <span className="flex gap-2">
          {tpl.marketing && <Badge tone="accent">marketing</Badge>}
          {!tpl.enabled && <Badge tone="danger">off</Badge>}
          {tpl.customised && <Badge tone="neutral">edited</Badge>}
        </span>
      </button>
      {open && (
        <div className="mt-4 flex flex-col gap-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Subject">
            <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </Field>
          <Field
            label="Message"
            hint={tpl.variables.length ? `Fill-in fields: ${tpl.variables.map((v) => `{{${v}}}`).join("  ")}` : "No fill-in fields."}
          >
            <textarea
              rows={9}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              className="w-full rounded-md border border-bd bg-bg px-3 py-2 font-mono text-xs text-ink focus:border-acc focus:outline-none"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
            Send this email
          </label>
          <div className="flex gap-2">
            <Button disabled={!dirty || busy} onClick={() => call("PUT")}>
              Save
            </Button>
            {tpl.customised && (
              <Button variant="ghost" disabled={busy} onClick={() => call("DELETE")}>
                Restore original wording
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function OutboxItem({ row }: { row: OutboxRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      await fetch(`/api/admin/email/outbox/${row.id}/retry`, { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-bd px-4 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3 text-sm">
        <button className="text-left" onClick={() => setOpen(!open)}>
          <span className="font-medium">{row.subject}</span>
          <span className="block text-xs text-sub">
            {row.toEmail} · {row.templateKey} · {new Date(row.createdAt).toLocaleString()}
          </span>
        </button>
        <div className="flex items-center gap-2">
          <Badge tone={TONE[row.status]}>{row.status}</Badge>
          {row.status === "failed" && (
            <Button variant="ghost" disabled={busy} onClick={retry}>
              Retry
            </Button>
          )}
        </div>
      </div>
      {row.lastError && <p className="mt-1 text-xs text-sub">{row.lastError}{row.status === "failed" ? ` (attempt ${row.attempts})` : ""}</p>}
      {open && <pre className="mt-2 whitespace-pre-wrap rounded-md bg-raise p-3 text-xs">{row.body}</pre>}
    </div>
  );
}

export default function EmailView({ templates, outbox, adminEmail }: { templates: Template[]; outbox: OutboxRow[]; adminEmail: string }) {
  const router = useRouter();
  const [testMsg, setTestMsg] = useState<string | null>(null);

  async function sendTest() {
    setTestMsg(null);
    const res = await fetch("/api/admin/email/test", { method: "POST" });
    setTestMsg(res.ok ? `Test email queued to ${adminEmail}.` : "Couldn't queue the test email.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Email wording</h2>
          <Button variant="ghost" onClick={sendTest}>
            Send a test email to me
          </Button>
        </div>
        {testMsg && <p className="mb-3 text-xs text-sub">{testMsg}</p>}
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <TemplateCard key={t.key + t.subject + t.body + t.enabled} tpl={t} />
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Recent emails</h2>
        <Card>
          {outbox.length === 0 ? <p className="p-4 text-sm text-sub">Nothing sent yet.</p> : outbox.map((o) => <OutboxItem key={o.id} row={o} />)}
        </Card>
      </section>
    </div>
  );
}
