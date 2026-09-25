import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";
import { CURRENT_TERMS_VERSION } from "@/server/terms";
import { notifyTrader } from "@/server/notifications";

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export type CreateOrderInput = {
  orderRef: string;
  fullName: string;
  email: string;
  country: string;
  challengeTypeId: string;
  amountPaid: number;
  currency: string;
  paymentProvider: string;
  affiliateCode?: string | null;
  ipAddress: string;
};

/**
 * spec §8.1 — called by checkout on successful payment. Idempotent on
 * order_ref: a replayed webhook returns the existing account rather than
 * creating a duplicate (the most common integration bug in this class of
 * system, per the spec). Pins the account to the EXACT challenge type
 * version the customer was shown at checkout, not "whatever is active
 * now" — protects against a race with an admin publishing a new version
 * mid-checkout.
 */
export async function createOrder(input: CreateOrderInput) {
  const existing = await db.account.findUnique({ where: { orderRef: input.orderRef } });
  if (existing) return { account: existing, replay: true as const };

  const challengeType = await db.challengeType.findUnique({
    where: { id: input.challengeTypeId },
    include: { phases: { orderBy: { order: "asc" } } },
  });
  if (!challengeType || !challengeType.active) {
    throw new ValidationError("This challenge type is not currently available.", 422);
  }

  const email = input.email.trim().toLowerCase();
  let person = await db.person.findUnique({ where: { email } });
  let identityMismatch = false;

  if (!person) {
    person = await db.person.create({
      data: { fullName: input.fullName, email, country: input.country },
    });
    await writeAuditLog({
      actorType: "integration",
      actorId: null,
      action: "person.created",
      entityType: "Person",
      entityId: person.id,
      after: { email, fullName: input.fullName },
      ipAddress: input.ipAddress,
    });
  } else if (normalizeName(person.fullName) !== normalizeName(input.fullName)) {
    identityMismatch = true;
    await db.person.update({ where: { id: person.id }, data: { identityMismatch: true } });
    await writeAuditLog({
      actorType: "system",
      actorId: null,
      action: "person.identity_mismatch_flagged",
      entityType: "Person",
      entityId: person.id,
      before: { fullName: person.fullName },
      after: { fullNameOnOrder: input.fullName },
      reason: `Order ${input.orderRef}: name on this order differs from the name on file for this email. Purchase was not blocked; payouts are, until reviewed.`,
      ipAddress: input.ipAddress,
    });
  }

  const firstPhase = challengeType.phases[0];

  try {
    const account = await db.$transaction(async (tx) => {
      const acct = await tx.account.create({
        data: {
          personId: person!.id,
          challengeTypeId: challengeType.id,
          currentPhaseId: firstPhase?.id,
          orderRef: input.orderRef,
          equity: challengeType.accountSize,
          balance: challengeType.accountSize,
          dayStartEquity: challengeType.accountSize,
          peakEquity: challengeType.accountSize,
        },
      });

      await tx.payment.create({
        data: {
          personId: person!.id,
          accountId: acct.id,
          orderRef: input.orderRef,
          amountPaid: input.amountPaid,
          currency: input.currency,
          paymentProvider: input.paymentProvider,
          affiliateCode: input.affiliateCode ?? null,
          status: "succeeded",
        },
      });

      await tx.termsAcceptance.create({
        data: {
          personId: person!.id,
          accountId: acct.id,
          challengeTypeId: challengeType.id,
          termsVersion: CURRENT_TERMS_VERSION,
          ipAddress: input.ipAddress,
        },
      });

      return acct;
    });

    await writeAuditLog({
      actorType: "integration",
      actorId: null,
      action: "order.created",
      entityType: "Account",
      entityId: account.id,
      after: {
        orderRef: account.orderRef,
        personId: person.id,
        challengeTypeId: challengeType.id,
        challengeTypeVersion: challengeType.version,
        amountPaid: input.amountPaid,
        currency: input.currency,
      },
      ipAddress: input.ipAddress,
    });

    await notifyTrader({
      personId: person.id,
      type: "account_created",
      title: "Challenge account created",
      body: `Your ${challengeType.name} account is ready.`,
      link: "/portal",
    });

    return { account, replay: false as const, identityMismatch };
  } catch (err) {
    // Race: two requests with the same order_ref arrived concurrently and
    // both passed the pre-check above. The unique constraint on orderRef
    // caught it — treat it the same as a replay.
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      const account = await db.account.findUniqueOrThrow({ where: { orderRef: input.orderRef } });
      return { account, replay: true as const };
    }
    throw err;
  }
}
