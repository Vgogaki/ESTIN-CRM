import { db } from "@/server/db";
import { evaluateAccount } from "@/server/rules";
import { getEligibleBreachedTraders } from "@/server/offers";
import { listOpenReviews } from "@/server/countries";
import { listOpenStrongLinks } from "@/server/account-links";
import { listAwaitingStaff } from "@/server/support";

/**
 * The operations queue (spec §5.2, module 3.7) — everything waiting on
 * staff, derived automatically rather than tracked by hand. Full version
 * is Phase 3 (needs the rules engine and equity feed); this is what's
 * derivable now from data that already exists. `flagged` and `readyToPass`
 * below are now mostly a safety net rather than the primary path: module
 * 3.4 auto-transitions an account (out of active/evaluation) the moment a
 * breach or pass is detected on an equity update, so these two buckets
 * should normally stay empty and only catch something that was never run
 * back through updateAccountState (e.g. data imported directly, or a
 * phase's rules edited after the equity was last set).
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

  const [passReview, kycSubmitted, fundedAccounts, identityFlags, pendingWithdrawals, offerLeads, countryReviews, linkedAccounts, supportThreads] =
    await Promise.all([
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
      db.withdrawal.findMany({
        where: { status: "pending" },
        include: { account: { include: { person: true, challengeType: true } } },
      }),
      getEligibleBreachedTraders(),
      listOpenReviews(),
      listOpenStrongLinks(),
      listAwaitingStaff(),
    ]);

  const fundedWithoutKyc = fundedAccounts.filter((a) => a.person.kycStatus !== "verified");

  const total =
    flagged.length +
    readyToPass.length +
    passReview.length +
    kycSubmitted.length +
    fundedWithoutKyc.length +
    identityFlags.length +
    pendingWithdrawals.length +
    offerLeads.length +
    countryReviews.length +
    linkedAccounts.length +
    supportThreads.length;

  return {
    flagged,
    readyToPass,
    passReview,
    kycSubmitted,
    fundedWithoutKyc,
    identityFlags,
    pendingWithdrawals,
    offerLeads,
    countryReviews,
    linkedAccounts,
    supportThreads,
    total,
  };
}
