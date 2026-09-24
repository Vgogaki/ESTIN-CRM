import { redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import { getTraderAccounts } from "@/server/portal-dashboard";
import { daysRemaining } from "@/server/expiry";
import TraderDashboard from "./trader-dashboard";

export default async function PortalPage() {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");

  const accounts = await getTraderAccounts(trader.id);
  const now = new Date();

  return (
    <TraderDashboard
      trader={{
        fullName: trader.fullName,
        email: trader.email,
        kycStatus: trader.kycStatus,
        twoFactorEnabled: Boolean(trader.twoFactorEnabledAt),
      }}
      accounts={accounts.map((a) => ({
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
      }))}
    />
  );
}
