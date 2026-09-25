import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getCurrentTrader } from "@/server/auth/guard";
import { getTraderAccounts } from "@/server/portal-dashboard";
import { daysRemaining } from "@/server/expiry";
import { calculateAvailableProfit, calculatePayoutAmount } from "@/server/withdrawals";
import TraderDashboard from "./trader-dashboard";

const zero = new Prisma.Decimal(0);

export default async function PortalPage() {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");

  const accounts = await getTraderAccounts(trader.id);
  const now = new Date();
  const kycVerified = trader.kycStatus === "verified";
  const twoFactorEnabled = Boolean(trader.twoFactorEnabledAt);

  return (
    <TraderDashboard
      trader={{
        fullName: trader.fullName,
        email: trader.email,
        kycStatus: trader.kycStatus,
        twoFactorEnabled,
      }}
      accounts={accounts.map((a) => {
        let payout = null;
        if (a.phase === "funded" && a.status === "active") {
          const splitPct = a.currentPhase?.profitSplitPct ?? null;
          const reserved = a.withdrawals
            .filter((w) => w.status === "pending" || w.status === "approved" || w.status === "paid")
            .reduce((sum, w) => sum.plus(w.amount), zero);
          const availableProfit = calculateAvailableProfit({
            equity: a.equity,
            accountSize: a.challengeType.accountSize,
            reservedAmount: reserved,
          });
          const amount = splitPct ? calculatePayoutAmount(availableProfit, splitPct) : zero;
          const minPayout = a.currentPhase?.minPayoutAmount ?? null;
          const hasPending = a.withdrawals.some((w) => w.status === "pending");

          let blockedReason: string | null = null;
          if (!kycVerified) blockedReason = "Identity verification required.";
          else if (!twoFactorEnabled) blockedReason = "Two-factor authentication required.";
          else if (hasPending) blockedReason = "A request is already pending.";
          else if (amount.lessThanOrEqualTo(0)) blockedReason = "No profit available yet.";
          else if (minPayout && amount.lessThan(minPayout))
            blockedReason = `Minimum payout is ${minPayout.toString()} ${a.challengeType.currency}.`;

          payout = {
            profit: availableProfit.toString(),
            splitPct: splitPct?.toString() ?? "0",
            amount: amount.toString(),
            canRequest: blockedReason === null,
            blockedReason,
          };
        }

        return {
          id: a.id,
          challengeTypeName: a.challengeType.name,
          accountSize: a.challengeType.accountSize.toString(),
          currency: a.challengeType.currency,
          status: a.status,
          phase: a.phase,
          phaseLabel: a.currentPhase?.label ?? null,
          closeReason: a.closeReason,
          daysRemaining: a.currentPhase
            ? daysRemaining({
                timeLimitDays: a.currentPhase.timeLimitDays,
                phaseStartedAt: a.phaseStartedAt,
                now,
              })
            : null,
          payout,
          withdrawals: a.withdrawals.map((w) => ({
            id: w.id,
            amount: w.amount.toString(),
            status: w.status,
            requestedAt: w.requestedAt.toISOString(),
            decisionNote: w.decisionNote,
          })),
        };
      })}
    />
  );
}
