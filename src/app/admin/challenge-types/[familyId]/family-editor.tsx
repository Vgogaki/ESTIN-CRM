"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ChallengeTypeForm, { type FormValue } from "../challenge-type-form";

type LatestVersion = {
  id: string;
  active: boolean;
  name: string;
  description: string | null;
  productType: string;
  accountSize: string;
  fee: string;
  currency: string;
  leverageCap: number;
  permittedInstruments: string[];
  kycTiming: string;
  phases: {
    order: number;
    label: string;
    isFunded: boolean;
    profitTargetPct: string | null;
    dailyLossPct: string;
    maxLossPct: string;
    drawdownType: string;
    minTradingDays: number;
    timeLimitDays: number | null;
    profitSplitPct: string | null;
    payoutCycleDays: number | null;
  }[];
};

export default function FamilyEditor({ latest }: { latest: LatestVersion }) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const initialValue: FormValue = {
    name: latest.name,
    description: latest.description ?? "",
    productType: latest.productType as FormValue["productType"],
    accountSize: Number(latest.accountSize),
    fee: Number(latest.fee),
    currency: latest.currency,
    leverageCap: latest.leverageCap,
    permittedInstruments: latest.permittedInstruments.join(", "),
    kycTiming: latest.kycTiming as FormValue["kycTiming"],
    phases: latest.phases.map((p) => ({
      order: p.order,
      label: p.label,
      isFunded: p.isFunded,
      profitTargetPct: p.profitTargetPct ? Number(p.profitTargetPct) : null,
      dailyLossPct: Number(p.dailyLossPct),
      maxLossPct: Number(p.maxLossPct),
      drawdownType: p.drawdownType as "trailing" | "static",
      minTradingDays: p.minTradingDays,
      timeLimitDays: p.timeLimitDays,
      profitSplitPct: p.profitSplitPct ? Number(p.profitSplitPct) : null,
      payoutCycleDays: p.payoutCycleDays,
    })),
  };

  async function publish() {
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/admin/challenge-types/${latest.id}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setPublishError(data.error ?? "Failed to publish.");
        return;
      }
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          className={`rounded px-2 py-1 text-xs ${
            latest.active ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {latest.active ? "Published — sellable now" : "Draft — not sellable yet"}
        </span>
        {!latest.active && (
          <button
            onClick={publish}
            disabled={publishing}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {publishing ? "Publishing…" : "Publish this version"}
          </button>
        )}
        {publishError && <p className="text-sm text-red-600">{publishError}</p>}
      </div>

      <ChallengeTypeForm
        initialValue={initialValue}
        submitUrl={`/api/admin/challenge-types/${latest.id}`}
        submitMethod="PATCH"
        submitLabel="Save changes"
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
