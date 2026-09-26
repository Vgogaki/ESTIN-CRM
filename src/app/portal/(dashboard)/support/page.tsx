import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import { listThreadsForTrader } from "@/server/support";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import NewThreadForm from "./new-thread-form";

const STATUS = {
  open: { label: "Waiting for support", tone: "warning" },
  awaiting_trader: { label: "Support replied", tone: "accent" },
  resolved: { label: "Resolved", tone: "success" },
} as const;

export default async function PortalSupportPage() {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");
  const threads = await listThreadsForTrader(trader.id);

  return (
    <div>
      <PageHeader title="Support" backHref="/portal" backLabel="Your account" />
      <NewThreadForm />
      <div className="mt-6 flex flex-col gap-2">
        {threads.length === 0 ? (
          <Card className="p-6 text-sm text-sub">No conversations yet.</Card>
        ) : (
          threads.map((t) => (
            <Link key={t.id} href={`/portal/support/${t.id}`}>
              <Card className="flex items-center justify-between gap-3 p-4 hover:border-acc">
                <div>
                  <p className="text-sm font-medium">{t.subject}</p>
                  <p className="text-xs text-sub">{new Date(t.lastMessageAt).toLocaleString()}</p>
                </div>
                <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
