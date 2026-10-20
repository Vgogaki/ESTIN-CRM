import { redirect } from "next/navigation";
import { getCurrentAffiliate } from "@/server/auth/guard";
import { getAffiliateSelf } from "@/server/affiliates";
import { listIntroducedForAffiliate } from "@/server/affiliate-referrals";
import { referralLink, STAGE_LABEL, type ReferralStage } from "@/server/affiliate-code";
import { appBaseUrl } from "@/server/email/transport";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import CodeCard from "./code-card";
import AddTraderForm from "./add-trader-form";

const TONE = { pending: "warning", approved: "accent", paid: "success", voided: "neutral" } as const;
const STAGE_TONE: Record<ReferralStage, "neutral" | "accent" | "success"> = {
  not_signed_up: "neutral",
  registered: "accent",
  purchased: "accent",
  funded: "success",
};

export default async function AffiliateDashboardPage() {
  const current = await getCurrentAffiliate();
  if (!current) redirect("/affiliate/login");
  const a = await getAffiliateSelf(current.id);
  if (!a) redirect("/affiliate/login");
  const introduced = await listIntroducedForAffiliate(a.id);
  const suspended = a.status === "suspended";
  const f = introduced.funnel;

  return (
    <div>
      <PageHeader title="Your affiliate account" subtitle={`${a.commissionPct.toString()}% commission on the purchases you refer`} />
      {suspended && (
        <Alert tone="warning">Your affiliate account is currently suspended — you are not earning new commissions on referrals.</Alert>
      )}

      <CodeCard
        code={a.code?.value ?? null}
        createdAt={a.code ? a.code.createdAt.toISOString() : null}
        link={a.code ? referralLink(appBaseUrl(), a.code.value) : null}
        lastDeactivated={a.lastDeactivatedCode ? { value: a.lastDeactivatedCode.value, date: a.lastDeactivatedCode.revokedAt.toISOString() } : null}
        suspended={suspended}
      />

      <h2 className="mb-2 text-sm font-semibold">Your introduced traders</h2>
      <Card className="mb-5 grid grid-cols-2 gap-3 p-5 text-sm sm:grid-cols-4">
        {[
          ["Introduced", f.introduced],
          ["Registered", f.registered],
          ["Bought a challenge", f.purchased],
          ["Funded", f.funded],
        ].map(([label, n]) => (
          <div key={label as string}>
            <p className="text-xs text-sub uppercase">{label}</p>
            <p className="text-2xl font-semibold">{n}</p>
          </div>
        ))}
      </Card>

      <AddTraderForm disabled={suspended} />

      <Card className="mb-8">
        {introduced.rows.length === 0 ? (
          <p className="p-4 text-sm text-sub">
            {a.code ? "Nobody yet. Share your link, or add someone above, and they will appear here." : "Generate your referral code above to start."}
          </p>
        ) : (
          introduced.rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b border-bd px-4 py-3 text-sm last:border-b-0">
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-sub">
                  {r.maskedEmail} · introduced {new Date(r.introducedAt).toLocaleDateString()}
                </p>
              </div>
              <Badge tone={STAGE_TONE[r.stage]}>{STAGE_LABEL[r.stage]}</Badge>
            </div>
          ))
        )}
      </Card>

      <h2 className="mb-2 text-sm font-semibold">Commission</h2>
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
          <p className="p-4 text-sm text-sub">
            {a.code ? `Purchases made with your code, ${a.code.value}, will appear here with the commission earned.` : "Generate your referral code to start earning commission."}
          </p>
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
