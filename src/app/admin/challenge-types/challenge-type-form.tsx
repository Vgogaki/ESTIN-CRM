"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Phase = {
  order: number;
  label: string;
  isFunded: boolean;
  profitTargetPct: number | null;
  dailyLossPct: number;
  maxLossPct: number;
  drawdownType: "trailing" | "static";
  minTradingDays: number;
  timeLimitDays: number | null;
  profitSplitPct: number | null;
  payoutCycleDays: number | null;
};

export type FormValue = {
  name: string;
  description: string;
  productType: "standard" | "promotional" | "competition_linked" | "instant_funded";
  accountSize: number;
  fee: number;
  currency: string;
  leverageCap: number;
  permittedInstruments: string;
  kycTiming: "at_creation" | "after_evaluation" | "at_first_payout";
  phases: Phase[];
};

const emptyEvaluationPhase = (order: number): Phase => ({
  order,
  label: `Phase ${order}`,
  isFunded: false,
  profitTargetPct: 10,
  dailyLossPct: 5,
  maxLossPct: 10,
  drawdownType: "trailing",
  minTradingDays: 3,
  timeLimitDays: null,
  profitSplitPct: null,
  payoutCycleDays: null,
});

const fundedPhase = (order: number): Phase => ({
  order,
  label: "Funded",
  isFunded: true,
  profitTargetPct: null,
  dailyLossPct: 5,
  maxLossPct: 10,
  drawdownType: "trailing",
  minTradingDays: 0,
  timeLimitDays: null,
  profitSplitPct: 80,
  payoutCycleDays: 14,
});

export const defaultFormValue: FormValue = {
  name: "",
  description: "",
  productType: "standard",
  accountSize: 50000,
  fee: 300,
  currency: "EUR",
  leverageCap: 100,
  permittedInstruments: "EURUSD, GBPUSD, USDJPY",
  kycTiming: "after_evaluation",
  phases: [emptyEvaluationPhase(1), fundedPhase(2)],
};

type Props = {
  initialValue?: FormValue;
  submitUrl: string;
  submitMethod: "POST" | "PATCH";
  submitLabel: string;
  onSaved: (result: { id: string; familyId: string }) => void;
};

