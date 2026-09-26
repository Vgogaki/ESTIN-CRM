import { redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import { listActiveChallengesForExplainer } from "@/server/training";
import { explainChallenge } from "@/server/rules-explainer";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";

export default async function RulesPage() {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");
  const challenges = await listActiveChallengesForExplainer();

  return (
    <div>
      <PageHeader title="Challenge rules" backHref="/portal/learn" backLabel="Learn" />
      {challenges.length === 0 ? (
        <Card className="p-6 text-sm text-sub">No challenges are on sale right now.</Card>
      ) : (
        <div className="flex flex-col gap-5">
          {challenges.map((c) => {
            const e = explainChallenge(c);
            return (
              <Card key={c.id} className="p-6">
                <h2 className="font-display text-base font-semibold">{e.heading}</h2>
                <p className="mb-4 text-xs text-sub">{e.intro}</p>
                <div className="flex flex-col gap-4">
                  {e.sections.map((s) => (
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
            );
          })}
        </div>
      )}
    </div>
  );
}
