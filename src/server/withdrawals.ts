import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { notifyTrader } from "@/server/notifications";
import { ValidationError } from "@/server/errors";
import { enforceCountry, hasOpenPayoutReview, openReview } from "@/server/countries";
import { hasOpenHighFlag } from "@/server/risk";

const { Decimal } = Prisma;
const zero = new Decimal(0);
const max0 = (v: Prisma.Decimal) => (v.lessThan(zero) ? zero : v);

/**
 * Module 5.1/5.4 — spec §6.3 ("shows profit, split, and resulting amount")
 * and §5.3–5.5 ("ledger ties back to the account and the profit period it
 * covers"). "Available profit" is current pnl (equity − accountSize) minus
 * whatever is already reserved by a pending/approved/paid withdrawal on
 * this account, so the same profit can never be requested twice — a
 * declined request frees its amount back up. Pure and Decimal-based
 * throughout per CLAUDE.md's money rules; no DB access, tested the same
 * way as the rules engine.
 */
export function calculateAvailableProfit(input: {
  equity: Prisma.Decimal;
  accountSize: Prisma.Decimal;
  reservedAmount: Prisma.Decimal;
}): Prisma.Decimal {
  const totalProfit = max0(input.equity.minus(input.accountSize));
  return max0(totalProfit.minus(input.reservedAmount));
}

export function calculatePayoutAmount(availableProfit: Prisma.Decimal, splitPct: Prisma.Decimal): Prisma.Decimal {
  return availableProfit.times(splitPct).dividedBy(100);
}

async function reservedAmountFor(accountId: string): Promise<Prisma.Decimal> {
  const reserved = await db.withdrawal.findMany({
    where: { accountId, status: { in: ["pending", "approved", "paid"] } },
    select: { amount: true },
  });
  return reserved.reduce((sum, w) => sum.plus(w.amount), zero);
}

/**
 * Trader-initiated. Spec §8.4 requires server-side validation of funded
 * phase, verified KYC and available profit — the UI gate is convenience
 * only. Also enforces two requirements from modules-to-design.md §1.2/§1.3
 * that aren't in crm-specification.md's endpoint description but are
 * explicit elsewhere in the same doc: two-factor authentication is
 * required before requesting a payout (not just optional, unlike login),
 * and only one payout request can be in flight per account at a time.
 */
export async function requestWithdrawal(input: { personId: string; accountId: string; ipAddress: string }) {
  const account = await db.account.findUniqueOrThrow({
    where: { id: input.accountId },
    include: { challengeType: true, currentPhase: true, person: true, withdrawals: true },
  });

  if (account.personId !== input.personId) {
    throw new ValidationError("Not your account.", 403);
  }
  if (account.voidedAt) {
    throw new ValidationError("This account is voided.");
  }
  if (account.phase !== "funded" || account.status !== "active") {
    throw new ValidationError("Payouts are only available on a funded, active account.");
  }
  if (account.person.kycStatus !== "verified") {
    throw new ValidationError("Identity verification is required before requesting a payout.");
  }
  if (!account.person.twoFactorEnabledAt) {
    throw new ValidationError("Two-factor authentication is required before requesting a payout.");
  }
  const countryAction = await enforceCountry({
    countryCode: account.person.country,
    stage: "payout",
    ipAddress: input.ipAddress,
    personId: input.personId,
  });
  if (countryAction === "review") {
    await openReview({ personId: input.personId, stage: "payout", countryCode: account.person.country });
  }
  if (account.withdrawals.some((w) => w.status === "pending")) {
    throw new ValidationError("A payout request is already pending for this account.");
  }

  const splitPct = account.currentPhase?.profitSplitPct;
  if (!splitPct) {
    throw new ValidationError("This challenge phase has no profit split configured.");
  }

  const reserved = await reservedAmountFor(account.id);
  const availableProfit = calculateAvailableProfit({
    equity: account.equity,
    accountSize: account.challengeType.accountSize,
    reservedAmount: reserved,
  });
  const amount = calculatePayoutAmount(availableProfit, splitPct);

  const minPayout = account.currentPhase?.minPayoutAmount;
  if (amount.lessThanOrEqualTo(0)) {
    throw new ValidationError("No profit available to withdraw.");
  }
  if (minPayout && amount.lessThan(minPayout)) {
    throw new ValidationError(
      `Minimum payout is ${minPayout.toString()} ${account.challengeType.currency}; available amount is ${amount.toString()}.`,
    );
  }

  const withdrawal = await db.withdrawal.create({
    data: { accountId: account.id, profit: availableProfit, splitPct, amount },
  });

  await writeAuditLog({
    actorType: "trader",
    actorId: input.personId,
    action: "withdrawal.requested",
    entityType: "Withdrawal",
    entityId: withdrawal.id,
    after: {
      accountId: account.id,
      profit: availableProfit.toString(),
      splitPct: splitPct.toString(),
      amount: amount.toString(),
    },
    ipAddress: input.ipAddress,
  });

  await notifyTrader({
    personId: input.personId,
    type: "payout_requested",
    title: "Payout requested",
    body: `Your payout request for ${amount.toString()} ${account.challengeType.currency} has been submitted.`,
    link: "/portal",
  });

  return withdrawal;
}

