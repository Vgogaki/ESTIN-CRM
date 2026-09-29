import { Prisma, type CommissionStatus } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";
import { issueAffiliateInvite } from "@/server/auth/affiliate";
import { notifyTrader } from "@/server/notifications";

/**
 * Module 7.4 — affiliates. Whether affiliates are in V1 at all, and the
 * commission model, are open decision #7. So nothing about money is assumed:
 * every affiliate gets an explicit commission percentage chosen by staff (no
 * default), commissions are only ever a percentage of what the buyer actually
 * paid, and nothing is paid automatically. A person approves each commission,
 * and marks it paid only after sending the money themselves and entering the
 * reference (payout rails, decision #6, are not chosen).
 */

// ---------------------------------------------------------------------------
// Pure logic (unit-tested)
// ---------------------------------------------------------------------------

export function normalizeCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    throw new ValidationError("A code is 3 to 32 letters, numbers, dashes or underscores.");
  }
  return code;
}

/** Percentage of the amount actually paid, rounded to cents (half up). Never floating point. */
export function calculateCommission(baseAmount: Prisma.Decimal, ratePct: Prisma.Decimal): Prisma.Decimal {
  return baseAmount.mul(ratePct).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Signs that an affiliate is being paid for referring themselves (spec 7.4:
 * "watch for self-referral and affiliates buying challenges for referred
 * traders"). A flag doesn't block the order; it holds the commission for review.
 */
export function selfReferralFlag(input: {
  affiliate: { email: string; personId: string | null };
  buyer: { id: string; email: string };
  buyerFingerprint: string | null;
  affiliateFingerprints: ReadonlySet<string>;
}): string | null {
  if (input.affiliate.personId && input.affiliate.personId === input.buyer.id) return "The buyer is the affiliate's own trader profile.";
  if (input.affiliate.email.trim().toLowerCase() === input.buyer.email.trim().toLowerCase()) return "The buyer's email is the affiliate's email.";
  if (input.buyerFingerprint && input.affiliateFingerprints.has(input.buyerFingerprint)) {
    return "The buyer paid with the same payment card or instrument the affiliate has used.";
  }
  return null;
}

export type CommissionAction = "approve" | "pay" | "void";

/** approve: pending -> approved; pay: approved -> paid; void: pending/approved -> voided. Paid is final. */
export function nextCommissionStatus(current: CommissionStatus, action: CommissionAction): CommissionStatus {
  if (action === "approve" && current === "pending") return "approved";
  if (action === "pay" && current === "approved") return "paid";
  if (action === "void" && (current === "pending" || current === "approved")) return "voided";
  throw new ValidationError(`A ${current} commission can't be ${action === "pay" ? "paid" : action === "approve" ? "approved" : "voided"}.`);
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export async function createAffiliate(input: {
  name: string;
  email: string;
  code: string;
  commissionPct: string;
  linkedTraderEmail?: string | null;
  note?: string | null;
  adminId: string;
  ipAddress: string;
}) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email) throw new ValidationError("Name and email are required.");
  const code = normalizeCode(input.code);
  let pct: Prisma.Decimal;
  try {
    pct = new Prisma.Decimal(input.commissionPct);
  } catch {
    throw new ValidationError("Commission must be a number.");
  }
  if (pct.lte(0) || pct.gt(100)) throw new ValidationError("Commission must be more than 0% and at most 100%.");

  let personId: string | null = null;
  if (input.linkedTraderEmail?.trim()) {
    const person = await db.person.findUnique({ where: { email: input.linkedTraderEmail.trim().toLowerCase() } });
    if (!person) throw new ValidationError("No trader has that email. Leave the field empty if the affiliate isn't a trader.");
    personId = person.id;
  }
  if (await db.affiliate.findFirst({ where: { OR: [{ code }, { email }] } })) {
    throw new ValidationError("An affiliate with that code or email already exists.", 409);
  }

  const affiliate = await db.affiliate.create({
    data: { name, email, code, commissionPct: pct, personId, note: input.note?.trim() || null, createdById: input.adminId },
  });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "affiliate.created",
    entityType: "Affiliate",
    entityId: affiliate.id,
    after: { name, code, commissionPct: pct.toString(), linkedTrader: personId !== null },
    ipAddress: input.ipAddress,
  });
  // Never lets a broken mail setup fail creating the affiliate record itself.
  await issueAffiliateInvite(affiliate.id).catch((err) => console.error("[affiliates] could not send invite", err));
  // The affiliate is also a trader: tell them on the trader side too, not just by email to the affiliate portal.
  if (personId) {
    await notifyTrader({
      personId,
      type: "affiliate_added",
      title: "You're now also an ESTIN affiliate",
      body: `You've been set up as an affiliate with referral code ${code}. Sign in to the affiliate portal to see your referrals and commissions.`,
      link: "/affiliate/login",
    }).catch((err) => console.error("[affiliates] could not notify linked trader", err));
  }
  return affiliate;
}

