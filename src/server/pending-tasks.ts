import { db } from "@/server/db";
import { evaluateAccount } from "@/server/rules";

/**
 * The operations queue (spec §5.2, module 3.7) — everything waiting on
 * staff, derived automatically rather than tracked by hand. Full version
 * is Phase 3 (needs the rules engine and equity feed); this is what's
 * derivable now from data that already exists — breach/pass detection
 * runs the same evaluateAccount() math the real engine will, against
 * whatever equity values are on the account (manually set via "simulate
 * account state" until the real feed exists). Pending withdrawals and
 * breached-trader offer leads are left out — Withdrawal (Phase 5) and
 * Offers (Phase 6/7) don't have a UI yet to act on them from.
 */
export async function getPendingTasks() {
  const activeAccounts = await db.account.findMany({
    where: { voidedAt: null, status: "active", phase: "evaluation" },
    include: { currentPhase: true, person: true, challengeType: true },
  });

  const flagged: typeof activeAccounts = [];
  const readyToPass: typeof activeAccounts = [];

  for (const acct of activeAccounts) {
    if (!acct.currentPhase) continue;
    const r = evaluateAccount({
      accountSize: acct.challengeType.accountSize,
      equity: acct.equity,
      dayStartEquity: acct.dayStartEquity,
      peakEquity: acct.peakEquity,
      tradingDays: acct.tradingDays,
      profitTargetPct: acct.currentPhase.profitTargetPct,
      dailyLossPct: acct.currentPhase.dailyLossPct,
      maxLossPct: acct.currentPhase.maxLossPct,
      drawdownType: acct.currentPhase.drawdownType,
      minTradingDays: acct.currentPhase.minTradingDays,
    });
    if (r.breachedDaily || r.breachedTotal) flagged.push(acct);
    else if (r.hitTarget) readyToPass.push(acct);
  }

  const [passReview, kycSubmitted, fundedAccounts, identityFlags] = await Promise.all([
    db.account.findMany({
      where: { phase: "pass_review", voidedAt: null },
      include: { person: true, challengeType: true },
    }),
    db.person.findMany({ where: { kycStatus: "submitted", voidedAt: null } }),
    db.account.findMany({
      where: { phase: "funded", voidedAt: null },
      include: { person: true, challengeType: true },
    }),
    db.person.findMany({ where: { identityMismatch: true, voidedAt: null } }),
  ]);

  const fundedWithoutKyc = fundedAccounts.filter((a) => a.person.kycStatus !== "verified");

  const total =
    flagged.length +
    readyToPass.length +
    passReview.length +
    kycSubmitted.length +
    fundedWithoutKyc.length +
    identityFlags.length;

  return { flagged, readyToPass, passReview, kycSubmitted, fundedWithoutKyc, identityFlags, total };
}
