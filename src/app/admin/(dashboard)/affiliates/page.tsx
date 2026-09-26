import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { listAffiliates } from "@/server/affiliates";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import NewAffiliateForm from "./new-affiliate-form";

export default async function AffiliatesPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "affiliates.manage")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }
  const affiliates = await listAffiliates();

  return (
    <div>
      <PageHeader title="Affiliates" subtitle="Referral partners, their codes, and the commission earned on referred purchases." />
      <Alert tone="warning">
        Whether affiliates are part of V1, and the commission model, are still open (decisions.md #7). So there is no
        default rate: you choose a percentage for each affiliate, commission is a percentage of what the buyer actually
        paid, and nothing is paid automatically. You approve each commission, send the money yourself, then record the
        reference here.
      </Alert>
      <div className="mt-5">
        <NewAffiliateForm />
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {affiliates.length === 0 ? (
          <Card className="p-6 text-sm text-sub">No affiliates yet.</Card>
        ) : (
          affiliates.map((a) => (
            <Link key={a.id} href={`/admin/affiliates/${a.id}`}>
              <Card className="flex items-center justify-between gap-3 p-4 hover:border-acc">
                <div>
                  <p className="text-sm font-medium">
                    {a.name} <span className="font-mono text-xs text-sub">{a.code}</span>
                  </p>
                  <p className="text-xs text-sub">
                    {a.commissionPct.toString()}% · {a.salesCount} referred sale(s)
                    {Object.entries(a.totals).map(([cur, t]) => ` · ${cur}: ${t.pending} pending, ${t.approved} approved, ${t.paid} paid`)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {a.flaggedOpen > 0 && <Badge tone="warning">{a.flaggedOpen} flagged</Badge>}
                  <Badge tone={a.status === "active" ? "success" : "neutral"}>{a.status}</Badge>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
