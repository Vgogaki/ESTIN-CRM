import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import { listCatalog } from "@/server/checkout";
import { formatMoney } from "@/server/checkout-pricing";
import { purchasesAvailable } from "@/server/payments/driver";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";

export default async function BuyPage() {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");
  const catalog = await listCatalog(trader.id);
  const available = purchasesAvailable();

  return (
    <div>
      <PageHeader title="Buy a challenge" subtitle="Start a new evaluation. Each challenge is a separate simulated account with its own rules." />
      {!available && <Alert tone="warning">Purchases aren&apos;t open yet. You can look at the challenges, but nothing can be bought for now.</Alert>}
      {catalog.length === 0 ? (
        <Card className="p-6 text-sm text-sub">No challenges are on sale right now.</Card>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {catalog.map(({ challenge: c, amountDue, offer }) => (
            <Card key={c.id} className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold">{c.name}</h2>
                  <p className="text-xs text-sub">Account size {formatMoney(c.accountSize, c.currency)} (simulated)</p>
                </div>
                {offer && <Badge tone="success">Your offer</Badge>}
              </div>
              <div>
                {offer ? (
                  <p>
                    <span className="text-xl font-semibold">{formatMoney(amountDue, c.currency)}</span>{" "}
                    <span className="text-sm text-sub line-through">{formatMoney(c.fee, c.currency)}</span>
                  </p>
                ) : (
                  <p className="text-xl font-semibold">{formatMoney(c.fee, c.currency)}</p>
                )}
                <p className="text-xs text-sub">One-time fee</p>
              </div>
              <Link
                href={`/portal/buy/${c.id}`}
                className="mt-auto inline-flex items-center justify-center rounded-md bg-acc px-4 py-2 text-sm font-semibold text-[#04121f] transition-colors hover:brightness-110"
              >
                View rules and buy
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