export async function setAffiliateStatus(input: { id: string; status: "active" | "suspended"; adminId: string; ipAddress: string }) {
  const before = await db.affiliate.findUnique({ where: { id: input.id } });
  if (!before) throw new ValidationError("Affiliate not found.", 404);
  await db.affiliate.update({ where: { id: input.id }, data: { status: input.status } });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: input.status === "suspended" ? "affiliate.suspended" : "affiliate.reactivated",
    entityType: "Affiliate",
    entityId: input.id,
    before: { status: before.status },
    after: { status: input.status },
    ipAddress: input.ipAddress,
  });
}

/**
 * Called after an order is created. Idempotent (one commission per payment) and
 * never throws: an affiliate problem must not affect the trader's purchase.
 */
export async function recordCommissionForOrder(input: { orderRef: string; affiliateCode: string | null | undefined; ipAddress: string }) {
  if (!input.affiliateCode) return null;
  try {
    const payment = await db.payment.findUnique({ where: { orderRef: input.orderRef }, include: { person: true } });
    if (!payment) return null;
    const existing = await db.affiliateCommission.findUnique({ where: { paymentId: payment.id } });
    if (existing) return existing;

    let code: string;
    try {
      code = normalizeCode(input.affiliateCode);
    } catch {
      code = "";
    }
    const affiliate = code ? await db.affiliate.findUnique({ where: { code } }) : null;
    if (!affiliate || affiliate.status !== "active") {
      await writeAuditLog({
        actorType: "system",
        actorId: null,
        action: "affiliate.code_ignored",
        entityType: "Payment",
        entityId: payment.id,
        reason: affiliate ? "Affiliate is suspended." : "Unknown affiliate code.",
        after: { affiliateCode: input.affiliateCode },
        ipAddress: input.ipAddress,
      });
      return null;
    }

    const affiliateFingerprints = new Set<string>();
    if (affiliate.personId) {
      const own = await db.payment.findMany({ where: { personId: affiliate.personId, paymentFingerprint: { not: null } }, select: { paymentFingerprint: true } });
      for (const p of own) if (p.paymentFingerprint) affiliateFingerprints.add(p.paymentFingerprint);
    }
    const flag = selfReferralFlag({
      affiliate,
      buyer: { id: payment.person.id, email: payment.person.email },
      buyerFingerprint: payment.paymentFingerprint,
      affiliateFingerprints,
    });

    const commission = await db.affiliateCommission.create({
      data: {
        affiliateId: affiliate.id,
        paymentId: payment.id,
        orderRef: payment.orderRef,
        baseAmount: payment.amountPaid,
        currency: payment.currency,
        ratePct: affiliate.commissionPct,
        amount: calculateCommission(payment.amountPaid, affiliate.commissionPct),
        flag,
      },
    });
    await writeAuditLog({
      actorType: "system",
      actorId: null,
      action: "affiliate.commission_recorded",
      entityType: "AffiliateCommission",
      entityId: commission.id,
      after: { affiliateId: affiliate.id, orderRef: payment.orderRef, amount: commission.amount.toString(), currency: commission.currency, flag },
      ipAddress: input.ipAddress,
    });
    return commission;
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") return null; // concurrent replay
    console.error("[affiliates] could not record commission", err);
    return null;
  }
}

async function loadCommission(id: string) {
  const c = await db.affiliateCommission.findUnique({ where: { id } });
  if (!c) throw new ValidationError("Commission not found.", 404);
  return c;
}

export async function approveCommission(input: { id: string; note?: string | null; adminId: string; ipAddress: string }) {
  const c = await loadCommission(input.id);
  const status = nextCommissionStatus(c.status, "approve");
  // A flagged commission is a suspected self-referral: a person must say why it is fine.
  if (c.flag && !input.note?.trim()) throw new ValidationError("This commission is flagged. Add a note explaining why it is legitimate.");
  await db.affiliateCommission.update({
    where: { id: c.id },
    data: { status, approvedAt: new Date(), approvedById: input.adminId, reviewNote: input.note?.trim() || null },
  });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "affiliate.commission_approved",
    entityType: "AffiliateCommission",
    entityId: c.id,
    before: { status: c.status },
    after: { status },
    reason: input.note?.trim() || null,
    ipAddress: input.ipAddress,
  });
}

