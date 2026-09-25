import { Prisma, type OfferAudience, type OfferDiscountType } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { notifyTrader } from "@/server/notifications";
import { ValidationError } from "@/server/errors";

const { Decimal } = Prisma;

/**
 * Module 7.1 — the prototype (back-office.jsx's OffersView) demonstrated
 * the screens but enforced nothing: "Mark redeemed" was a plain UI toggle
 * with no cap check, so an admin could click past maxUses with no limit
 * (v1-build-plan.md flagged exactly this as "needs server-side redemption
 * limits"). Fixed here by checking the cap at issue time, not redemption
 * time — a slot is reserved the moment an offer is sent, not just when a
 * trader uses it, so two admins can't both issue the last slot.
 */
export function discountedFee(
  normalFee: Prisma.Decimal,
  discountType: OfferDiscountType,
  discountValue: Prisma.Decimal,
): Prisma.Decimal {
  const zero = new Decimal(0);
  if (discountType === "percent") {
    const fee = normalFee.times(new Decimal(100).minus(discountValue)).dividedBy(100);
    return fee.lessThan(zero) ? zero : fee;
  }
  const fee = normalFee.minus(discountValue);
  return fee.lessThan(zero) ? zero : fee;
}

export async function createCampaign(input: {
  name: string;
  code: string;
  discountType: OfferDiscountType;
  discountValue: number;
  audience: OfferAudience;
  challengeTypeFamilyId: string | null;
  validFrom: Date;
  validTo: Date;
  maxUses: number | null;
  adminId: string;
  ipAddress: string;
}) {
  if (input.validFrom >= input.validTo) {
    throw new ValidationError("Valid-from must be before valid-to.");
  }
  if (input.discountType === "percent" && (input.discountValue <= 0 || input.discountValue > 100)) {
    throw new ValidationError("A percent discount must be between 0 and 100.");
  }
  if (input.discountType === "fixed" && input.discountValue <= 0) {
    throw new ValidationError("A fixed discount must be greater than zero.");
  }

  const existing = await db.offerCampaign.findUnique({ where: { code: input.code } });
  if (existing) throw new ValidationError("That code is already in use by another campaign.");

  const campaign = await db.offerCampaign.create({
    data: {
      name: input.name,
      code: input.code,
      discountType: input.discountType,
      discountValue: input.discountValue,
      audience: input.audience,
      challengeTypeFamilyId: input.challengeTypeFamilyId,
      validFrom: input.validFrom,
      validTo: input.validTo,
      maxUses: input.maxUses,
      createdById: input.adminId,
    },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "offer_campaign.created",
    entityType: "OfferCampaign",
    entityId: campaign.id,
    after: { name: campaign.name, code: campaign.code },
    ipAddress: input.ipAddress,
  });

  return campaign;
}

export async function setCampaignActive(input: {
  campaignId: string;
  active: boolean;
  adminId: string;
  ipAddress: string;
}) {
  const updated = await db.offerCampaign.update({
    where: { id: input.campaignId },
    data: { active: input.active },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: input.active ? "offer_campaign.activated" : "offer_campaign.closed",
    entityType: "OfferCampaign",
    entityId: input.campaignId,
    after: { active: updated.active },
    ipAddress: input.ipAddress,
  });

  return updated;
}

