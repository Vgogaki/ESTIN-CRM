import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { notifyTrader } from "@/server/notifications";
import { ValidationError } from "@/server/errors";
import { enforceCountry, hasOpenPayoutReview, openReview } from "@/server/countries";
import { hasOpenHighFlag } from "@/server/risk";
import { lockAccount, lockPerson } from "@/server/row-lock";
import { checkBestDay, dailyNetProfits, parseConsistencyRule } from "@/server/trading/consistency";

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

async function reservedAmountFor(accountId: string, client: Pick<Prisma.TransactionClient, "withdrawal"> = db): Promise<Prisma.Decimal> {
  const reserved = await client.withdrawal.findMany({
    where: { accountId, status: { in: ["pending", "approved", "paid"] } },
    select: { amount: true },
  });
  return reserved.reduce((sum, w) => sum.plus(w.amount), zero);
}

/** True for Prisma's "unique constraint violated" error (here: the one-pending-payout-per-account rule). */
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002";
}

const ALREADY_PENDING = "A payout request is already pending for this account.";

function assertAccountAllowsPayout(account: { voidedAt: Date | null; phase: string; status: string }) {
  if (account.voidedAt) {
    throw new ValidationError("This account is voided.");
  }
  if (account.phase !== "funded" || account.status !== "active") {
    throw new ValidationError("Payouts are only available on a funded, active account.");
  }
}

/**
 * Trader-initiated. Spec §8.4 requires server-side validation of funded
 * phase, verified KYC and available profit — the UI gate is convenience
 * only. Also enforces two requirements from modules-to-design.md §1.2/§1.3
 * that aren't in crm-specification.md's endpoint description but are
 * explicit elsewhere in the same doc: two-factor authentication is
 * required before requesting a payout (not just optional, unlike login),
 * and only one payout request can be in flight per account at a time.
 *
 * "One at a time" has to hold even when two requests arrive in the same
 * moment (a double-click, two browser tabs). So the checks that matter are
 * repeated inside a transaction that first locks the account row, and the
 * database refuses a second pending payout for an account outright (partial
 * unique index, migration 20261013150000). The checks before the transaction
 * are only there to give fast, specific error messages.
 */
