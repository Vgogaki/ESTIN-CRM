import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import { listTerminalAccounts } from "@/server/trading/terminal";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import Terminal from "./terminal";

export default async function TerminalPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");

  const accounts = await listTerminalAccounts(trader.id);
  if (accounts.length === 0) {
    return (
      <div>
        <PageHeader title="Terminal" subtitle="Trade your challenge account." />
        <Card className="p-6 text-sm text-sub">
          You have no account open for trading. An account can be traded while it is active and in its evaluation or funded phase.{" "}
          <Link href="/portal/buy" className="text-acc underline">
            Buy a challenge
          </Link>{" "}
          to get started.
        </Card>
      </div>
    );
  }

  const { account } = await searchParams;
  const initial = accounts.find((a) => a.id === account)?.id ?? accounts[0].id;
  return <Terminal accounts={accounts} initialAccountId={initial} pricesConfigured={Boolean(process.env.PRICE_DRIVER)} />;
}
