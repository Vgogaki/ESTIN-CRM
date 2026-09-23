import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";
import { CURRENT_TERMS_VERSION } from "@/server/terms";

/**
 * Phase 2 (order intake + payment) is what really creates accounts. Until
 * that exists, this is the only way to get an Account row for testing the
 * Challenge Builder's version-pinning and the terms-acceptance record. It's
 * an internal QA tool — gated on the same "challengeTypes.edit" permission
 * as the builder itself, not exposed to traders, and every grant is
 * unmistakably logged as such.
 */
export async function grantTestAccount(input: {
  personEmail: string;
  challengeTypeId: string;
  adminId: string;
  ipAddress: string;
}) {
  const person = await db.person.findUnique({
    where: { email: input.personEmail.trim().toLowerCase() },
  });
  if (!person) throw new ValidationError("No trader with that email. They need to register first.");

  const challengeType = await db.challengeType.findUnique({
    where: { id: input.challengeTypeId },
    include: { phases: { orderBy: { order: "asc" } } },
  });
  if (!challengeType) throw new ValidationError("Challenge type not found.");
  if (!challengeType.active) throw new ValidationError("This challenge type isn't published.");

  const firstPhase = challengeType.phases[0];

  const account = await db.$transaction(async (tx) => {
    const acct = await tx.account.create({
      data: {
        personId: person.id,
        challengeTypeId: challengeType.id,
        currentPhaseId: firstPhase?.id,
        orderRef: `TEST-${randomUUID()}`,
        equity: challengeType.accountSize,
        balance: challengeType.accountSize,
        dayStartEquity: challengeType.accountSize,
        peakEquity: challengeType.accountSize,
      },
    });

    await tx.termsAcceptance.create({
      data: {
        personId: person.id,
        accountId: acct.id,
        challengeTypeId: challengeType.id,
        termsVersion: CURRENT_TERMS_VERSION,
        ipAddress: input.ipAddress,
      },
    });

    return acct;
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "account.granted_for_testing",
    entityType: "Account",
    entityId: account.id,
    after: {
      personId: person.id,
      challengeTypeId: challengeType.id,
      challengeTypeVersion: challengeType.version,
      orderRef: account.orderRef,
    },
    reason:
      "Manually granted via the Phase 1 admin test tool — no order/payment flow yet (Phase 2).",
    ipAddress: input.ipAddress,
  });

  return account;
}

export async function listAccountsForPerson(email: string) {
  const person = await db.person.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: {
      accounts: {
        include: { challengeType: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return person?.accounts ?? [];
}
