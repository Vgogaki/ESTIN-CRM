"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

type Action = "allowed" | "review" | "blocked";
const STAGES = ["registration", "purchase", "trading", "payout"] as const;
type Rule = { countryCode: string; registration: Action; purchase: Action; trading: Action; payout: Action; note: string | null };
type Review = { id: string; personId: string; fullName: string; countryCode: string; stage: string; createdAt: string };

function RuleRow({ rule }: { rule: Rule }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Rule>(rule);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const dirty = STAGES.some((s) => draft[s] !== rule[s]) || (draft.note ?? "") !== (rule.note ?? "");

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/countries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/countries/${rule.countryCode}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to remove.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b border-bd px-4 py-3 last:border-b-0">
      <div className="grid grid-cols-6 items-end gap-2">
        <p className="pb-2 font-mono text-sm">{rule.countryCode}</p>
        {STAGES.map((s) => (
          <Field key={s} label={s}>
            <Select value={draft[s]} onChange={(e) => setDraft({ ...draft, [s]: e.target.value as Action })}>
              <option value="allowed">Allowed</option>
              <option value="review">Review</option>
              <option value="blocked">Blocked</option>
            </Select>
          </Field>
        ))}
        <Button disabled={!dirty || saving} onClick={save}>
          Save
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input
          value={draft.note ?? ""}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          placeholder="Why — e.g. who advised this, and when"
        />
        {confirmingRemove ? (
          <>
            <Button variant="danger" disabled={saving} onClick={remove}>
              Confirm remove
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingRemove(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmingRemove(true)}>
            Remove
          </Button>
        )}
      </div>
      {error && (
        <div className="mt-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </div>
  );
}

function AddCountry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    const res = await fetch("/api/admin/countries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countryCode: code, registration: "review", purchase: "review", trading: "allowed", payout: "review" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed.");
      return;
    }
    setCode("");
    router.refresh();
  }

  return (
    <Card className="p-5">
      <div className="flex items-end gap-2">
        <div className="w-40">
          <Field label="Country code" hint="2 letters, e.g. CY">
            <Input value={code} maxLength={2} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
        </div>
        <Button disabled={code.length !== 2} onClick={add}>
          Add country
        </Button>
      </div>
      <p className="mt-2 text-xs text-sub">
        Starts as review (not blocked) for registration, purchase and payout, so nothing is refused until you
        change it deliberately.
      </p>
      {error && (
        <div className="mt-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </Card>
  );
}

function ReviewRow({ review }: { review: Review }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function clear() {
    setError(null);
    const res = await fetch(`/api/admin/countries/reviews/${review.id}/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 border-b border-bd px-4 py-3 text-sm last:border-b-0">
      <div className="flex items-center justify-between">
        <Link href={`/admin/traders/${review.personId}`} className="hover:text-acc">
          {review.fullName}
        </Link>
        <span className="text-xs text-sub">
          {review.countryCode} · {review.stage} · {new Date(review.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div className="flex gap-2">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was checked, and the outcome" />
        <Button disabled={note.trim().length < 4} onClick={clear}>
          Clear review
        </Button>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}

export default function CountriesView({ rules, reviews }: { rules: Rule[]; reviews: Review[] }) {
  return (
    <div className="flex flex-col gap-5">
      {reviews.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-bd px-4 py-3 text-sm font-medium">Open reviews ({reviews.length})</div>
          {reviews.map((r) => (
            <ReviewRow key={r.id} review={r} />
          ))}
        </Card>
      )}
      <AddCountry />
      {rules.length === 0 ? (
        <Card className="p-6 text-sm text-sub">No countries listed — everything is allowed.</Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {rules.map((r) => (
            <RuleRow key={r.countryCode} rule={r} />
          ))}
        </Card>
      )}
    </div>
  );
}
