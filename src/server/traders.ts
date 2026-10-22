import type { AccountPhase, AccountStatus, KycStatus } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";
import { determineAutoTransition, evaluateAccount } from "@/server/rules";
import { notifyTrader } from "@/server/notifications";
import { planAdvance } from "@/server/phase-advance";
import { lockAccount, lockPerson } from "@/server/row-lock";
import { isTerminalAccount } from "@/server/trading/core";

export async function listTraders(search?: string, statusFilter?: AccountStatus) {
  return db.person.findMany({
    where: {
      voidedAt: null,
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(statusFilter ? { accounts: { some: { status: statusFilter } } } : {}),
    },
    include: {
      accounts: {
        include: { challengeType: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTraderDetail(personId: string) {
  return db.person.findUnique({
    where: { id: personId },
    include: {
      accounts: {
        include: {
          challengeType: { include: { phases: { orderBy: { order: "asc" } } } },
          currentPhase: true,
          equityTicks: { orderBy: { timestamp: "desc" }, take: 20 },
          withdrawals: { orderBy: { requestedAt: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      },
      notes: { include: { authorAdmin: true }, orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
      kycDocuments: { orderBy: { uploadedAt: "desc" } },
    },
  });
}

function serializeAccountState(a: { status: AccountStatus; phase: AccountPhase; equity: unknown; dayStartEquity: unknown; peakEquity: unknown; tradingDays: number }) {
  return {
    status: a.status,
    phase: a.phase,
    equity: a.equity?.toString(),
    dayStartEquity: a.dayStartEquity?.toString(),
    peakEquity: a.peakEquity?.toString(),
    tradingDays: a.tradingDays,
  };
}

/**
 * Manual overrides of account state — status, phase, and the "simulate
 * account state" equity fields. Stands in for the real equity feed
 * (blocked on the trading-platform decision, spec §9); every override is
 * logged as exactly that, with a before/after diff, per
 * modules-to-design.md §1.3 ("manual equity or status overrides" is a
 * sensitive action).
 *
 * After the equity patch lands, this re-runs the same evaluateAccount()
 * math the pending-tasks queue uses and applies module 3.4's automatic
 * transition — "auto-close on breach; pass goes to review" — as a second,
 * separately audited step (actorType "system"). It only fires when the
 * admin didn't already set status/phase themselves in this same call, so
 * an explicit decision (e.g. voiding for an unrelated reason) is never
 * silently overwritten.
 */
export async function updateAccountState(input: {
  accountId: string;
  adminId: string;
  ipAddress: string;
  reason: string;
  patch: Partial<{
    status: AccountStatus;
    phase: AccountPhase;
    equity: number;
    dayStartEquity: number;
    peakEquity: number;
    tradingDays: number;
  }>;
}) {
  if (input.reason.trim().length < 4) {
    throw new ValidationError("A reason is required for a manual override.");
  }

  // The override and the automatic breach/pass step that follows it are one
  // transaction under the account's row lock: another override, the expiry
  // job or an "advance" cannot change the account between the two steps, and
  // the "before" recorded in the audit log is exactly the state that was
  // replaced, even when two staff members save at the same moment.
  const outcome = await db.$transaction(async (tx) => {
    await lockAccount(tx, input.accountId);

    // An account that trades in the simulated terminal has its equity worked out from its
    // trades and the live prices (src/server/trading/account-link.ts). Typing a number over
    // that would be silently overwritten on the next price, so it is refused. Status and
    // phase can still be changed.
    const typesEquity = input.patch.equity !== undefined || input.patch.dayStartEquity !== undefined || input.patch.peakEquity !== undefined || input.patch.tradingDays !== undefined;
    if (typesEquity && (await isTerminalAccount(tx, input.accountId))) {
      throw new ValidationError(
        "This account trades in the simulated terminal, so its equity, day-start equity, high-water mark and trading days come from its trades and can't be typed in. Status and phase can still be changed.",
        409,
      );
    }

    const before = await tx.account.findUniqueOrThrow({
      where: { id: input.accountId },
      include: { currentPhase: true, challengeType: true },
    });
    const updated = await tx.account.update({ where: { id: input.accountId }, data: input.patch });

    await writeAuditLog(
      {
        actorType: "admin",
        actorId: input.adminId,
        action: "account.manual_override",
        entityType: "Account",
        entityId: input.accountId,
        before: serializeAccountState(before),
        after: serializeAccountState(updated),
        reason: input.reason,
        ipAddress: input.ipAddress,
      },
      tx,
    );

    const statusSetByAdmin = input.patch.status !== undefined && input.patch.status !== before.status;
    const phaseSetByAdmin = input.patch.phase !== undefined && input.patch.phase !== before.phase;

    if (
      !statusSetByAdmin &&
      !phaseSetByAdmin &&
      before.status === "active" &&
      before.phase === "evaluation" &&
      before.currentPhase
    ) {
      const evalResult = evaluateAccount({
        accountSize: before.challengeType.accountSize,
        equity: updated.equity,
        dayStartEquity: updated.dayStartEquity,
        peakEquity: updated.peakEquity,
        tradingDays: updated.tradingDays,
        profitTargetPct: before.currentPhase.profitTargetPct,
        dailyLossPct: before.currentPhase.dailyLossPct,
        maxLossPct: before.currentPhase.maxLossPct,
        drawdownType: before.currentPhase.drawdownType,
        minTradingDays: before.currentPhase.minTradingDays,
      });
      const transition = determineAutoTransition(evalResult);

      if (transition) {
        const transitionPatch =
          transition.kind === "breach"
            ? { status: "breached" as const, phase: "closed" as const, endedAt: new Date(), closeReason: transition.reason }
            : { phase: "pass_review" as const };

        const final = await tx.account.update({ where: { id: input.accountId }, data: transitionPatch });

        await writeAuditLog(
          {
            actorType: "system",
            actorId: null,
            action: transition.kind === "breach" ? "account.auto_breached" : "account.auto_pass_review",
            entityType: "Account",
            entityId: input.accountId,
            before: serializeAccountState(updated),
            after: serializeAccountState(final),
            reason: transition.reason,
            ipAddress: input.ipAddress,
          },
          tx,
        );

        return { account: final, transition, personId: before.personId, challengeTypeName: before.challengeType.name };
      }
    }

    return { account: updated, transition: null };
  });

  // Emails and in-app notices go out only after the change has committed.
  if (outcome.transition) {
    const { transition, personId, challengeTypeName } = outcome;
    await notifyTrader({
      personId,
      type: transition.kind === "breach" ? "breach" : "phase_passed",
      title: transition.kind === "breach" ? "Account closed — rule breached" : "Profit target reached",
      body:
        transition.kind === "breach"
          ? `Your ${challengeTypeName} account was closed: ${transition.reason}`
          : `Your ${challengeTypeName} account hit its profit target and is now under review.`,
      link: "/portal",
    });
  }

  return outcome.account;
}

export async function voidAccount(input: {
  accountId: string;
  reason: string;
  adminId: string;
  ipAddress: string;
}) {
  if (input.reason.trim().length < 4) {
    throw new ValidationError("A reason is required to void an account.");
  }

  // Under the account lock so a void and a payout request / advance made at
  // the same moment are handled one after the other, and so a second void
  // cannot overwrite the first one's reason and actor.
  return db.$transaction(async (tx) => {
    await lockAccount(tx, input.accountId);

    const current = await tx.account.findUniqueOrThrow({ where: { id: input.accountId }, select: { voidedAt: true } });
    if (current.voidedAt) {
      throw new ValidationError("This account is already voided.", 409);
    }

    const updated = await tx.account.update({
      where: { id: input.accountId },
      data: { voidedAt: new Date(), voidReason: input.reason, voidedById: input.adminId },
    });

    await writeAuditLog(
      {
        actorType: "admin",
        actorId: input.adminId,
        action: "account.voided",
        entityType: "Account",
        entityId: input.accountId,
        reason: input.reason,
        ipAddress: input.ipAddress,
      },
      tx,
    );

    return updated;
  });
}

export async function setKycStatus(input: {
  personId: string;
  status: KycStatus;
  adminId: string;
  ipAddress: string;
  reason?: string;
}) {
  if (input.status === "rejected" && !input.reason?.trim()) {
    throw new ValidationError("A reason is required when rejecting KYC — the trader sees it.");
  }

  const before = await db.person.findUniqueOrThrow({ where: { id: input.personId } });
  const updated = await db.person.update({
    where: { id: input.personId },
    data: {
      kycStatus: input.status,
      kycRejectionReason: input.status === "rejected" ? input.reason!.trim() : null,
    },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "kyc.status_changed",
    entityType: "Person",
    entityId: input.personId,
    before: { kycStatus: before.kycStatus },
    after: { kycStatus: input.status },
    reason: input.reason,
    ipAddress: input.ipAddress,
  });

  if (input.status === "verified" || input.status === "rejected") {
    await notifyTrader({
      personId: input.personId,
      type: input.status === "verified" ? "kyc_verified" : "kyc_rejected",
      title: input.status === "verified" ? "Identity verified" : "Identity verification rejected",
      body:
        input.status === "verified"
          ? "Your identity documents have been verified."
          : `Your identity documents were rejected: ${input.reason}`,
      link: "/portal/kyc",
    });
  }

  return updated;
}

export async function resolveIdentityMismatch(input: {
  personId: string;
  adminId: string;
  ipAddress: string;
}) {
  const updated = await db.person.update({
    where: { id: input.personId },
    data: { identityMismatch: false },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "person.identity_mismatch_resolved",
    entityType: "Person",
    entityId: input.personId,
    reason: "Reviewed and confirmed same person.",
    ipAddress: input.ipAddress,
  });

  return updated;
}

/**
 * Moves an account out of pass review into its next challenge phase (the
 * funded stage, or a further evaluation phase). Until this existed, the
 * only way to "fund" an account was hand-editing the coarse `phase` field,
 * which left currentPhaseId on the evaluation rules — so a "funded" account
 * had no profit split and could never request a payout.
 *
 * resetEquity is an explicit, audited choice rather than a hard-coded
 * assumption: the spec is silent on whether a new phase starts from the
 * account size, and carrying evaluation profit into a funded account would
 * make the first payout pay out that profit (docs/decisions.md #18, open).
 */
export async function advanceAccount(input: {
  accountId: string;
  adminId: string;
  ipAddress: string;
  resetEquity: boolean;
  note?: string;
}) {
  const owner = await db.account.findUniqueOrThrow({ where: { id: input.accountId }, select: { personId: true } });

  // The plan is worked out from a fresh read taken under the row locks (person
  // first, then account — see row-lock.ts). A second "advance" for the same
  // account therefore waits, then finds the account already moved on and is
  // refused by planAdvance, instead of writing a second time.
  const done = await db.$transaction(async (tx) => {
    await lockPerson(tx, owner.personId);
    await lockAccount(tx, input.accountId);

    const account = await tx.account.findUniqueOrThrow({
      where: { id: input.accountId },
      include: { person: true, challengeType: { include: { phases: true } } },
    });

    const plan = planAdvance({
      accountPhase: account.phase,
      accountStatus: account.status,
      voided: account.voidedAt !== null,
      currentPhaseId: account.currentPhaseId,
      phases: account.challengeType.phases,
      kycStatus: account.person.kycStatus,
      kycTiming: account.challengeType.kycTiming,
    });
    if (!plan.ok) throw new ValidationError(plan.reason);

    const target = plan.target;
    const size = account.challengeType.accountSize;
    const updated = await tx.account.update({
      where: { id: account.id },
      data: {
        currentPhaseId: target.id,
        phase: target.isFunded ? "funded" : "evaluation",
        // Back to "active" whatever it was (e.g. a hand-set "passed"): payouts and the
        // rules engine only treat an active account as live.
        status: "active",
        phaseStartedAt: new Date(),
        ...(input.resetEquity
          ? { equity: size, balance: size, dayStartEquity: size, peakEquity: size, tradingDays: 0 }
          : {}),
      },
    });

    await writeAuditLog(
      {
        actorType: "admin",
        actorId: input.adminId,
        action: "account.advanced",
        entityType: "Account",
        entityId: account.id,
        before: { ...serializeAccountState(account), currentPhaseId: account.currentPhaseId },
        after: {
          ...serializeAccountState(updated),
          currentPhaseId: target.id,
          phaseLabel: target.label,
          resetEquity: input.resetEquity,
        },
        reason: input.note?.trim() || `Advanced to ${target.label}.`,
        ipAddress: input.ipAddress,
      },
      tx,
    );

    return { updated, target, personId: account.personId, challengeTypeName: account.challengeType.name };
  });

  await notifyTrader({
    personId: done.personId,
    type: "phase_passed",
    title: done.target.isFunded ? "Your account is funded" : "Phase passed",
    body: done.target.isFunded
      ? `Your ${done.challengeTypeName} account has been verified and is now funded.`
      : `Your ${done.challengeTypeName} account has moved on to ${done.target.label}.`,
    link: "/portal",
  });

  return done.updated;
}
