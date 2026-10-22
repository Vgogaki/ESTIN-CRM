import { notFound, redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import { getReview } from "@/server/checkout";
import { formatMoney } from "@/server/checkout-pricing";
import { explainChallenge } from "@/server/rules-explainer";
import { purchasesAvailable } from "@/server/payments/driver";
import { CURRENT_TERMS_VERSION } from "@/server/terms";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import ReviewForm from "./review-form";

export default async function ReviewPage({ params }: { params: Promise<{ challengeId: string }> }) {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");
  const { challengeId } = await params;
  const review = await getReview(trader.id, challengeId);
  if (!review) notFound();

  const { challenge: c, amountDue, offer } = review;
  const rules = explainChallenge(c);

  return (
    <div>
      <PageHeader title={c.name} subtitle="Review the rules and the price before you buy." backHref="/portal/buy" backLabel="Buy a challenge" />

      <Card className="mb-5 p-5">
        <h2 className="mb-3 text-sm font-semibold">Price</h2>
        {offer ? (
          <div className="flex flex-col gap-1 text-sm">
            <p>
              <span className="text-2xl font-semibold">{formatMoney(amountDue, c.currency)}</span>{" "}
              <span className="text-sub line-through">{formatMoney(c.fee, c.currency)}</span>
            </p>
            <p className="text-sub">
              Your offer &ldquo;{offer.campaignName}&rdquo; is applied. It is valid until {offer.expiresAt.toLocaleDateString()}.
            </p>
          </div>
        ) : (
          <p className="text-2xl font-semibold">{formatMoney(c.fee, c.currency)}</p>
        )}
        <p className="mt-1 text-xs text-sub">One-time fee. The account is simulated: no trading capital is at risk and no real-money trades are placed.</p>
      </Card>

      <Card className="mb-5 p-5">
        <h2 className="mb-1 font-display text-base font-semibold">{rules.heading}: the rules</h2>
        <p className="mb-4 text-xs text-sub">{rules.intro}</p>
        <div className="flex flex-col gap-4">
          {rules.sections.map((s) => (
            <div key={s.title}>
              <h3 className="mb-1 text-sm font-semibold">{s.title}</h3>
              <ul className="list-disc pl-5 text-sm text-sub">
                {s.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {purchasesAvailable() ? (
        <ReviewForm challengeTypeId={c.id} termsVersion={CURRENT_TERMS_VERSION} amountLabel={formatMoney(amountDue, c.currency)} />
      ) : (
        <Alert tone="warning">Purchases aren&apos;t open yet, so this challenge can&apos;t be bought for now.</Alert>
      )}
    </div>
  );
}
