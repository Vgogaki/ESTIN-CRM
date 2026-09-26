"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export default function NewThreadForm() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("other");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const form = new FormData();
      form.set("subject", subject);
      form.set("category", category);
      form.set("body", body);
      for (const f of Array.from(fileRef.current?.files ?? [])) form.append("files", f);
      const res = await fetch("/api/portal/support/threads", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to send.");
        return;
      }
      router.push(`/portal/support/${data.id}`);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold">New conversation</h2>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Subject" className="col-span-2">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Topic">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="account">Account</option>
              <option value="payout">Payout</option>
              <option value="kyc">Verification (KYC)</option>
              <option value="technical">Technical</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={5000}
          placeholder="How can we help?"
          className="w-full rounded-md border border-bd bg-bg px-3 py-2 text-sm text-ink placeholder:text-sub focus:border-acc focus:outline-none"
        />
        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,application/pdf" className="text-xs text-sub" />
        <p className="text-xs text-sub">Up to 3 files (JPG, PNG or PDF), 10 MB each.</p>
        <div>
          <Button type="submit" disabled={sending || subject.trim() === "" || body.trim() === ""}>
            Send
          </Button>
        </div>
      </form>
    </Card>
  );
}
