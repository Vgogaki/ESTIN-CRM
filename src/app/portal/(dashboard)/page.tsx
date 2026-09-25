import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getCurrentTrader } from "@/server/auth/guard";
import { getTraderAccounts } from "@/server/portal-dashboard";
import { daysRemaining } from "@/server/expiry";
import { evaluateAccount } from "@/server/rules";
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

        // Spec §6.1: three meters mirroring the engine exactly, plus the
        // breach level as a currency amount — only meaningful while the
        // account is still being evaluated against these rules.
        const rule =
          a.phase === "evaluation" && a.currentPhase
            ? evaluateAccount({
                accountSize: a.challengeType.accountSize,
                equity: a.equity,
                dayStartEquity: a.dayStartEquity,
                peakEquity: a.peakEquity,
                tradingDays: a.tradingDays,
                profitTargetPct: a.currentPhase.profitTargetPct,
                dailyLossPct: a.currentPhase.dailyLossPct,
                maxLossPct: a.currentPhase.maxLossPct,
                drawdownType: a.currentPhase.drawdownType,
                minTradingDays: a.currentPhase.minTradingDays,
              })
            : null;

        return {
          id: a.id,
          challengeTypeName: a.challengeType.name,
          accountSize: a.challengeType.accountSize.toString(),
          currency: a.challengeType.currency,
          equity: a.equity.toString(),
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
          drawdownType: a.currentPhase?.drawdownType ?? "trailing",
          rule: rule
            ? {
                pnl: rule.pnl.toString(),
                profitTarget: rule.profitTarget?.toString() ?? null,
                dailyLossCap: rule.dailyLossCap.toString(),
                maxLossCap: rule.maxLossCap.toString(),
                dailyLossUsed: rule.dailyLossUsed.toString(),
                totalLossUsed: rule.totalLossUsed.toString(),
                dailyBreachLevel: rule.dailyBreachLevel.toString(),
                totalBreachLevel: rule.totalBreachLevel.toString(),
              }
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
