import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { isPhaseExpired } from "@/server/expiry";
import { notifyTrader } from "@/server/notifications";
import { lockAccount } from "@/server/row-lock";

/**
 * Module 3.5's sweep — run on a schedule by pg-boss (src/server/jobs/boss.ts).
 * Only active, evaluation-phase accounts on a challenge phase with a time
 * limit are candidates; anything already closed, breached, voided, in
 * pass_review or funded is untouched (a phase's time limit only governs
 * finishing the evaluation itself). Closing is audited exactly like the
 * breach/pass automation in module 3.4 — actorType "system", its own entry.
 *
 * The first query only builds a shortlist. Each account is then re-read under
 * its row lock and re-checked before it is closed, so an account that was
 * breached, passed, advanced or voided in the meantime (by staff, or by a
 * second copy of this job running at the same moment) is left exactly as it
 * is — it is never overwritten with "closed".
 */
export async function runExpirySweep(now: Date = new Date()) {
  const candidates = await db.account.findMany({
    where: {
      voidedAt: null,
      status: "active",
      phase: "evaluation",
      currentPhase: { timeLimitDays: { not: null } },
    },
    select: { id: true },
  });

  let closed = 0;
  let failed = 0;
  for (const { id } of candidates) {
    // One account that cannot be processed must not stop the others from being
    // closed on time; it is logged and tried again on the next run.
    let result;
    try {
      result = await closeIfExpired(id, now);
    } catch (err) {
      failed++;
      console.error(`[expiry] could not process account ${id}`, err);
      continue;
    }
    if (!result) continue;

    await notifyTrader({
      personId: result.personId,
      type: "account_expired",
      title: "Account closed — time limit reached",
      body: `Your ${result.challengeTypeName} account was closed: ${result.reason}`,
      link: "/portal",
    });

    closed++;
  }

  return { checked: candidates.length, closed, failed };
}

/** Closes one account if (and only if) it is still active, in evaluation and past its time limit. Null means it was left alone. */
async function closeIfExpired(id: string, now: Date) {
  return db.$transaction(async (tx) => {
    await lockAccount(tx, id);

    const acct = await tx.account.findUniqueOrThrow({
      where: { id },
      include: { currentPhase: true, challengeType: true },
    });

    // Same conditions as the shortlist, on fresh data.
    if (acct.voidedAt || acct.status !== "active" || acct.phase !== "evaluation" || !acct.currentPhase) return null;
    if (!isPhaseExpired({ timeLimitDays: acct.currentPhase.timeLimitDays, phaseStartedAt: acct.phaseStartedAt, now })) {
      return null;
    }

    const reason = `Time limit reached: ${acct.currentPhase.label} time limit of ${acct.currentPhase.timeLimitDays} day(s) exceeded.`;
    const updated = await tx.account.update({
      where: { id },
      data: { status: "closed", phase: "closed", endedAt: now, closeReason: reason },
    });

    await writeAuditLog(
      {
        actorType: "system",
        actorId: null,
        action: "account.auto_expired",
        entityType: "Account",
        entityId: id,
        before: { status: acct.status, phase: acct.phase },
        after: { status: updated.status, phase: updated.phase },
        reason,
      },
      tx,
    );

    return { reason, personId: acct.personId, challengeTypeName: acct.challengeType.name };
  });
}
