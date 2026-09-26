import { redirect, notFound } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { getCompetition, rankEntries, prizeCostCommitted, countEntrantsConverted, type PrizeLadderEntry } from "@/server/competitions";
import { listTraders } from "@/server/traders";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import CompetitionDetail from "./competition-detail";

export default async function CompetitionDetailPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "competitions.manage")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }

  const { competitionId } = await params;
  const competition = await getCompetition(competitionId);
  if (!competition) notFound();

  const activeEntries = competition.entries.filter((e) => e.status === "active");
  const disqualifiedEntries = competition.entries.filter((e) => e.status === "disqualified");

  const { ranked, notYetQualified } = rankEntries({
    entries: activeEntries.map((e) => ({ personId: e.personId, fullName: e.person.fullName, equity: e.equity, tradesCount: e.tradesCount })),
    demoAccountSize: competition.demoAccountSize,
    rankingMetric: competition.rankingMetric,
    minTradesToQualify: competition.minTradesToQualify,
  });

  const prizeLadder = competition.prizeLadder as unknown as PrizeLadderEntry[];
  const entryRevenue = competition.entries.reduce((sum, e) => sum + Number(e.entryPaidAmount), 0);
  const prizeCost = prizeCostCommitted(prizeLadder).toNumber();
  const entrantsConverted = await countEntrantsConverted(competition.id);

  const traders = await listTraders();
  const enteredIds = new Set(competition.entries.map((e) => e.personId));
  const availableTraders = traders.filter((t) => !enteredIds.has(t.id));

  return (
    <div>
      <PageHeader title={competition.name} backHref="/admin/competitions" backLabel="Competitions" />
      <CompetitionDetail
        competition={{
          id: competition.id,
          status: competition.status,
          entryFee: competition.entryFee.toString(),
          currency: competition.currency,
          demoAccountSize: competition.demoAccountSize.toString(),
          minTradesToQualify: competition.minTradesToQualify,
          rankingMetric: competition.rankingMetric,
          tieBreakerRule: competition.tieBreakerRule,
          startDate: competition.startDate.toISOString(),
          endDate: competition.endDate.toISOString(),
          legalSignOffConfirmed: competition.legalSignOffConfirmed,
          legalSignOffNote: competition.legalSignOffNote,
          prizeLadder,
        }}
        stats={{ entryRevenue, prizeCost, entrantsConverted, entrantCount: competition.entries.length }}
        ranked={ranked.map((r) => ({
          personId: r.personId,
          fullName: r.fullName,
          metricValue: r.metricValue.toString(),
          rank: r.rank,
        }))}
        notYetQualified={notYetQualified.map((e) => {
          const full = activeEntries.find((a) => a.personId === e.personId)!;
          return { entryId: full.id, personId: e.personId, fullName: e.fullName, tradesCount: e.tradesCount };
        })}
        allActiveEntries={activeEntries.map((e) => ({
          entryId: e.id,
          personId: e.personId,
          fullName: e.person.fullName,
          equity: e.equity.toString(),
          tradesCount: e.tradesCount,
        }))}
        disqualifiedEntries={disqualifiedEntries.map((e) => ({
          entryId: e.id,
          fullName: e.person.fullName,
          reason: e.disqualifiedReason,
        }))}
        availableTraders={availableTraders.map((t) => ({ id: t.id, fullName: t.fullName, email: t.email }))}
      />
    </div>
  );
}
