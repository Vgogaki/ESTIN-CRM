import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// All launch challenge tiers are EUR (docs/decisions.md) — see the
// single-currency caveat in src/server/firm-stats.ts.
const CURRENCY = "EUR";

function money(value: string | number) {
  const n = Number(value);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: CURRENCY }).format(n);
  } catch {
    return `${CURRENCY} ${n.toFixed(2)}`;
  }
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-sub uppercase">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-sub">{sub}</p>}
    </Card>
  );
}

type Props = {
  adminName: string;
  stats: {
    revenue: string;
    payoutsApproved: string;
    net: string;
    challengesSold: number;
    fundedTraders: number;
    passRate: number;
    months: { label: string; revenue: string; payouts: string }[];
  };
  tasks: {
    readyToPass: number;
    flagged: number;
    pendingWithdrawals: number;
    pendingWithdrawalsTotal: string;
    kycSubmitted: number;
  };
  recentTraders: {
    id: string;
    fullName: string;
    email: string;
    kycStatus: string;
    accountCount: number;
  }[];
};

export default function FirmStats({ stats, tasks, recentTraders }: Props) {
  const maxMonthly = Math.max(1, ...stats.months.map((m) => Math.max(Number(m.revenue), Number(m.payouts))));

  return (
    <div>
      <PageHeader title="Firm statistics" subtitle="Fees, payouts, and where the business stands right now." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Challenge revenue" value={money(stats.revenue)} sub="Fees collected" />
        <Stat label="Payouts approved" value={money(stats.payoutsApproved)} sub="Trader share paid out" />
        <Stat label="Net position" value={money(stats.net)} sub="Revenue less payouts" />
        <Stat label="Challenges sold" value={String(stats.challengesSold)} />
        <Stat label="Funded traders" value={String(stats.fundedTraders)} />
        <Stat label="Pass rate" value={`${stats.passRate}%`} sub="Of accounts that reached an outcome" />
      </div>

      <p className="mt-6 mb-2 text-xs font-medium tracking-wide text-sub uppercase">Needs attention</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/admin/pending-tasks">
          <Stat label="Ready to pass" value={String(tasks.readyToPass)} />
        </Link>
        <Link href="/admin/pending-tasks">
          <Stat label="Breach flagged" value={String(tasks.flagged)} />
        </Link>
        <Link href="/admin/withdrawals">
          <Stat
            label="Pending payouts"
            value={money(tasks.pendingWithdrawalsTotal)}
            sub={`${tasks.pendingWithdrawals} request${tasks.pendingWithdrawals === 1 ? "" : "s"}`}
          />
        </Link>
        <Link href="/admin/pending-tasks">
          <Stat label="KYC to review" value={String(tasks.kycSubmitted)} />
        </Link>
      </div>

      <p className="mt-6 mb-2 text-xs font-medium tracking-wide text-sub uppercase">
        Revenue &amp; payouts, last 12 months
      </p>
      <Card className="p-4">
        <div className="flex items-end gap-2" style={{ height: 120 }}>
          {stats.months.map((m) => (
            <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end gap-0.5">
                <div
                  className="flex-1 rounded-t bg-acc"
                  style={{ height: `${(Number(m.revenue) / maxMonthly) * 100}%` }}
                  title={`Revenue: ${money(m.revenue)}`}
                />
                <div
                  className="flex-1 rounded-t bg-gold"
                  style={{ height: `${(Number(m.payouts) / maxMonthly) * 100}%` }}
                  title={`Payouts: ${money(m.payouts)}`}
                />
              </div>
              <span className="text-[10px] text-sub">{m.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-sub">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-acc" /> Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-gold" /> Payouts
          </span>
        </div>
      </Card>

      <p className="mt-6 mb-2 text-xs font-medium tracking-wide text-sub uppercase">Recent traders</p>
      {recentTraders.length === 0 ? (
        <Card className="p-6 text-sm text-sub">No traders yet.</Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {recentTraders.map((t) => (
            <Link
              key={t.id}
              href={`/admin/traders/${t.id}`}
              className="flex items-center justify-between border-b border-bd px-4 py-2.5 text-sm last:border-b-0 hover:bg-raise"
            >
              <div>
                <span>{t.fullName}</span>
                <span className="ml-2 text-xs text-sub">{t.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-sub">
                  {t.accountCount} account{t.accountCount === 1 ? "" : "s"}
                </span>
                <Badge tone={t.kycStatus === "verified" ? "success" : "neutral"}>{t.kycStatus}</Badge>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
