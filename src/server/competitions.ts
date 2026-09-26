import { Prisma, type RankingMetric } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { notifyTrader } from "@/server/notifications";
import { ValidationError } from "@/server/errors";

const { Decimal } = Prisma;

export type PrizeLadderEntry = {
  rank: number;
  type: "cash" | "funded_account" | "free_challenge" | "discount";
  description: string;
  cashValue?: number;
};

/**
 * Module 7.2. Pure ranking, no DB access — tested the same way as the
 * rules engine. Only qualified, non-disqualified entrants get a rank
 * (spec §7.2's whole point of minTradesToQualify is that a single
 * maximum-size position shouldn't win outright; an unqualified entrant
 * hasn't earned a position on the board yet, just a place in "qualification
 * progress"). Standard competition ranking: ties share a rank, and the
 * next distinct value skips ahead accordingly (1, 1, 3 — not 1, 1, 2).
 * Tie-breaking beyond that is deliberately NOT auto-applied — spec §7.2
 * says the tie-breaker rule "must be defined before launch" as an open
 * decision, so it's recorded as free text on the competition
 * (tieBreakerRule) for a human to apply, not guessed at as an algorithm.
 */
export type RankableEntry = {
  personId: string;
  fullName: string;
  equity: Prisma.Decimal;
  tradesCount: number;
};

export type RankedEntry = {
  personId: string;
  fullName: string;
  metricValue: Prisma.Decimal;
  rank: number;
};

export function rankEntries(input: {
  entries: RankableEntry[];
  demoAccountSize: Prisma.Decimal;
  rankingMetric: RankingMetric;
  minTradesToQualify: number;
}): { ranked: RankedEntry[]; notYetQualified: RankableEntry[] } {
  const withMetric = input.entries.map((e) => {
    const pnl = e.equity.minus(input.demoAccountSize);
    const metricValue =
      input.rankingMetric === "return_pct" ? pnl.dividedBy(input.demoAccountSize).times(100) : pnl;
    return { ...e, metricValue };
  });

  const qualified = withMetric
    .filter((e) => e.tradesCount >= input.minTradesToQualify)
    .sort((a, b) => b.metricValue.comparedTo(a.metricValue));

  const ranked: RankedEntry[] = [];
  let rank = 0;
  let lastValue: Prisma.Decimal | null = null;
  qualified.forEach((e, i) => {
    if (lastValue === null || !e.metricValue.equals(lastValue)) rank = i + 1;
    lastValue = e.metricValue;
    ranked.push({ personId: e.personId, fullName: e.fullName, metricValue: e.metricValue, rank });
  });

  const notYetQualified = input.entries.filter((e) => e.tradesCount < input.minTradesToQualify);

  return { ranked, notYetQualified };
}

/** Only "cash" prize-ladder entries have a quantifiable cost (spec §7.3). A funded account or free challenge is a real cost too, but not a cash one — flagged in the admin UI rather than force-fit into a number. */
export function prizeCostCommitted(prizeLadder: PrizeLadderEntry[]): Prisma.Decimal {
  return prizeLadder
    .filter((p) => p.type === "cash" && p.cashValue)
    .reduce((sum, p) => sum.plus(new Decimal(p.cashValue!)), new Decimal(0));
}

export async function createCompetition(input: {
  name: string;
  startDate: Date;
  endDate: Date;
  entryFee: number;
  currency: string;
  entrantCap: number | null;
  demoAccountSize: number;
  minTradesToQualify: number;
  rankingMetric: RankingMetric;
  tieBreakerRule: string;
  prizeLadder: PrizeLadderEntry[];
  adminId: string;
  ipAddress: string;
}) {
  if (input.startDate >= input.endDate) throw new ValidationError("Start date must be before end date.");
  if (!input.tieBreakerRule.trim()) {
    throw new ValidationError("A tie-breaker rule is required before this competition can be created (spec §7.2).");
  }
  if (input.prizeLadder.length === 0) {
    throw new ValidationError("At least one prize ladder entry is required.");
  }

  const competition = await db.competition.create({
    data: {
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      entryFee: input.entryFee,
      currency: input.currency,
      entrantCap: input.entrantCap,
      demoAccountSize: input.demoAccountSize,
      minTradesToQualify: input.minTradesToQualify,
      rankingMetric: input.rankingMetric,
      tieBreakerRule: input.tieBreakerRule.trim(),
      prizeLadder: input.prizeLadder as unknown as Prisma.InputJsonValue,
      createdById: input.adminId,
    },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "competition.created",
    entityType: "Competition",
    entityId: competition.id,
    after: { name: competition.name, entryFee: input.entryFee.toString() },
    ipAddress: input.ipAddress,
  });

  return competition;
}

/**
 * spec §7.4: paid-entry prize competitions can fall under gaming or
 * lottery regulation; "obtain Cyprus legal advice before launch." Free
 * entry needs no sign-off. A competition with a non-zero entry fee can
 * never go active without legalSignOffConfirmed being explicitly set —
 * the concrete mechanism for "flag it as a configuration value" rather
 * than silently allowing a paid contest to launch.
 */