export default function ChallengeTypeForm({
  initialValue,
  submitUrl,
  submitMethod,
  submitLabel,
  onSaved,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState<FormValue>(initialValue ?? defaultFormValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updatePhase(index: number, patch: Partial<Phase>) {
    setValue((v) => ({
      ...v,
      phases: v.phases.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  }

  function addEvaluationPhase() {
    setValue((v) => {
      const insertAt = v.phases.findIndex((p) => p.isFunded);
      const order = (insertAt === -1 ? v.phases.length : insertAt) + 1;
      const phases = [...v.phases];
      phases.splice(insertAt === -1 ? phases.length : insertAt, 0, emptyEvaluationPhase(order));
      return { ...v, phases: phases.map((p, i) => ({ ...p, order: i + 1 })) };
    });
  }

  function removePhase(index: number) {
    setValue((v) => ({
      ...v,
      phases: v.phases.filter((_, i) => i !== index).map((p, i) => ({ ...p, order: i + 1 })),
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(submitUrl, {
        method: submitMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: value.name,
          description: value.description || null,
          productType: value.productType,
          accountSize: Number(value.accountSize),
          fee: Number(value.fee),
          currency: value.currency,
          leverageCap: Number(value.leverageCap),
          permittedInstruments: value.permittedInstruments
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          kycTiming: value.kycTiming,
          phases: value.phases,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save.");
        return;
      }
      onSaved(data);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            required
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Product type
          <select
            value={value.productType}
            onChange={(e) => setValue({ ...value, productType: e.target.value as FormValue["productType"] })}
            className="rounded border px-3 py-2"
          >
            <option value="standard">Standard</option>
            <option value="promotional">Promotional</option>
            <option value="competition_linked">Competition-linked</option>
            <option value="instant_funded">Instant funded</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Account size
          <input
            type="number"
            required
            value={value.accountSize}
            onChange={(e) => setValue({ ...value, accountSize: Number(e.target.value) })}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Fee
          <input
            type="number"
            required
            value={value.fee}
            onChange={(e) => setValue({ ...value, fee: Number(e.target.value) })}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Currency
          <input
            required
            maxLength={3}
            value={value.currency}
            onChange={(e) => setValue({ ...value, currency: e.target.value.toUpperCase() })}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Leverage cap (e.g. 100 for 1:100)
          <input
            type="number"
            required
            value={value.leverageCap}
            onChange={(e) => setValue({ ...value, leverageCap: Number(e.target.value) })}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-sm">
          Permitted instruments (comma-separated)
          <input
            value={value.permittedInstruments}
            onChange={(e) => setValue({ ...value, permittedInstruments: e.target.value })}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          KYC timing
          <select
            value={value.kycTiming}
            onChange={(e) => setValue({ ...value, kycTiming: e.target.value as FormValue["kycTiming"] })}
            className="rounded border px-3 py-2"
          >
            <option value="at_creation">At creation</option>
            <option value="after_evaluation">After evaluation</option>
            <option value="at_first_payout">At first payout</option>
          </select>
        </label>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium">Phases</h2>
          <button
            type="button"
            onClick={addEvaluationPhase}
            className="text-sm underline"
          >
            + Add evaluation phase
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {value.phases.map((phase, i) => (
            <div key={i} className="rounded border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">
                  {i + 1}. {phase.isFunded ? "Funded stage" : "Evaluation phase"}
                </span>
                {!phase.isFunded && value.phases.length > 1 && (
                  <button type="button" onClick={() => removePhase(i)} className="text-xs text-red-600 underline">
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <label className="flex flex-col gap-1">
                  Label
                  <input
                    value={phase.label}
                    onChange={(e) => updatePhase(i, { label: e.target.value })}
                    className="rounded border px-2 py-1"
                  />
                </label>
                {!phase.isFunded && (
                  <label className="flex flex-col gap-1">
                    Profit target %
                    <input
                      type="number"
                      value={phase.profitTargetPct ?? ""}
                      onChange={(e) => updatePhase(i, { profitTargetPct: Number(e.target.value) })}
                      className="rounded border px-2 py-1"
                    />
                  </label>
                )}
                <label className="flex flex-col gap-1">
                  Daily loss %
                  <input
                    type="number"
                    value={phase.dailyLossPct}
                    onChange={(e) => updatePhase(i, { dailyLossPct: Number(e.target.value) })}
                    className="rounded border px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Max loss %
                  <input
                    type="number"
                    value={phase.maxLossPct}
                    onChange={(e) => updatePhase(i, { maxLossPct: Number(e.target.value) })}
                    className="rounded border px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Drawdown type
                  <select
                    value={phase.drawdownType}
                    onChange={(e) => updatePhase(i, { drawdownType: e.target.value as Phase["drawdownType"] })}
                    className="rounded border px-2 py-1"
                  >
                    <option value="trailing">Trailing</option>
                    <option value="static">Static</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  Min trading days
                  <input
                    type="number"
                    value={phase.minTradingDays}
                    onChange={(e) => updatePhase(i, { minTradingDays: Number(e.target.value) })}
                    className="rounded border px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Time limit (days, blank = none)
                  <input
                    type="number"
                    value={phase.timeLimitDays ?? ""}
                    onChange={(e) =>
                      updatePhase(i, { timeLimitDays: e.target.value ? Number(e.target.value) : null })
                    }
                    className="rounded border px-2 py-1"
                  />
                </label>
                {phase.isFunded && (
                  <>
                    <label className="flex flex-col gap-1">
                      Profit split % (trader)
                      <input
                        type="number"
                        value={phase.profitSplitPct ?? ""}
                        onChange={(e) => updatePhase(i, { profitSplitPct: Number(e.target.value) })}
                        className="rounded border px-2 py-1"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Payout cycle (days)
                      <input
                        type="number"
                        value={phase.payoutCycleDays ?? ""}
                        onChange={(e) => updatePhase(i, { payoutCycleDays: Number(e.target.value) })}
                        className="rounded border px-2 py-1"
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
