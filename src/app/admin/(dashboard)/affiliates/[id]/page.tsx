import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { getAffiliate } from "@/server/affiliates";
import { listCodesForAffiliate, listIntroducedForStaff } from "@/server/affiliate-referrals";
import { STAGE_LABEL } from "@/server/affiliate-code";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AffiliateDetail from "./affiliate-detail";
import CodeAdmin from "./code-admin";

const SOURCE_TEXT = {
  recorded_by_affiliate: "Recorded by the affiliate",
  registration_code: "Registered with the code",
  order_code: "Bought with the code",
} as const;

export default async function AffiliatePage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "affiliates.manage")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }
  const { id } = await params;
  const a = await getAffiliate(id);
  if (!a) notFound();
  const [codes, introduced] = await Promise.all([listCodesForAffiliate(a.id), listIntroducedForStaff(a.id)]);
  const activeCode = codes.find((c) => c.revokedAt === null);

  return (
    <div>
      <PageHeader title={a.name} subtitle={a.email} backHref="/admin/affiliates" backLabel="Affiliates" />
      <Card className="mb-5 grid grid-cols-2 gap-3 p-5 text-sm md:grid-cols-4">
        <div>
          <p className="text-xs text-sub uppercase">Active code</p>
          <p className="font-mono">{activeCode ? activeCode.code : <span className="font-sans text-sub">none yet</span>}</p>
        </div>
        <div>
          <p className="text-xs text-sub uppercase">Commission</p>
          <p>{a.commissionPct.toString()}% of amount paid</p>
        </div>
        <div>
          <p className="text-xs text-sub uppercase">Linked trader</p>
          <p>{a.personId ? "yes" : "no"}</p>
        </div>
        <div>
          <p className="text-xs text-sub uppercase">Portal access</p>
          <p>{a.passwordHash ? `set up${a.lastLoginAt ? `, last signed in ${a.lastLoginAt.toLocaleDateString()}` : " (not yet signed in)"}` : "invited, not set up"}</p>
        </div>
        <div>
          <p className="text-xs text-sub uppercase">Totals</p>
          {Object.keys(a.totals).length === 0 ? (
            <p className="text-sub">none yet</p>
          ) : (
            Object.entries(a.totals).map(([cur, t]) => (
              <p key={cur} className="text-xs">
                {cur}: {t.pending} pending · {t.approved} approved · {t.paid} paid
              </p>
            ))
          )}
        </div>
      </Card>
      <CodeAdmin
        codes={codes.map((c) => ({
          id: c.id,
          code: c.code,
          origin: c.origin,
          createdAt: c.createdAt.toISOString(),
          revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
          revokeReason: c.revokeReason,
        }))}
      />

      <h2 className="mb-2 text-sm font-semibold">
        Introduced traders{" "}
        <span className="font-normal text-sub">
          · {introduced.funnel.introduced} introduced, {introduced.funnel.registered} registered, {introduced.funnel.purchased} bought, {introduced.funnel.funded} funded
        </span>
      </h2>
      <Card className="mb-5">
        {introduced.rows.length === 0 ? (
          <p className="p-4 text-sm text-sub">Nobody introduced yet.</p>
        ) : (
          introduced.rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b border-bd px-4 py-3 text-sm last:border-b-0">
              <div>
                <p className="font-medium">
                  {r.personId ? (
                    <Link href={`/admin/traders/${r.personId}`} className="hover:text-acc">
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                  <span className="ml-2 text-xs font-normal text-sub">{r.email}</span>
                </p>
                <p className="text-xs text-sub">
                  {SOURCE_TEXT[r.source]}
                  {r.codeUsed && ` · code ${r.codeUsed}`} · introduced {r.introducedAt.toLocaleDateString()}
                  {r.matchedAt && ` · linked ${r.matchedAt.toLocaleDateString()}`}
                </p>
              </div>
              <Badge tone={r.stage === "funded" ? "success" : r.stage === "not_signed_up" ? "neutral" : "accent"}>{STAGE_LABEL[r.stage]}</Badge>
            </div>
          ))
        )}
      </Card>

      <h2 className="mb-2 text-sm font-semibold">Commissions</h2>
      <AffiliateDetail
        id={a.id}
        status={a.status}
        hasPassword={!!a.passwordHash}
        commissions={a.commissions.map((c) => ({
          id: c.id,
          orderRef: c.orderRef,
          baseAmount: c.baseAmount.toString(),
          ratePct: c.ratePct.toString(),
          amount: c.amount.toString(),
          currency: c.currency,
          status: c.status,
          flag: c.flag,
          reviewNote: c.reviewNote,
          paymentReference: c.paymentReference,
          voidReason: c.voidReason,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
