import type { AccountPhase, AccountStatus, KycStatus } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";
import { determineAutoTransition, evaluateAccount } from "@/server/rules";
import { notifyTrader } from "@/server/notifications";

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
          challengeType: true,
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

  const before = await db.account.findUniqueOrThrow({
    where: { id: input.accountId },
    include: { currentPhase: true, challengeType: true },
  });
  const updated = await db.account.update({ where: { id: input.accountId }, data: input.patch });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "account.manual_override",
    entityType: "Account",
    entityId: input.accountId,
    before: serializeAccountState(before),
    after: serializeAccountState(updated),
    reason: input.reason,
    ipAddress: input.ipAddress,
  });

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

      const final = await db.account.update({ where: { id: input.accountId }, data: transitionPatch });

      await writeAuditLog({
        actorType: "system",
        actorId: null,
        action: transition.kind === "breach" ? "account.auto_breached" : "account.auto_pass_review",
        entityType: "Account",
        entityId: input.accountId,
        before: serializeAccountState(updated),
        after: serializeAccountState(final),
        reason: transition.reason,
        ipAddress: input.ipAddress,
      });

      await notifyTrader({
        personId: before.personId,
        type: transition.kind === "breach" ? "breach" : "phase_passed",
        title: transition.kind === "breach" ? "Account closed — rule breached" : "Profit target reached",
        body:
          transition.kind === "breach"
            ? `Your ${before.challengeType.name} account was closed: ${transition.reason}`
            : `Your ${before.challengeType.name} account hit its profit target and is now under review.`,
        link: "/portal",
      });

      return final;
    }
  }

  return updated;
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

  const updated = await db.account.update({
    where: { id: input.accountId },
    data: { voidedAt: new Date(), voidReason: input.reason, voidedById: input.adminId },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "account.voided",
    entityType: "Account",
    entityId: input.accountId,
    reason: input.reason,
    ipAddress: input.ipAddress,
  });

  return updated;
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
