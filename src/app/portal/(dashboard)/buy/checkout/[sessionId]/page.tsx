import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import { getCheckout } from "@/server/checkout";
import { formatMoney, isCheckoutExpired } from "@/server/checkout-pricing";
import { paymentMode } from "@/server/payments/driver";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import PayPanel from "./pay-panel";

export default async function CheckoutPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");
  const { sessionId } = await params;
  const session = await getCheckout(sessionId, trader.id);
  if (!session) notFound();

  const amount = formatMoney(session.amountDue, session.currency);
  const expired = session.status === "expired" || (session.status === "pending" && isCheckoutExpired(session.expiresAt, new Date()));

  if (session.status === "paid") {
    return (
      <div>
        <PageHeader title="Purchase complete" />
        <Card className="flex flex-col gap-3 p-6">
          <Alert tone="success">Your {session.challengeType.name} account has been created.</Alert>
          <p className="text-sm text-sub">
            Paid {amount}. Your new account is on your dashboard, and a confirmation is in your notifications.
          </p>
          <div>
            <Link href="/portal" className="inline-flex items-center rounded-md bg-acc px-4 py-2 text-sm font-semibold text-[#04121f] hover:brightness-110">
              Go to my dashboard
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Payment" backHref={`/portal/buy/${session.challengeTypeId}`} backLabel="Back to the rules" />
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4 text-sm">
          <div>
            <p className="font-medium">{session.challengeType.name}</p>
            <p className="text-xs text-sub">Order {session.orderRef}</p>
            {session.offerCode && <p className="text-xs text-sub">Your offer price is applied (normal fee {formatMoney(session.normalFee, session.currency)}).</p>}
            {session.affiliateCode && <p className="text-xs text-sub">Referral code {session.affiliateCode}</p>}
          </div>
          <p className="text-2xl font-semibold">{amount}</p>
        </div>
        {expired ? (
          <Alert tone="warning">
            This checkout has expired. <Link href={`/portal/buy/${session.challengeTypeId}`} className="underline">Start again</Link> to see the current price.
          </Alert>
        ) : (
          <PayPanel sessionId={session.id} amountLabel={amount} demo={paymentMode() === "demo"} />
        )}
      </Card>
    </div>
  );
}