/** Most recent admin to decide this person's KYC, for the segregation-of-duties check below. Null if KYC was never decided (or only auto-set). */
async function lastKycDecisionActorId(personId: string): Promise<string | null> {
  const entry = await db.auditLog.findFirst({
    where: { entityType: "Person", entityId: personId, action: "kyc.status_changed" },
    orderBy: { timestamp: "desc" },
  });
  return entry?.actorId ?? null;
}

/**
 * Module 5.2. Approving is gated by segregation of duties — CLAUDE.md and
 * crm-specification.md §10 both require the KYC reviewer and the payout
 * approver to be different people. Declining isn't gated the same way:
 * blocking a payout carries none of the risk that authorising one does.
 * "Optional four-eyes approval above a configurable threshold"
 * (modules-to-design.md §1.3) is explicitly optional and has no threshold
 * decided yet, so it isn't built — flagged here rather than guessed at.
 */
export async function decideWithdrawal(input: {
  withdrawalId: string;
  adminId: string;
  decision: "approved" | "declined";
  note?: string;
  ipAddress: string;
}) {
  const withdrawal = await db.withdrawal.findUniqueOrThrow({
    where: { id: input.withdrawalId },
    include: { account: { include: { challengeType: true, person: true } } },
  });

  if (withdrawal.status !== "pending") {
    throw new ValidationError("This payout has already been decided.");
  }
  if (input.decision === "declined" && !input.note?.trim()) {
    throw new ValidationError("A reason is required when declining a payout.");
  }
  if (input.decision === "approved") {
    // CLAUDE.md: payout approval is blocked unless KYC is verified AND there
    // is no unresolved identity mismatch — re-checked here, at the moment of
    // approval, not only when the request was made. Same for a payout-stage
    // country review (6.3).
    if (withdrawal.account.person.kycStatus !== "verified") {
      throw new ValidationError("KYC must be verified before a payout can be approved.");
    }
    if (withdrawal.account.person.identityMismatch) {
      throw new ValidationError("This trader has an unresolved identity mismatch — resolve it before approving a payout.");
    }
    if (await hasOpenPayoutReview(withdrawal.account.personId)) {
      throw new ValidationError("This trader has an open country review for payouts — clear it before approving.");
    }
    if (await hasOpenHighFlag(withdrawal.account.personId)) {
      throw new ValidationError("This trader has an open high-severity risk flag. Review or dismiss it (with a reason) before approving a payout.");
    }
    const kycActorId = await lastKycDecisionActorId(withdrawal.account.personId);
    if (kycActorId && kycActorId === input.adminId) {
      throw new ValidationError(
        "Segregation of duties: you reviewed this trader's KYC, so you can't also approve their payout. Ask another admin to approve it.",
      );
    }
  }

  const updated = await db.withdrawal.update({
    where: { id: input.withdrawalId },
    data: {
      status: input.decision,
      decidedById: input.adminId,
      decidedAt: new Date(),
      decisionNote: input.note?.trim() || null,
    },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: input.decision === "approved" ? "withdrawal.approved" : "withdrawal.declined",
    entityType: "Withdrawal",
    entityId: withdrawal.id,
    before: { status: withdrawal.status },
    after: { status: updated.status },
    reason: input.note,
    ipAddress: input.ipAddress,
  });

  await notifyTrader({
    personId: withdrawal.account.personId,
    type: input.decision === "approved" ? "payout_approved" : "payout_declined",
    title: input.decision === "approved" ? "Payout approved" : "Payout declined",
    body:
      input.decision === "approved"
        ? `Your payout of ${withdrawal.amount.toString()} ${withdrawal.account.challengeType.currency} has been approved.`
        : `Your payout request was declined: ${input.note}`,
    link: "/portal",
  });

  return updated;
}

/** Back office queue (spec §5.4): "trader, country, account size, profit, split %, amount, KYC status, decision actions." */
export async function listPendingWithdrawals() {
  return db.withdrawal.findMany({
    where: { status: "pending" },
    include: { account: { include: { person: true, challengeType: true } } },
    orderBy: { requestedAt: "asc" },
  });
}

export async function listAllWithdrawals() {
  return db.withdrawal.findMany({
    include: { account: { include: { person: true, challengeType: true } }, decidedBy: true },
    orderBy: { requestedAt: "desc" },
  });
}

export async function listPersonWithdrawals(personId: string) {
  return db.withdrawal.findMany({
    where: { account: { personId } },
    include: { account: { include: { challengeType: true } } },
    orderBy: { requestedAt: "desc" },
  });
}
