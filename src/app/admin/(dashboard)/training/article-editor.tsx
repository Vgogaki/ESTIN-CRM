"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type Article = {
  id?: string;
  section: string;
  title: string;
  summary: string;
  body: string;
  videoUrl: string;
  sortOrder: number;
  published: boolean;
};

const SECTIONS = [
  ["platform_how_to", "Using the platform"],
  ["challenge_rules", "Challenge rules"],
  ["risk_management", "Risk management"],
  ["trading_education", "Trading education"],
] as const;

export default function ArticleEditor({ initial }: { initial: Article }) {
  const router = useRouter();
  const [a, setA] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [reason, setReason] = useState("");

  async function call(url: string, method: string, body: unknown) {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  }

  const payload = {
    section: a.section,
    title: a.title,
    summary: a.summary || null,
    body: a.body,
    videoUrl: a.videoUrl || null,
    sortOrder: a.sortOrder,
  };

  async function save() {
    if (!a.id) {
      const data = await call("/api/admin/training", "POST", payload);
      if (data) router.push(`/admin/training/${data.id}`);
      return;
    }
    if (await call(`/api/admin/training/${a.id}`, "PUT", payload)) {
      setSaved(true);
      router.refresh();
    }
  }

  async function togglePublish() {
    const next = !a.published;
    if (await call(`/api/admin/training/${a.id}`, "PATCH", { published: next })) {
      setA({ ...a, published: next });
      router.refresh();
    }
  }

  async function archive() {
    if (await call(`/api/admin/training/${a.id}`, "DELETE", { reason })) router.push("/admin/training");
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Saved.</Alert>}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Title" className="col-span-2">
          <Input value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} maxLength={200} />
        </Field>
        <Field label="Section">
          <Select value={a.section} onChange={(e) => setA({ ...a, section: e.target.value })}>
            {SECTIONS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Short summary" hint="Shown in the list. Optional.">
        <Input value={a.summary} onChange={(e) => setA({ ...a, summary: e.target.value })} maxLength={500} />
      </Field>
      <Field label="Text" hint="Plain text. A blank line starts a new paragraph; web addresses become links.">
        <textarea
          rows={14}
          value={a.body}
          onChange={(e) => setA({ ...a, body: e.target.value })}
          className="w-full rounded-md border border-bd bg-bg px-3 py-2 text-sm text-ink focus:border-acc focus:outline-none"
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Video link" hint="Optional. https:// only; it opens in a new tab." className="col-span-2">
          <Input value={a.videoUrl} onChange={(e) => setA({ ...a, videoUrl: e.target.value })} placeholder="https://" />
        </Field>
        <Field label="Order" hint="Lower comes first.">
          <Input type="number" min={0} value={a.sortOrder} onChange={(e) => setA({ ...a, sortOrder: Number(e.target.value) || 0 })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={save}>
          {a.id ? "Save changes" : "Create draft"}
        </Button>
        {a.id && (
          <>
            <Button variant="ghost" disabled={busy} onClick={togglePublish}>
              {a.published ? "Unpublish" : "Publish"}
            </Button>
            <Badge tone={a.published ? "success" : "neutral"}>{a.published ? "published" : "draft"}</Badge>
            <span className="flex-1" />
            {archiving ? (
              <>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why archive?" className="max-w-56" />
                <Button variant="danger" disabled={busy || !reason.trim()} onClick={archive}>
                  Confirm archive
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setArchiving(true)}>
                Archive
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