export async function listCampaigns() {
  return db.offerCampaign.findMany({
    include: { issuedOffers: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Breached traders (per Account.status, set by the 3.4 automation) with no currently-outstanding offer — the re-purchase opportunity spec §7 and the prototype both describe. */
export async function getEligibleBreachedTraders() {
  const breachedAccounts = await db.account.findMany({
    where: { status: "breached", voidedAt: null },
    include: { person: true, challengeType: true },
    orderBy: { updatedAt: "desc" },
  });

  const outstanding = await db.issuedOffer.findMany({
    where: { status: "sent" },
    select: { personId: true },
  });
  const hasOutstanding = new Set(outstanding.map((o) => o.personId));

  const seen = new Set<string>();
  const eligible: typeof breachedAccounts = [];
  for (const acct of breachedAccounts) {
    if (hasOutstanding.has(acct.personId) || seen.has(acct.personId)) continue;
    seen.add(acct.personId);
    eligible.push(acct);
  }
  return eligible;
}

/**
 * Reserves a slot against maxUses (sent + redeemed both count; withdrawn
 * frees it) before creating the row — the actual fix for the "no
 * server-side redemption limit" gap. Freezes normalFee/offerFee at issue
 * time so later campaign edits never change an offer already sent.
 */
export async function issueOffer(input: {
  personId: string;
  campaignId: string;
  challengeTypeId: string;
  adminId: string;
  ipAddress: string;
}) {
  const campaign = await db.offerCampaign.findUniqueOrThrow({ where: { id: input.campaignId } });
  const now = new Date();

  if (!campaign.active) throw new ValidationError("This campaign is closed.");
  if (now < campaign.validFrom || now > campaign.validTo) {
    throw new ValidationError("This campaign is outside its valid dates.");
  }

  const person = await db.person.findUniqueOrThrow({ where: { id: input.personId } });
  const existingSent = await db.issuedOffer.findFirst({
    where: { personId: input.personId, status: "sent" },
  });
  if (existingSent) throw new ValidationError("This trader already has an outstanding offer.");

  if (campaign.maxUses !== null) {
    const used = await db.issuedOffer.count({
      where: { campaignId: campaign.id, status: { in: ["sent", "redeemed"] } },
    });
    if (used >= campaign.maxUses) {
      throw new ValidationError("This campaign has reached its maximum number of uses.");
    }
  }

  const challengeType = await db.challengeType.findUniqueOrThrow({ where: { id: input.challengeTypeId } });
  if (campaign.challengeTypeFamilyId && campaign.challengeTypeFamilyId !== challengeType.familyId) {
    throw new ValidationError("This campaign doesn't apply to that challenge type.");
  }

  const offerFee = discountedFee(challengeType.fee, campaign.discountType, campaign.discountValue);

  const issued = await db.issuedOffer.create({
    data: {
      campaignId: campaign.id,
      personId: input.personId,
      challengeTypeId: challengeType.id,
      normalFee: challengeType.fee,
      offerFee,
      expiresAt: campaign.validTo,
      issuedById: input.adminId,
    },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "offer.issued",
    entityType: "IssuedOffer",
    entityId: issued.id,
    after: { personId: input.personId, campaignId: campaign.id, offerFee: offerFee.toString() },
    ipAddress: input.ipAddress,
  });

  if (person.marketingConsent) {
    await notifyTrader({
      personId: input.personId,
      type: "offer_received",
      title: "You have a new offer",
      body: `${campaign.name}: ${challengeType.name} for ${offerFee.toString()} ${challengeType.currency} (normally ${challengeType.fee.toString()}). Code ${campaign.code}, valid until ${campaign.validTo.toLocaleDateString()}.`,
      link: "/portal",
    });
  }

  return { issued, notified: person.marketingConsent };
}

export async function withdrawOffer(input: {
  issuedOfferId: string;
  reason: string;
  adminId: string;
  ipAddress: string;
}) {
  if (input.reason.trim().length < 4) {
    throw new ValidationError("A reason is required to withdraw an offer.");
  }
  const offer = await db.issuedOffer.findUniqueOrThrow({ where: { id: input.issuedOfferId } });
  if (offer.status !== "sent") {
    throw new ValidationError("Only an outstanding offer can be withdrawn.");
  }

  const updated = await db.issuedOffer.update({
    where: { id: input.issuedOfferId },
    data: { status: "withdrawn", withdrawnReason: input.reason },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "offer.withdrawn",
    entityType: "IssuedOffer",
    entityId: offer.id,
    reason: input.reason,
    ipAddress: input.ipAddress,
  });

  return updated;
}

export async function listIssuedOffers() {
  return db.issuedOffer.findMany({
    include: { person: true, campaign: true, challengeType: true },
    orderBy: { issuedAt: "desc" },
  });
}

/**
 * Called from orders.ts at order-intake time. Looks up a still-outstanding
 * offer for this person + code and marks it redeemed against the real
 * order — the actual server-side enforcement that a given issued offer
 * can only ever be used once. Never throws: checkout has already taken
 * payment by the time an order reaches this system (spec §8.1), so an
 * unresolvable code is recorded for admin review rather than failing an
 * order that was already paid for.
 */
export async function tryRedeemOffer(input: {
  personId: string;
  offerCode: string;
  orderRef: string;
  ipAddress: string;
}): Promise<{ redeemed: boolean; issuedOfferId: string | null }> {
  const code = input.offerCode.trim();
  const now = new Date();

  const offer = await db.issuedOffer.findFirst({
    where: {
      personId: input.personId,
      status: "sent",
      expiresAt: { gte: now },
      campaign: { code },
    },
  });

  if (!offer) {
    await writeAuditLog({
      actorType: "system",
      actorId: null,
      action: "offer.redemption_unresolved",
      entityType: "Person",
      entityId: input.personId,
      after: { offerCode: code, orderRef: input.orderRef },
      reason: `Order ${input.orderRef} supplied offer code "${code}" but no matching outstanding offer was found for this trader.`,
      ipAddress: input.ipAddress,
    });
    return { redeemed: false, issuedOfferId: null };
  }

  await db.issuedOffer.update({
    where: { id: offer.id },
    data: { status: "redeemed", redeemedAt: now, redeemedOrderRef: input.orderRef },
  });

  await writeAuditLog({
    actorType: "system",
    actorId: null,
    action: "offer.redeemed",
    entityType: "IssuedOffer",
    entityId: offer.id,
    after: { orderRef: input.orderRef },
    ipAddress: input.ipAddress,
  });

  return { redeemed: true, issuedOfferId: offer.id };
}
