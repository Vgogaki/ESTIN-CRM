import { notFound, redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { getAffiliate } from "@/server/affiliates";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import AffiliateDetail from "./affiliate-detail";

export default async function AffiliatePage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "affiliates.manage")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }
  const { id } = await params;
  const a = await getAffiliate(id);
  if (!a) notFound();

  return (
    <div>
      <PageHeader title={a.name} subtitle={a.email} backHref="/admin/affiliates" backLabel="Affiliates" />
      <Card className="mb-5 grid grid-cols-2 gap-3 p-5 text-sm md:grid-cols-4">
        <div>
          <p className="text-xs text-sub uppercase">Code</p>
          <p className="font-mono">{a.code}</p>
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
