import { redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import { PageHeader } from "@/components/ui/page-header";
import SecurityPanel from "./security-panel";

export default async function SecurityPage() {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");

  return (
    <div>
      <PageHeader title="Security" backHref="/portal" backLabel="Your account" />
      <SecurityPanel enabled={Boolean(trader.twoFactorEnabledAt)} />
    </div>
  );
}
