import { redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import { db } from "@/server/db";
import { rankEntries } from "@/server/competitions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function money(value: string, currency: string) {
  const n = Number(value);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export default async function PortalCompetitionsPage() {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");

  const competitions = await db.competition.findMany({
    where: { status: { in: ["active", "closed"] } },
    include: { entries: { include: { person: true } } },
    orderBy: { startDate: "desc" },
  });

  return (
    <div>
      <PageHeader title="Competitions" backHref="/portal" backLabel="Your account" />
      {competitions.length === 0 ? (
        <Card className="p-6 text-sm text-sub">No competitions running right now.</Card>
      ) : (
        <div className="flex flex-col gap-5">
          {competitions.map((c) => {
            const activeEntries = c.entries.filter((e) => e.status === "active");
            const { ranked, notYetQualified } = rankEntries({
              entries: activeEntries.map((e) => ({
                personId: e.personId,
                fullName: e.person.fullName,
                equity: e.equity,
                tradesCount: e.tradesCount,
              })),
              demoAccountSize: c.demoAccountSize,
              rankingMetric: c.rankingMetric,
              minTradesToQualify: c.minTradesToQualify,
            });
            const myEntry = c.entries.find((e) => e.personId === trader.id);
            const myRank = ranked.find((r) => r.personId === trader.id);
            const myProgress = notYetQualified.find((e) => e.personId === trader.id);

            return (
              <Card key={c.id} className="p-5">
                <div className="flex items-center justify-between">
                  <p className="font-display text-sm font-semibold">{c.name}</p>
                  <Badge tone={c.status === "active" ? "success" : "neutral"}>{c.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-sub">
                  {new Date(c.startDate).toLocaleDateString()} – {new Date(c.endDate).toLocaleDateString()} ·{" "}
                  {money(c.entryFee.toString(), c.currency)} entry
                </p>

                {myEntry ? (
                  myEntry.status === "disqualified" ? (
                    <p className="mt-3 text-sm text-danger">Disqualified: {myEntry.disqualifiedReason}</p>
                  ) : myRank ? (
                    <p className="mt-3 text-sm">
                      Your position: <span className="font-medium">#{myRank.rank}</span> (
                      {c.rankingMetric === "return_pct" ? `${myRank.metricValue}%` : money(myRank.metricValue.toString(), c.currency)}
                      )
                    </p>
                  ) : myProgress ? (
                    <p className="mt-3 text-sm text-sub">
                      Qualification progress: {myProgress.tradesCount} / {c.minTradesToQualify} trades
                    </p>
                  ) : null
                ) : (
                  <p className="mt-3 text-xs text-sub">You&apos;re not entered in this competition.</p>
                )}

                <div className="mt-4 border-t border-bd pt-3">
                  <p className="mb-2 text-xs font-medium tracking-wide text-sub uppercase">Leaderboard</p>
                  {ranked.length === 0 ? (
                    <p className="text-xs text-sub">No qualified entrants yet.</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {ranked.slice(0, 10).map((r) => (
                        <div
                          key={r.personId}
                          className={`flex items-center justify-between text-sm ${r.personId === trader.id ? "font-medium text-acc" : ""}`}
                        >
                          <span>
                            <span className="mr-2 font-mono text-sub">#{r.rank}</span>
                            {r.personId === trader.id ? "You" : r.fullName}
                          </span>
                          <span>{c.rankingMetric === "return_pct" ? `${r.metricValue}%` : money(r.metricValue.toString(), c.currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
