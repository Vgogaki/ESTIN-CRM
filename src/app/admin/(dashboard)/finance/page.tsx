import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { loadFinanceData } from "@/server/finance-report";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

function money(value: string, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value));
  } catch {
    return `${currency} ${value}`;
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; includeTest?: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "reports.view")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }
  const canExportPayouts = hasPermission(admin.role.permissions, "payouts.view");

  const params = await searchParams;
  const now = new Date();
  const from = params.from ?? iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const to = params.to ?? iso(now);
  const includeTest = params.includeTest === "1";

  let data;
  let error: string | null = null;
  try {
    data = await loadFinanceData({ from, to, includeTest });
  } catch {
    error = "That isn't a valid period — check the dates.";
  }

  const qs = new URLSearchParams({ from, to, includeTest: includeTest ? "1" : "0" });

  return (
    <div>
      <PageHeader
        title="Finance"
        subtitle="Cash received and payouts approved, by period and currency. Dates are UTC and include both end days."
      />

      <Card className="mb-5 p-5">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <Field label="From">
            <Input type="date" name="from" defaultValue={from} />
          </Field>
          <Field label="To">
            <Input type="date" name="to" defaultValue={to} />
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="includeTest" value="1" defaultChecked={includeTest} />
            Include test orders
          </label>
          <Button type="submit">Show</Button>
        </form>
      </Card>

      {error && <Alert tone="danger">{error}</Alert>}

      {data && (
        <div className="flex flex-col gap-5">
          <Alert tone="warning">
            <span className="block">
              <strong>Not revenue recognition.</strong> These are fees received when purchased, with no
              deferral applied — how fees should be recognised is still an open accounting decision
              (decisions.md #10).
            </span>
            <span className="mt-1 block">
              <strong>Refunds and chargebacks aren&apos;t tracked yet</strong> (module 2.3): no refund amount is
              stored, so they can&apos;t be reported — this is not a zero. Payouts are approved amounts; none
              can be marked paid until a payout provider exists.
            </span>
            {!includeTest && data.excludedTest > 0 && (
              <span className="mt-1 block">
                {data.excludedTest} test order{data.excludedTest === 1 ? "" : "s"} from the admin test tool excluded.
              </span>
            )}
          </Alert>

          {data.summary.length === 0 ? (
            <Card className="p-6 text-sm text-sub">No fees or payouts in this period.</Card>
          ) : (
            data.summary.map((s) => (
              <Card key={s.currency} className="overflow-hidden p-0">
                <div className="border-b border-bd px-4 py-3 font-display text-sm font-semibold">{s.currency}</div>
                <div className="grid grid-cols-2 gap-3 p-4 text-sm md:grid-cols-4">
                  <div>
                    <p className="text-xs text-sub uppercase">Fees received</p>
                    <p className="font-medium">{money(s.feesReceived, s.currency)}</p>
                    <p className="text-xs text-sub">{s.feeCount} orders</p>
                  </div>
                  <div>
                    <p className="text-xs text-sub uppercase">Payouts approved</p>
                    <p className="font-medium">{money(s.payoutsApproved, s.currency)}</p>
                    <p className="text-xs text-sub">
                      {s.payoutsApprovedCount} approved · {s.payoutsDeclinedCount} declined
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-sub uppercase">Net position</p>
                    <p className="font-medium">{money(s.netPosition, s.currency)}</p>
                    <p className="text-xs text-sub">Fees less payouts</p>
                  </div>
                  <div>
                    <p className="text-xs text-sub uppercase">Refunds / chargebacks</p>
                    <p className="font-medium text-sub">Not tracked</p>
                  </div>
                </div>
                <div className="border-t border-bd">
                  {s.feesByMonth.map((m) => (
                    <div key={m.month} className="flex justify-between border-b border-bd px-4 py-2 text-sm last:border-b-0">
                      <span className="font-mono text-sub">{m.month}</span>
                      <span>
                        {money(m.fees, s.currency)} in · {money(m.payouts, s.currency)} out
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ))
          )}

          <Card className="flex flex-wrap items-center gap-3 p-5">
            <p className="mr-auto text-sm text-sub">
              CSV exports for this period — every download is recorded in the audit log.
            </p>
            <a href={`/api/admin/finance/export?type=fees&${qs}`}>
              <Button variant="ghost">Download fees ({data.paymentRows.length})</Button>
            </a>
            {canExportPayouts && (
              <a href={`/api/admin/finance/export?type=payouts&${qs}`}>
                <Button variant="ghost">Download payouts ({data.payouts.length})</Button>
              </a>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
