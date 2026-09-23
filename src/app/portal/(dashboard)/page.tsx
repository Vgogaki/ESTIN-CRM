import { redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import TraderDashboard from "./trader-dashboard";

export default async function PortalPage() {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");

  return (
    <TraderDashboard
      trader={{
        fullName: trader.fullName,
        email: trader.email,
        kycStatus: trader.kycStatus,
        twoFactorEnabled: Boolean(trader.twoFactorEnabledAt),
      }}
    />
  );
}
