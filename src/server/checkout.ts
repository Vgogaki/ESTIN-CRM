import { randomUUID } from "node:crypto";
import type { CheckoutSession } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";
import { enforceCountry } from "@/server/countries";
import { createOrder } from "@/server/orders";
import { resolveCode } from "@/server/affiliate-referrals";
import { CURRENT_TERMS_VERSION } from "@/server/terms";
import { DEMO_PROVIDER, maxActiveAccounts, paymentMode } from "@/server/payments/driver";
import { amountDueFor, checkoutExpiry, chooseBestOffer, isCheckoutExpired } from "@/server/checkout-pricing";

/**
 * A trader buying a challenge in the portal (spec §8.1's order intake, from the
 * inside).
 *
 *   1. startCheckout: the SERVER decides the price (the browser sends only which
 *      challenge, the terms tick and an optional referral code), applies the
 *      trader's own outstanding offer, checks the country rules, and records a
 *      pending CheckoutSession pinned to the exact challenge version shown.
 *   2. completeCheckout: the payment driver confirms payment, then the SAME
 *      createOrder the website uses creates the account. createOrder is
 *      idempotent on the order reference, so a double click, a retry or a
 *      replayed confirmation can never create a second account or payment.
 *
 * Nothing is bought unless the payment driver allows it (payments/driver.ts).
 */

/** The trader's outstanding offers for one challenge family (an offer is for the family, so it still applies after a new version). */
async function applicableOffers(personId: string, familyId: string, now: Date) {
  const offers = await db.issuedOffer.findMany({
    where: { personId, status: "sent", expiresAt: { gte: now }, challengeType: { familyId } },
    include: { campaign: { select: { code: true, name: true } } },
  });
  return offers.map((o) => ({ id: o.id, campaignCode: o.campaign.code, campaignName: o.campaign.name, offerFee: o.offerFee, expiresAt: o.expiresAt }));
}

/** If an account limit is set (MAX_ACTIVE_ACCOUNTS), a trader at the limit can't buy another until one ends. No limit by default. */
async function assertUnderAccountLimit(personId: string) {
  const limit = maxActiveAccounts();
  if (limit === null) return;
  const live = await db.account.count({
    where: { personId, voidedAt: null, status: { in: ["active", "passed"] }, phase: { in: ["evaluation", "pass_review", "funded"] } },
  });
  if (live >= limit) {
    throw new ValidationError(`You already have ${live} active challenge account${live === 1 ? "" : "s"}, which is the most you can hold at once. You can buy another when one ends.`, 409);
  }
}

/** What the "Buy a challenge" list shows: every challenge on sale, with this trader's offer price where they have one. */
export async function listCatalog(personId: string) {
  const now = new Date();
  const types = await db.challengeType.findMany({ where: { active: true }, include: { phases: { orderBy: { order: "asc" } } }, orderBy: { accountSize: "asc" } });
  return Promise.all(
    types.map(async (ct) => {
      const offer = chooseBestOffer(await applicableOffers(personId, ct.familyId, now));
      return { challenge: ct, amountDue: amountDueFor(ct.fee, offer), offer };
    }),
  );
}

/** The review page for one challenge. Same price logic as startCheckout, so what is shown is what is charged. */
export async function getReview(personId: string, challengeTypeId: string) {
  const ct = await db.challengeType.findUnique({ where: { id: challengeTypeId }, include: { phases: { orderBy: { order: "asc" } } } });
  if (!ct || !ct.active) return null;
  const offer = chooseBestOffer(await applicableOffers(personId, ct.familyId, new Date()));
  return { challenge: ct, amountDue: amountDueFor(ct.fee, offer), offer };
}

export async function startCheckout(input: {
  personId: string;
  challengeTypeId: string;
  acceptTerms: boolean;
  referralCode?: string | null;
  ipAddress: string;
}): Promise<CheckoutSession> {
  if (paymentMode() === "none") throw new ValidationError("Purchases aren't available yet.", 503);
  if (!input.acceptTerms) throw new ValidationError("Please accept the terms to continue.");

  const person = await db.person.findUnique({ where: { id: input.personId } });
  if (!person || person.voidedAt) throw new ValidationError("This account can't make purchases.", 403);

  const ct = await db.challengeType.findUnique({ where: { id: input.challengeTypeId } });
  if (!ct || !ct.active) throw new ValidationError("This challenge isn't on sale.", 422);

  await assertUnderAccountLimit(person.id);

  // A blocked country is refused here, before any payment is taken (it is refused again inside createOrder).
  await enforceCountry({ countryCode: person.country, stage: "purchase", ipAddress: input.ipAddress, personId: person.id });

  let affiliateCode: string | null = null;
  const typed = input.referralCode?.trim();
  if (typed) {
    const resolved = await resolveCode(typed);
    if (resolved.kind !== "ok") throw new ValidationError("That referral code isn't valid.");
    affiliateCode = resolved.code.code;
  }

  const now = new Date();
  const offer = chooseBestOffer(await applicableOffers(person.id, ct.familyId, now));
  const data = {
    currency: ct.currency,
    normalFee: ct.fee,
    amountDue: amountDueFor(ct.fee, offer),
    offerCode: offer?.campaignCode ?? null,
    affiliateCode,
    termsVersion: CURRENT_TERMS_VERSION,
    termsAcceptedAt: now,
    ipAddress: input.ipAddress,
    expiresAt: checkoutExpiry(now),
  };

  // One open checkout per trader per challenge: clicking "Continue" twice reuses it.
  const open = await db.checkoutSession.findFirst({ where: { personId: person.id, challengeTypeId: ct.id, status: "pending", expiresAt: { gt: now } } });
  const session = open
    ? await db.checkoutSession.update({ where: { id: open.id }, data })
    : await db.checkoutSession.create({ data: { ...data, personId: person.id, challengeTypeId: ct.id, orderRef: `PORTAL-${randomUUID()}` } });

  await writeAuditLog({
    actorType: "trader",
    actorId: person.id,
    action: "checkout.started",
    entityType: "CheckoutSession",
    entityId: session.id,
    after: { challengeTypeId: ct.id, amountDue: session.amountDue.toString(), currency: session.currency, offerCode: session.offerCode, affiliateCode },
    ipAddress: input.ipAddress,
  });
  return session;
}