export async function requestWithdrawal(input: { personId: string; accountId: string; ipAddress: string }) {
  const account = await db.account.findUniqueOrThrow({
    where: { id: input.accountId },
    include: { challengeType: true, currentPhase: true, person: true },
  });

  if (account.personId !== input.personId) {
    throw new ValidationError("Not your account.", 403);
  }
  assertAccountAllowsPayout(account);
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

  let created;
  try {
    created = await db.$transaction(async (tx) => {
      await lockAccount(tx, account.id);

      // Re-read under the lock: the account (equity, phase, status) and the
      // payouts may have changed since the read above.
      const fresh = await tx.account.findUniqueOrThrow({
        where: { id: account.id },
        include: { challengeType: true, currentPhase: true },
      });
      assertAccountAllowsPayout(fresh);

      const pending = await tx.withdrawal.findFirst({ where: { accountId: fresh.id, status: "pending" }, select: { id: true } });
      if (pending) {
        throw new ValidationError(ALREADY_PENDING, 409);
      }

      const splitPct = fresh.currentPhase?.profitSplitPct;
      if (!splitPct) {
        throw new ValidationError("This challenge phase has no profit split configured.");
      }

      // The best-day consistency rule (docs/decisions.md): no single day may be more than the
      // set share of the profit made on profitable days. It can only be checked where there are
      // trades to look at (an account that trades in the terminal), over the trades closed since
      // this phase began. An account with no trade data is not checked.
      const consistency = parseConsistencyRule(fresh.currentPhase?.consistencyRule);
      if (consistency) {
        const trades = await tx.tradePosition.findMany({
          where: { accountId: fresh.id, status: "closed", closedAt: { gte: fresh.phaseStartedAt } },
          select: { closedAt: true, grossPnl: true, commission: true },
        });
        if (trades.length > 0) {
          const days = dailyNetProfits(trades.map((t) => ({ closedAt: t.closedAt!, netPnl: (t.grossPnl ?? zero).minus(t.commission) })));
          const check = checkBestDay([...days.values()], consistency);
          if (!check.ok) {
            throw new ValidationError(
              `A payout isn't available yet: your best day (${check.bestDay.toFixed(2)}) is ${check.pct!.toFixed(1)}% of your profit on profitable days, and the limit is ${consistency.maxPct.toString()}%. Keep trading and try again once your profit is more evenly spread.`,
              409,
            );
          }
        }
      }

      const reserved = await reservedAmountFor(fresh.id, tx);
      const availableProfit = calculateAvailableProfit({
        equity: fresh.equity,
        accountSize: fresh.challengeType.accountSize,
        reservedAmount: reserved,
      });
      const amount = calculatePayoutAmount(availableProfit, splitPct);

      const minPayout = fresh.currentPhase?.minPayoutAmount;
      if (amount.lessThanOrEqualTo(0)) {
        throw new ValidationError("No profit available to withdraw.");
      }
      if (minPayout && amount.lessThan(minPayout)) {
        throw new ValidationError(
          `Minimum payout is ${minPayout.toString()} ${fresh.challengeType.currency}; available amount is ${amount.toString()}.`,
        );
      }

      const withdrawal = await tx.withdrawal.create({
        data: { accountId: fresh.id, profit: availableProfit, splitPct, amount },
      });

      await writeAuditLog(
        {
          actorType: "trader",
          actorId: input.personId,
          action: "withdrawal.requested",
          entityType: "Withdrawal",
          entityId: withdrawal.id,
          after: {
            accountId: fresh.id,
            profit: availableProfit.toString(),
            splitPct: splitPct.toString(),
            amount: amount.toString(),
          },
          ipAddress: input.ipAddress,
        },
        tx,
      );

      return { withdrawal, amount, currency: fresh.challengeType.currency };
    });
  } catch (err) {
    // Backstop: the database's own one-pending-payout-per-account rule.
    if (isUniqueViolation(err)) throw new ValidationError(ALREADY_PENDING, 409);
    throw err;
  }

  await notifyTrader({
    personId: input.personId,
    type: "payout_requested",
    title: "Payout requested",
    body: `Your payout request for ${created.amount.toString()} ${created.currency} has been submitted.`,
    link: "/portal",
  });

  return created.withdrawal;
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
 *
 * Two admins acting on the same payout at the same moment (one approves, one
 * declines; or both approve) must produce exactly one decision. The
 * decision is therefore made inside a transaction that (1) locks the
 * trader's row, so a KYC change cannot slip in between the check below and
 * the approval, and (2) changes the payout only if it is STILL pending — the
 * loser of a race finds it already decided and gets a clear message instead
 * of a second audit entry and a second email.
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

  const ALREADY_DECIDED = "This payout has already been decided.";
  if (withdrawal.status !== "pending") {
    throw new ValidationError(ALREADY_DECIDED, 409);
  }
  if (input.decision === "declined" && !input.note?.trim()) {
    throw new ValidationError("A reason is required when declining a payout.");
  }

  const updated = await db.$transaction(async (tx) => {
    await lockPerson(tx, withdrawal.account.personId);

    if (input.decision === "approved") {
      // CLAUDE.md: payout approval is blocked unless KYC is verified AND there
      // is no unresolved identity mismatch — re-checked here, at the moment of
      // approval, under the trader's row lock and against a fresh read, not
      // only when the request was made. Same for a payout-stage country
      // review (6.3).
      const person = await tx.person.findUniqueOrThrow({
        where: { id: withdrawal.account.personId },
        select: { kycStatus: true, identityMismatch: true },
      });
      if (person.kycStatus !== "verified") {
        throw new ValidationError("KYC must be verified before a payout can be approved.");
      }
      if (person.identityMismatch) {
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

    // Only the first decision gets through: the change applies only while the
    // payout is still pending.
    const changed = await tx.withdrawal.updateMany({
      where: { id: input.withdrawalId, status: "pending" },
      data: {
        status: input.decision,
        decidedById: input.adminId,
        decidedAt: new Date(),
        decisionNote: input.note?.trim() || null,
      },
    });
    if (changed.count === 0) {
      throw new ValidationError(ALREADY_DECIDED, 409);
    }
    const decided = await tx.withdrawal.findUniqueOrThrow({ where: { id: input.withdrawalId } });

    await writeAuditLog(
      {
        actorType: "admin",
        actorId: input.adminId,
        action: input.decision === "approved" ? "withdrawal.approved" : "withdrawal.declined",
        entityType: "Withdrawal",
        entityId: withdrawal.id,
        before: { status: "pending" },
        after: { status: decided.status },
        reason: input.note,
        ipAddress: input.ipAddress,
      },
      tx,
    );

    return decided;
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