/** Records that money was sent OUTSIDE this system. The reference is required so the record can be checked. */
export async function markCommissionPaid(input: { id: string; reference: string; adminId: string; ipAddress: string }) {
  const c = await loadCommission(input.id);
  const status = nextCommissionStatus(c.status, "pay");
  const reference = input.reference.trim();
  if (!reference) throw new ValidationError("Enter the payment reference (bank transfer or transaction id).");
  await db.affiliateCommission.update({
    where: { id: c.id },
    data: { status, paidAt: new Date(), paidById: input.adminId, paymentReference: reference },
  });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "affiliate.commission_paid",
    entityType: "AffiliateCommission",
    entityId: c.id,
    before: { status: c.status },
    after: { status, paymentReference: reference, amount: c.amount.toString(), currency: c.currency },
    ipAddress: input.ipAddress,
  });
}

/** Clawback before payment (a refund, chargeback, or fraud). Once paid it can't be voided here. */
export async function voidCommission(input: { id: string; reason: string; adminId: string; ipAddress: string }) {
  const c = await loadCommission(input.id);
  const status = nextCommissionStatus(c.status, "void");
  if (!input.reason.trim()) throw new ValidationError("Say why this commission is being voided.");
  await db.affiliateCommission.update({
    where: { id: c.id },
    data: { status, voidedAt: new Date(), voidedById: input.adminId, voidReason: input.reason.trim() },
  });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "affiliate.commission_voided",
    entityType: "AffiliateCommission",
    entityId: c.id,
    before: { status: c.status },
    after: { status },
    reason: input.reason.trim(),
    ipAddress: input.ipAddress,
  });
}

export type CurrencyTotals = Record<string, { pending: string; approved: string; paid: string }>;

function totals(commissions: { status: CommissionStatus; amount: Prisma.Decimal; currency: string }[]): CurrencyTotals {
  const out: Record<string, { pending: Prisma.Decimal; approved: Prisma.Decimal; paid: Prisma.Decimal }> = {};
  for (const c of commissions) {
    if (c.status === "voided") continue;
    const t = (out[c.currency] ??= { pending: new Prisma.Decimal(0), approved: new Prisma.Decimal(0), paid: new Prisma.Decimal(0) });
    t[c.status] = t[c.status].plus(c.amount);
  }
  return Object.fromEntries(Object.entries(out).map(([cur, t]) => [cur, { pending: t.pending.toFixed(2), approved: t.approved.toFixed(2), paid: t.paid.toFixed(2) }]));
}

export async function listAffiliates() {
  const rows = await db.affiliate.findMany({ include: { commissions: true }, orderBy: { createdAt: "desc" } });
  return rows.map((a) => ({
    ...a,
    totals: totals(a.commissions),
    flaggedOpen: a.commissions.filter((c) => c.flag && c.status === "pending").length,
    salesCount: a.commissions.filter((c) => c.status !== "voided").length,
  }));
}

export async function getAffiliate(id: string) {
  const a = await db.affiliate.findUnique({ where: { id }, include: { commissions: { orderBy: { createdAt: "desc" } } } });
  return a ? { ...a, totals: totals(a.commissions) } : null;
}

/**
 * The affiliate's own view of their commissions — deliberately narrower than
 * getAffiliate(): no `flag` text or staff `reviewNote`. Those describe our
 * fraud-detection reasoning (e.g. "same payment card as the buyer"), which
 * must not be visible to the person being screened. Void/pay references are
 * shown, since that's the affiliate's own money being explained to them.
 */
export async function getAffiliateSelf(id: string) {
  const a = await db.affiliate.findUnique({ where: { id }, include: { commissions: { orderBy: { createdAt: "desc" } } } });
  if (!a) return null;
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    code: a.code,
    commissionPct: a.commissionPct,
    status: a.status,
    totals: totals(a.commissions),
    commissions: a.commissions.map((c) => ({
      id: c.id,
      orderRef: c.orderRef,
      baseAmount: c.baseAmount,
      ratePct: c.ratePct,
      amount: c.amount,
      currency: c.currency,
      status: c.status,
      createdAt: c.createdAt,
      paidAt: c.paidAt,
      paymentReference: c.paymentReference,
    })),
  };
}