/** A checkout, only ever for the trader who owns it (anyone else gets "not found", same as a missing one). */
export async function getCheckout(sessionId: string, personId: string) {
  const session = await db.checkoutSession.findUnique({ where: { id: sessionId }, include: { challengeType: true } });
  if (!session || session.personId !== personId) return null;
  return session;
}

async function expireSession(id: string) {
  await db.checkoutSession.updateMany({ where: { id, status: "pending" }, data: { status: "expired" } });
}

/**
 * Confirms payment through the driver, then creates the account. Safe to call
 * twice (double click, retry): the second call returns the same account.
 */
export async function completeCheckout(input: { sessionId: string; personId: string; ipAddress: string }) {
  const session = await db.checkoutSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.personId !== input.personId) throw new ValidationError("Checkout not found.", 404);

  if (session.status === "paid" && session.accountId) {
    return { account: await db.account.findUniqueOrThrow({ where: { id: session.accountId } }), alreadyDone: true as const };
  }
  if (session.status === "expired") throw new ValidationError("This checkout has expired. Please start again.", 409);

  const mode = paymentMode();
  if (mode === "none") throw new ValidationError("Purchases aren't available yet.", 503);

  const now = new Date();
  if (isCheckoutExpired(session.expiresAt, now)) {
    await expireSession(session.id);
    throw new ValidationError("This checkout has expired. Please start again.", 409);
  }
  // Things that can change while the trader is on the payment page: the terms, the offer, the challenge itself.
  if (session.termsVersion !== CURRENT_TERMS_VERSION) {
    await expireSession(session.id);
    throw new ValidationError("The terms were updated. Please review and accept them again.", 409);
  }
  if (session.offerCode) {
    const stillOutstanding = await db.issuedOffer.findFirst({
      where: { personId: session.personId, status: "sent", expiresAt: { gte: now }, campaign: { code: session.offerCode } },
      select: { id: true },
    });
    if (!stillOutstanding) {
      await expireSession(session.id);
      throw new ValidationError("Your offer is no longer available. Review the price and try again.", 409);
    }
  }
  const ct = await db.challengeType.findUnique({ where: { id: session.challengeTypeId } });
  if (!ct || !ct.active) {
    await expireSession(session.id);
    throw new ValidationError("This challenge isn't on sale any more.", 422);
  }

  const person = await db.person.findUniqueOrThrow({ where: { id: session.personId } });
  if (person.voidedAt) throw new ValidationError("This account can't make purchases.", 403);
  await assertUnderAccountLimit(person.id);

  // The payment step. "demo" simulates it (no money moves); a real provider would confirm a hosted payment here.
  const provider = DEMO_PROVIDER;
  const providerReference = `demo-${session.id}`;

  const { account } = await createOrder({
    orderRef: session.orderRef,
    fullName: person.fullName,
    email: person.email,
    country: person.country,
    challengeTypeId: session.challengeTypeId,
    amountPaid: Number(session.amountDue.toString()),
    currency: session.currency,
    paymentProvider: provider,
    affiliateCode: session.affiliateCode,
    offerCode: session.offerCode,
    ipAddress: input.ipAddress,
  });

  // A concurrent second click may already have recorded this (same account either way); only the one that
  // actually moved the session to paid writes the audit entry.
  const marked = await db.checkoutSession.updateMany({
    where: { id: session.id, status: "pending" },
    data: { status: "paid", paidAt: new Date(), accountId: account.id, paymentProvider: provider, providerReference },
  });
  if (marked.count === 1) {
    await writeAuditLog({
      actorType: "trader",
      actorId: person.id,
      action: "checkout.completed",
      entityType: "CheckoutSession",
      entityId: session.id,
      after: { accountId: account.id, orderRef: session.orderRef, amountDue: session.amountDue.toString(), provider },
      ipAddress: input.ipAddress,
    });
  }
  return { account, alreadyDone: false as const };
}
