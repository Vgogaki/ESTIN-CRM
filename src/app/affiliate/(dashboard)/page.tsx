import { redirect } from "next/navigation";
import { getCurrentAffiliate } from "@/server/auth/guard";
import { getAffiliateSelf } from "@/server/affiliates";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";

const TONE = { pending: "warning", approved: "accent", paid: "success", voided: "neutral" } as const;

export default async function AffiliateDashboardPage() {
  const current = await getCurrentAffiliate();
  if (!current) redirect("/affiliate/login");
  const a = await getAffiliateSelf(current.id);
  if (!a) redirect("/affiliate/login");

  return (
    <div>
      <PageHeader title="Your affiliate account" subtitle={`Referral code ${a.code} · ${a.commissionPct.toString()}% commission`} />
      {a.status === "suspended" && (
        <Alert tone="warning">Your affiliate account is currently suspended — you are not earning new commissions on referrals.</Alert>
      )}
      <Card className="mb-5 grid grid-cols-1 gap-3 p-5 text-sm sm:grid-cols-3">
        {Object.keys(a.totals).length === 0 ? (
          <p className="text-sub">No referrals recorded yet.</p>
        ) : (
          Object.entries(a.totals).map(([cur, t]) => (
            <div key={cur}>
              <p className="text-xs text-sub uppercase">{cur}</p>
              <p>{t.pending} pending</p>
              <p>{t.approved} approved</p>
              <p className="font-semibold">{t.paid} paid</p>
            </div>
          ))
        )}
      </Card>
      <h2 className="mb-2 text-sm font-semibold">Referred purchases</h2>
      <Card>
        {a.commissions.length === 0 ? (
          <p className="p-4 text-sm text-sub">Share your code, {a.code}, with checkout to start earning commission.</p>
        ) : (
          a.commissions.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 border-b border-bd px-4 py-3 text-sm last:border-b-0">
              <div>
                <p className="font-mono text-xs text-sub">{c.orderRef}</p>
                <p>
                  {c.baseAmount.toString()} {c.currency} × {c.ratePct.toString()}% ={" "}
                  <span className="font-semibold">
                    {c.amount.toString()} {c.currency}
                  </span>
                </p>
                <p className="text-xs text-sub">
                  {new Date(c.createdAt).toLocaleDateString()}
                  {c.paidAt && ` · paid ${new Date(c.paidAt).toLocaleDateString()}`}
                </p>
              </div>
              <Badge tone={TONE[c.status]}>{c.status}</Badge>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
