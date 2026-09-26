"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export type ThreadMessage = {
  id: string;
  author: "trader" | "admin";
  authorName: string;
  body: string;
  createdAt: string;
  attachments: { id: string; originalName: string }[];
};

/** `base` is "/api/portal/support" or "/api/admin/support"; both expose the same attachment path. */
export function MessageList({ messages, base }: { messages: ThreadMessage[]; base: string }) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((m) => (
        <Card key={m.id} className={`p-4 ${m.author === "admin" ? "border-l-2 border-l-acc" : ""}`}>
          <div className="flex items-baseline justify-between gap-3 text-xs text-sub">
            <span className="font-medium text-ink">{m.authorName}</span>
            <span>{new Date(m.createdAt).toLocaleString()}</span>
          </div>
          <p className="mt-2 text-sm whitespace-pre-wrap">{m.body}</p>
          {m.attachments.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">
              {m.attachments.map((a) => (
                <li key={a.id}>
                  <a className="text-acc underline" href={`${base}/attachments/${a.id}`}>
                    {a.originalName}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}

export function ReplyForm({
  url,
  offerResolve = false,
  label = "Send reply",
}: {
  url: string;
  offerResolve?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [resolve, setResolve] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const form = new FormData();
      form.set("body", body);
      if (resolve) form.set("resolve", "1");
      for (const f of Array.from(fileRef.current?.files ?? [])) form.append("files", f);
      const res = await fetch(url, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to send.");
        return;
      }
      setBody("");
      setResolve(false);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={5000}
        placeholder="Write a message…"
        className="w-full rounded-md border border-bd bg-bg px-3 py-2 text-sm text-ink placeholder:text-sub focus:border-acc focus:outline-none"
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,application/pdf"
        className="text-xs text-sub"
      />
      <p className="text-xs text-sub">Up to 3 files (JPG, PNG or PDF), 10 MB each.</p>
      {offerResolve && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={resolve} onChange={(e) => setResolve(e.target.checked)} />
          Mark as resolved after replying
        </label>
      )}
      <div>
        <Button type="submit" disabled={sending || body.trim() === ""}>
          {label}
        </Button>
      </div>
    </form>
  );
}