export async function setCompetitionStatus(input: {
  competitionId: string;
  status: "draft" | "active" | "closed";
  adminId: string;
  ipAddress: string;
}) {
  const competition = await db.competition.findUniqueOrThrow({ where: { id: input.competitionId } });

  if (input.status === "active" && competition.entryFee.greaterThan(0) && !competition.legalSignOffConfirmed) {
    throw new ValidationError(
      "This is a paid-entry competition. Cyprus legal advice must be confirmed (spec §7.4) before it can go active.",
    );
  }

  const updated = await db.competition.update({
    where: { id: input.competitionId },
    data: { status: input.status },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "competition.status_changed",
    entityType: "Competition",
    entityId: competition.id,
    before: { status: competition.status },
    after: { status: updated.status },
    ipAddress: input.ipAddress,
  });

  if (input.status === "closed") {
    const entries = await db.competitionEntry.findMany({
      where: { competitionId: competition.id, status: "active" },
    });
    for (const entry of entries) {
      await notifyTrader({
        personId: entry.personId,
        type: "competition_results",
        title: "Competition results are in",
        body: `${competition.name} has closed. Check the leaderboard for the final standings.`,
        link: "/portal/competitions",
      });
    }
  }

  return updated;
}

export async function confirmLegalSignOff(input: {
  competitionId: string;
  note: string;
  adminId: string;
  ipAddress: string;
}) {
  if (input.note.trim().length < 4) {
    throw new ValidationError("A note is required recording what was confirmed and by whom.");
  }
  const updated = await db.competition.update({
    where: { id: input.competitionId },
    data: { legalSignOffConfirmed: true, legalSignOffNote: input.note.trim() },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "competition.legal_signoff_confirmed",
    entityType: "Competition",
    entityId: input.competitionId,
    reason: input.note,
    ipAddress: input.ipAddress,
  });

  return updated;
}

export async function listCompetitions() {
  return db.competition.findMany({ include: { entries: true }, orderBy: { createdAt: "desc" } });
}

export async function getCompetition(id: string) {
  return db.competition.findUnique({
    where: { id },
    include: { entries: { include: { person: true } } },
  });
}

export async function enterCompetition(input: {
  competitionId: string;
  personId: string;
  entryPaidAmount: number;
  adminId: string;
  ipAddress: string;
}) {
  const competition = await db.competition.findUniqueOrThrow({ where: { id: input.competitionId } });
  if (competition.status !== "active") {
    throw new ValidationError("Entries are only accepted while the competition is active.");
  }
  if (competition.entrantCap !== null) {
    const count = await db.competitionEntry.count({ where: { competitionId: competition.id } });
    if (count >= competition.entrantCap) {
      throw new ValidationError("This competition has reached its entrant cap.");
    }
  }

  const entry = await db.competitionEntry.create({
    data: {
      competitionId: competition.id,
      personId: input.personId,
      entryPaidAmount: input.entryPaidAmount,
      equity: competition.demoAccountSize,
    },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "competition.entry_added",
    entityType: "CompetitionEntry",
    entityId: entry.id,
    after: { competitionId: competition.id, personId: input.personId },
    ipAddress: input.ipAddress,
  });

  return entry;
}

/** Simulates the demo account's equity/trade count — stands in for a real feed exactly like Account's manual override does (module 3.1's note). */
export async function updateEntryProgress(input: {
  entryId: string;
  equity: number;
  tradesCount: number;
  adminId: string;
  ipAddress: string;
}) {
  const before = await db.competitionEntry.findUniqueOrThrow({ where: { id: input.entryId } });
  const updated = await db.competitionEntry.update({
    where: { id: input.entryId },
    data: { equity: input.equity, tradesCount: input.tradesCount },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "competition_entry.progress_updated",
    entityType: "CompetitionEntry",
    entityId: input.entryId,
    before: { equity: before.equity.toString(), tradesCount: before.tradesCount },
    after: { equity: updated.equity.toString(), tradesCount: updated.tradesCount },
    ipAddress: input.ipAddress,
  });

  return updated;
}

/** Disqualified entrants leave the leaderboard but stay in the list as leads (spec §7.2), not deleted. */
export async function disqualifyEntry(input: {
  entryId: string;
  reason: string;
  adminId: string;
  ipAddress: string;
}) {
  if (input.reason.trim().length < 4) {
    throw new ValidationError("A reason is required to disqualify an entrant.");
  }
  const updated = await db.competitionEntry.update({
    where: { id: input.entryId },
    data: { status: "disqualified", disqualifiedReason: input.reason.trim() },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "competition_entry.disqualified",
    entityType: "CompetitionEntry",
    entityId: input.entryId,
    reason: input.reason,
    ipAddress: input.ipAddress,
  });

  return updated;
}

/** spec §7.3: "The real metric is entrants converted to paying customers." An entrant counts as converted if they bought any real challenge after entering this competition. */
export async function countEntrantsConverted(competitionId: string): Promise<number> {
  const entries = await db.competitionEntry.findMany({
    where: { competitionId },
    select: { personId: true, enteredAt: true },
  });

  let converted = 0;
  for (const entry of entries) {
    const laterPurchase = await db.payment.findFirst({
      where: { personId: entry.personId, createdAt: { gt: entry.enteredAt } },
    });
    if (laterPurchase) converted++;
  }
  return converted;
}
