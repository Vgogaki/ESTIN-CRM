import type { RiskFlagSeverity, RiskFlagStatus } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";

/**
 * Module 6.7 — risk flags and a per-person risk profile.
 *
 * Rule from the spec: an open HIGH flag blocks payout approval (enforced
 * server-side in decideWithdrawal via hasOpenHighFlag). Deliberate choices:
 *  - Only staff can set a flag HIGH. Automatic flags are medium at most, because
 *    whether something like a confirmed multiple-account link should block
 *    payouts is still an open decision — the system doesn't decide it silently.
 *  - There is no numeric "risk score". The profile shows the highest open flag
 *    and the raw signals next to it; inventing weights would be a policy call.
 */

// ---------------------------------------------------------------------------
// Pure logic (unit-tested)
// ---------------------------------------------------------------------------

const RANK: Record<RiskFlagSeverity, number> = { low: 1, medium: 2, high: 3 };

type FlagLike = { status: RiskFlagStatus; severity: RiskFlagSeverity };

/** Highest severity among OPEN flags, or null when there is nothing open. Reviewed and dismissed flags don't count. */
export function riskLevel(flags: FlagLike[]): RiskFlagSeverity | null {
  let top: RiskFlagSeverity | null = null;
  for (const f of flags) if (f.status === "open" && (top === null || RANK[f.severity] > RANK[top])) top = f.severity;
  return top;
}

/** The payout rule: any open high-severity flag blocks approval. */
export function blocksPayout(flags: FlagLike[]): boolean {
  return flags.some((f) => f.status === "open" && f.severity === "high");
}

/** Open flags only can be resolved; resolving is one-way (raise a new flag if it comes back). */
export function canResolve(status: RiskFlagStatus): boolean {
  return status === "open";
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export async function hasOpenHighFlag(personId: string): Promise<boolean> {
  return (await db.riskFlag.count({ where: { personId, status: "open", severity: "high" } })) > 0;
}

export async function raiseFlag(input: {
  personId: string;
  severity: RiskFlagSeverity;
  summary: string;
  adminId: string;
  ipAddress: string;
}) {
  const summary = input.summary.trim();
  if (summary.length < 5) throw new ValidationError("Describe the concern (at least a short sentence).");
  const person = await db.person.findUnique({ where: { id: input.personId }, select: { id: true } });
  if (!person) throw new ValidationError("Trader not found.", 404);
  const flag = await db.riskFlag.create({
    data: { personId: input.personId, type: "manual", source: "admin", severity: input.severity, summary, createdById: input.adminId },
  });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "risk_flag.raised",
    entityType: "RiskFlag",
    entityId: flag.id,
    after: { personId: input.personId, severity: input.severity, summary },
    ipAddress: input.ipAddress,
  });
  return flag;
}

/**
 * Automatic flag from a detector. Idempotent on (person, dedupeKey), medium at most,
 * and never throws into the caller (detection must not break registration or login).
 */
export async function raiseSystemFlag(input: { personId: string; type: string; summary: string; dedupeKey: string; severity?: "low" | "medium" }) {
  try {
    const existing = await db.riskFlag.findUnique({ where: { personId_dedupeKey: { personId: input.personId, dedupeKey: input.dedupeKey } } });
    if (existing) return existing;
    const flag = await db.riskFlag.create({
      data: { personId: input.personId, type: input.type, source: "system", severity: input.severity ?? "medium", summary: input.summary, dedupeKey: input.dedupeKey },
    });
    await writeAuditLog({
      actorType: "system",
      actorId: null,
      action: "risk_flag.raised",
      entityType: "RiskFlag",
      entityId: flag.id,
      after: { personId: input.personId, type: input.type, severity: flag.severity, summary: input.summary },
    });
    return flag;
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") return null; // concurrent duplicate
    console.error("[risk] could not raise system flag", err);
    return null;
  }
}

export async function resolveFlag(input: {
  flagId: string;
  status: "reviewed" | "dismissed";
  reason: string;
  adminId: string;
  ipAddress: string;
}) {
  if (input.reason.trim().length < 4) throw new ValidationError("A reason is required recording what you found.");
  const flag = await db.riskFlag.findUnique({ where: { id: input.flagId } });
  if (!flag) throw new ValidationError("Flag not found.", 404);
  if (!canResolve(flag.status)) throw new ValidationError("This flag has already been resolved.");
  const updated = await db.riskFlag.update({
    where: { id: flag.id },
    data: { status: input.status, reviewedById: input.adminId, reviewedAt: new Date(), reviewReason: input.reason.trim() },
  });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: `risk_flag.${input.status}`,
    entityType: "RiskFlag",
    entityId: flag.id,
    before: { status: flag.status, severity: flag.severity },
    after: { status: updated.status },
    reason: input.reason.trim(),
    ipAddress: input.ipAddress,
  });
  return updated;
}

/** Changing severity is how a medium flag becomes payout-blocking, so it needs a reason and is audited. */
export async function changeSeverity(input: { flagId: string; severity: RiskFlagSeverity; reason: string; adminId: string; ipAddress: string }) {
  if (input.reason.trim().length < 4) throw new ValidationError("A reason is required for changing severity.");
  const flag = await db.riskFlag.findUnique({ where: { id: input.flagId } });
  if (!flag) throw new ValidationError("Flag not found.", 404);
  if (flag.status !== "open") throw new ValidationError("Only an open flag can be changed.");
  if (flag.severity === input.severity) return flag;
  const updated = await db.riskFlag.update({ where: { id: flag.id }, data: { severity: input.severity } });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "risk_flag.severity_changed",
    entityType: "RiskFlag",
    entityId: flag.id,
    before: { severity: flag.severity },
    after: { severity: updated.severity },
    reason: input.reason.trim(),
    ipAddress: input.ipAddress,
  });
  return updated;
}

/** Everything staff need on one card: the flags, the level, and the raw signals that sit outside the flag list. */
export async function riskProfile(personId: string) {
  const [flags, person, openStrongLinks, openCountryReviews] = await Promise.all([
    db.riskFlag.findMany({ where: { personId }, orderBy: { createdAt: "desc" } }),
    db.person.findUnique({ where: { id: personId }, select: { identityMismatch: true, kycStatus: true } }),
    db.accountLink.count({ where: { status: "open", strength: "strong", OR: [{ personAId: personId }, { personBId: personId }] } }),
    db.countryReview.count({ where: { personId, status: "open" } }),
  ]);
  return {
    flags,
    level: riskLevel(flags),
    blocksPayout: blocksPayout(flags),
    signals: { identityMismatch: person?.identityMismatch ?? false, kycStatus: person?.kycStatus ?? "not_started", openStrongLinks, openCountryReviews },
  };
}

/** Pending tasks: every open flag, worst first. */
export async function listOpenFlags() {
  const rows = await db.riskFlag.findMany({ where: { status: "open" }, include: { person: true }, orderBy: { createdAt: "asc" } });
  return rows.sort((a, b) => RANK[b.severity] - RANK[a.severity]);
}
