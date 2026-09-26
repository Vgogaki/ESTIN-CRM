import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import { listPublished, SECTIONS } from "@/server/training";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";

export default async function LearnPage() {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");
  const articles = await listPublished();

  return (
    <div>
      <PageHeader title="Learn" backHref="/portal" backLabel="Your account" />
      <div className="flex flex-col gap-6">
        {SECTIONS.map((s) => {
          const items = articles.filter((a) => a.section === s.key);
          const isRules = s.key === "challenge_rules";
          if (items.length === 0 && !isRules) return null;
          return (
            <section key={s.key}>
              <h2 className="text-sm font-semibold">{s.label}</h2>
              <p className="mb-2 text-xs text-sub">{s.blurb}</p>
              <div className="flex flex-col gap-2">
                {isRules && (
                  <Link href="/portal/learn/rules">
                    <Card className="p-4 hover:border-acc">
                      <p className="text-sm font-medium">The rules of every challenge</p>
                      <p className="text-xs text-sub">Profit targets, loss limits and payout terms in plain language.</p>
                    </Card>
                  </Link>
                )}
                {items.map((a) => (
                  <Link key={a.id} href={`/portal/learn/${a.slug}`}>
                    <Card className="p-4 hover:border-acc">
                      <p className="text-sm font-medium">{a.title}</p>
                      {a.summary && <p className="text-xs text-sub">{a.summary}</p>}
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
