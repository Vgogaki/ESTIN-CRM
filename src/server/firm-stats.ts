import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { countEntrantsConverted, prizeCostCommitted, type PrizeLadderEntry } from "@/server/competitions";

const { Decimal } = Prisma;
const zero = new Decimal(0);

/**
 * Module not tracked in v1-build-plan.md's phase table despite being
 * specced (crm-specification.md §5.1) and fully demonstrated in
 * prototypes/back-office.jsx's "Firm statistics" view — a gap found
 * auditing the build plan, not a deferred item. Sums assume a single
 * operating currency (true of every launch tier in docs/decisions.md);
 * revisit if a second currency is ever sold, since summing across
 * currencies would silently produce a meaningless number.
 */
export async function getFirmStatistics() {
  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [succeededPayments, approvedWithdrawals, accounts] = await Promise.all([
    db.payment.findMany({
      where: { status: "succeeded" },
      select: { amountPaid: true, createdAt: true },
    }),
    db.withdrawal.findMany({
      where: { status: { in: ["approved", "paid"] } },
      select: { amount: true, decidedAt: true },
    }),
    db.account.findMany({
      where: { voidedAt: null },
      select: { personId: true, phase: true, status: true },
    }),
  ]);

  const revenue = succeededPayments.reduce((sum, p) => sum.plus(p.amountPaid), zero);
  const payoutsApproved = approvedWithdrawals.reduce((sum, w) => sum.plus(w.amount), zero);
  const net = revenue.minus(payoutsApproved);

  const challengesSold = accounts.length;
  const fundedTraders = new Set(
    accounts.filter((a) => a.phase === "funded").map((a) => a.personId),
  ).size;

  // "Passed" = ever reached pass review or funded; breach is the only other
  // terminal outcome that counts toward the denominator. Accounts still
  // active in evaluation haven't reached an outcome yet, so they're
  // excluded from both — an unresolved account shouldn't dilute the rate
  // in either direction.
  const passedCount = accounts.filter(
    (a) => a.status === "passed" || a.phase === "pass_review" || a.phase === "funded",
  ).length;
  const breachedCount = accounts.filter((a) => a.status === "breached").length;
  const passRate =
    passedCount + breachedCount > 0 ? Math.round((passedCount / (passedCount + breachedCount)) * 100) : 0;

  // Last 12 calendar months, oldest first, revenue by payment date and
  // payouts by decision date (when the money commitment was actually made).
  const months: { label: string; revenue: string; payouts: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const monthStart = new Date(twelveMonthsAgo.getFullYear(), twelveMonthsAgo.getMonth() + i, 1);
    const monthEnd = new Date(twelveMonthsAgo.getFullYear(), twelveMonthsAgo.getMonth() + i + 1, 1);
    const monthRevenue = succeededPayments
      .filter((p) => p.createdAt >= monthStart && p.createdAt < monthEnd)
      .reduce((sum, p) => sum.plus(p.amountPaid), zero);
    const monthPayouts = approvedWithdrawals
      .filter((w) => w.decidedAt && w.decidedAt >= monthStart && w.decidedAt < monthEnd)
      .reduce((sum, w) => sum.plus(w.amount), zero);
    months.push({
      label: monthStart.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      revenue: monthRevenue.toString(),
      payouts: monthPayouts.toString(),
    });
  }

  const competitions = await db.competition.findMany({ include: { entries: true } });
  let compEntryRevenue = zero;
  let compPrizeCost = zero;
  let compConverted = 0;
  for (const c of competitions) {
    compEntryRevenue = c.entries.reduce((s, e) => s.plus(e.entryPaidAmount), compEntryRevenue);
    if (c.status !== "draft") {
      compPrizeCost = compPrizeCost.plus(prizeCostCommitted(c.prizeLadder as unknown as PrizeLadderEntry[]));
    }
    compConverted += await countEntrantsConverted(c.id);
  }

  return {
    competitions: {
      live: competitions.filter((c) => c.status === "active").length,
      entryRevenue: compEntryRevenue.toString(),
      prizeCost: compPrizeCost.toString(),
      converted: compConverted,
    },
    revenue: revenue.toString(),
    payoutsApproved: payoutsApproved.toString(),
    net: net.toString(),
    challengesSold,
    fundedTraders,
    passRate,
    months,
  };
}
