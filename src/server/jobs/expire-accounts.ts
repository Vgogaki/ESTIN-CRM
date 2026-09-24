import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { isPhaseExpired } from "@/server/expiry";

/**
 * Module 3.5's sweep — run on a schedule by pg-boss (src/server/jobs/boss.ts).
 * Only active, evaluation-phase accounts on a challenge phase with a time
 * limit are candidates; anything already closed, breached, voided, in
 * pass_review or funded is untouched (a phase's time limit only governs
 * finishing the evaluation itself). Closing is audited exactly like the
 * breach/pass automation in module 3.4 — actorType "system", its own entry.
 */
export async function runExpirySweep(now: Date = new Date()) {
  const candidates = await db.account.findMany({
    where: {
      voidedAt: null,
      status: "active",
      phase: "evaluation",
      currentPhase: { timeLimitDays: { not: null } },
    },
    include: { currentPhase: true },
  });

  let closed = 0;
  for (const acct of candidates) {
    if (!acct.currentPhase) continue;
    if (!isPhaseExpired({ timeLimitDays: acct.currentPhase.timeLimitDays, phaseStartedAt: acct.phaseStartedAt, now })) {
      continue;
    }

    const reason = `Time limit reached: ${acct.currentPhase.label} time limit of ${acct.currentPhase.timeLimitDays} day(s) exceeded.`;
    const updated = await db.account.update({
      where: { id: acct.id },
      data: { status: "closed", phase: "closed", endedAt: now, closeReason: reason },
    });

    await writeAuditLog({
      actorType: "system",
      actorId: null,
      action: "account.auto_expired",
      entityType: "Account",
      entityId: acct.id,
      before: { status: acct.status, phase: acct.phase },
      after: { status: updated.status, phase: updated.phase },
      reason,
    });

    closed++;
  }

  return { checked: candidates.length, closed };
}
