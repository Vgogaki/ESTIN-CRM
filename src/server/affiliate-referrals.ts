import type { AffiliateCode, Affiliate, ReferralSource } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";
import { lockAffiliate } from "@/server/row-lock";
import {
  decideReferral,
  firstName,
  generateReferralCode,
  maskEmail,
  normalizeCode,
  referralStage,
  type ReferralStage,
} from "@/server/affiliate-code";

/**
 * Referral codes and "who introduced whom" (module 7.4).
 *
 * Rules, as decided by the founder:
 *  - Nobody types a referral code. The affiliate presses Generate and the
 *    system makes it; the back office shows who generated it and when. A code
 *    that is not in this register is ignored everywhere.
 *  - An affiliate may record a person they are introducing. ESTIN does not
 *    contact that person; the match happens when that email registers or buys.
 *  - A trader has one introducer, and the first one wins.
 *  - Commission is unchanged: only on an order that carries the affiliate's
 *    own code (affiliates.ts, recordCommissionForOrder).
 */

const isUniqueViolation = (err: unknown) => err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002";

/** At most this many people can be recorded by one affiliate in 24 hours: stops bulk uploading of someone else's contact list. */
export const MAX_RECORDED_PER_DAY = 100;

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

export type CodeLookup =
  | { kind: "ok"; code: AffiliateCode; affiliate: Affiliate }
  | { kind: "unknown" }
  | { kind: "revoked" }
  | { kind: "suspended"; affiliate: Affiliate };

/** Resolves whatever text came in (a typed code, a link parameter, a checkout field) against the register. */
export async function resolveCode(raw: string | null | undefined): Promise<CodeLookup> {
  if (!raw) return { kind: "unknown" };
  let normalized: string;
  try {
    normalized = normalizeCode(raw);
  } catch {
    return { kind: "unknown" };
  }
  const row = await db.affiliateCode.findUnique({ where: { code: normalized }, include: { affiliate: true } });
  if (!row) return { kind: "unknown" };
  if (row.revokedAt) return { kind: "revoked" };
  if (row.affiliate.status !== "active") return { kind: "suspended", affiliate: row.affiliate };
  const { affiliate, ...code } = row;
  return { kind: "ok", code, affiliate };
}

/**
 * The affiliate asks for their code. One active code each: a second click, or
 * a second browser tab, gets "you already have one" and never a second code.
 */
export async function generateAffiliateCode(input: { affiliateId: string; ipAddress: string }): Promise<AffiliateCode> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        await lockAffiliate(tx, input.affiliateId);

        const affiliate = await tx.affiliate.findUniqueOrThrow({ where: { id: input.affiliateId }, select: { status: true } });
        if (affiliate.status !== "active") {
          throw new ValidationError("Your affiliate account is suspended, so a code can't be generated. Contact ESTIN.", 403);
        }
        const existing = await tx.affiliateCode.findFirst({ where: { affiliateId: input.affiliateId, revokedAt: null } });
        if (existing) throw new ValidationError("You already have a referral code.", 409);

        const created = await tx.affiliateCode.create({
          data: { affiliateId: input.affiliateId, code: generateReferralCode(), origin: "generated" },
        });
        await writeAuditLog(
          {
            actorType: "affiliate",
            actorId: input.affiliateId,
            action: "affiliate.code_generated",
            entityType: "Affiliate",
            entityId: input.affiliateId,
            after: { code: created.code, codeId: created.id },
            ipAddress: input.ipAddress,
          },
          tx,
        );
        return created;
      });
    } catch (err) {
      // Under the affiliate lock the only unique clash possible is the random code itself: draw another.
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }
  throw new ValidationError("Could not generate a code just now. Please try again.", 503);
}

/** Staff deactivate a code. It stays on record (so it can never be issued again); the affiliate can then generate a replacement. */
export async function revokeAffiliateCode(input: { codeId: string; reason: string; adminId: string; ipAddress: string }) {
  const reason = input.reason.trim();
  if (reason.length < 4) throw new ValidationError("Say why this code is being deactivated.");

  const code = await db.affiliateCode.findUnique({ where: { id: input.codeId } });
  if (!code) throw new ValidationError("Code not found.", 404);

  await db.$transaction(async (tx) => {
    await lockAffiliate(tx, code.affiliateId);
    const changed = await tx.affiliateCode.updateMany({
      where: { id: code.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: input.adminId, revokeReason: reason },
    });
    if (changed.count === 0) throw new ValidationError("This code is already deactivated.", 409);
    await writeAuditLog(
      {
        actorType: "admin",
        actorId: input.adminId,
        action: "affiliate.code_revoked",
        entityType: "Affiliate",
        entityId: code.affiliateId,
        before: { code: code.code, active: true },
        after: { code: code.code, active: false },
        reason,
        ipAddress: input.ipAddress,
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Introduced traders
// ---------------------------------------------------------------------------

/**
 * The affiliate records someone they are introducing.
 *
 * Deliberately gives nothing away about ESTIN's customers: it does not check
 * whether the email already belongs to a trader and answers the same way
 * either way. A person who already exists simply never matches (a match needs
 * the person to be created AFTER the introduction), so the affiliate can't use
 * this form to find out who is a customer.
 */
export async function recordIntroducedPerson(input: { affiliateId: string; name: string; email: string; ipAddress: string }) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || name.length > 100) throw new ValidationError("Enter the person's name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new ValidationError("Enter a valid email address.");

  const affiliate = await db.affiliate.findUnique({ where: { id: input.affiliateId } });
  if (!affiliate) throw new ValidationError("Affiliate not found.", 404);
  if (affiliate.status !== "active") throw new ValidationError("Your affiliate account is suspended. Contact ESTIN.", 403);
  if (email === affiliate.email.trim().toLowerCase()) throw new ValidationError("That is your own email address.");

  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const recent = await db.affiliateReferral.count({ where: { affiliateId: affiliate.id, source: "recorded_by_affiliate", createdAt: { gte: since } } });
  if (recent >= MAX_RECORDED_PER_DAY) throw new ValidationError("You have added a lot of people today. Please try again tomorrow.", 429);

  try {
    const referral = await db.affiliateReferral.create({
      data: { affiliateId: affiliate.id, email, nameGiven: name, source: "recorded_by_affiliate" },
    });
    await writeAuditLog({
      actorType: "affiliate",
      actorId: affiliate.id,
      action: "affiliate.referral_recorded",
      entityType: "Affiliate",
      entityId: affiliate.id,
      after: { referralId: referral.id },
      ipAddress: input.ipAddress,
    });
    return referral;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ValidationError("You have already added this person.", 409);
    throw err;
  }
}

type Outcome = "created" | "same_affiliate" | "other_affiliate" | "self";

/**
 * Links a person to the affiliate whose code they used, unless they already
 * have an introducer (first wins) or it is the affiliate themselves.
 * Safe to call repeatedly and concurrently (personId is unique).
 */
export async function ensureReferral(input: {
  person: { id: string; email: string };
  affiliate: Affiliate;
  codeId: string | null;
  source: ReferralSource;
  ipAddress: string;
}): Promise<Outcome> {
  const personEmail = input.person.email.trim().toLowerCase();
  const existing = await db.affiliateReferral.findUnique({ where: { personId: input.person.id } });
  const isSelf = input.affiliate.personId === input.person.id || input.affiliate.email.trim().toLowerCase() === personEmail;

  const decision = decideReferral({ existingAffiliateId: existing?.affiliateId ?? null, candidateAffiliateId: input.affiliate.id, isSelf });
  if (decision.action === "keep") return "same_affiliate";
  if (decision.action === "ignore") {
    await writeAuditLog({
      actorType: "system",
      actorId: null,
      action: "affiliate.referral_ignored",
      entityType: "Person",
      entityId: input.person.id,
      reason: decision.reason,
      after: { affiliateId: input.affiliate.id },
      ipAddress: input.ipAddress,
    });
    return isSelf ? "self" : "other_affiliate";
  }

  try {
    // The affiliate may already have recorded this email before the person existed: reuse that row.
    const lead = await db.affiliateReferral.findUnique({ where: { affiliateId_email: { affiliateId: input.affiliate.id, email: personEmail } } });
    if (lead) {
      await db.affiliateReferral.update({ where: { id: lead.id }, data: { personId: input.person.id, matchedAt: new Date(), codeId: input.codeId ?? lead.codeId } });
    } else {
      await db.affiliateReferral.create({
        data: {
          affiliateId: input.affiliate.id,
          email: personEmail,
          source: input.source,
          codeId: input.codeId,
          personId: input.person.id,
          matchedAt: new Date(),
        },
      });
    }
  } catch (err) {
    if (isUniqueViolation(err)) return "other_affiliate"; // someone else linked them in the same instant: first wins
    throw err;
  }
  await writeAuditLog({
    actorType: "system",
    actorId: null,
    action: "affiliate.referral_linked",
    entityType: "Person",
    entityId: input.person.id,
    after: { affiliateId: input.affiliate.id, source: input.source },
    ipAddress: input.ipAddress,
  });
  return "created";
}

/**
 * Runs once, when a person is first created (registration or first order).
 * 1. If an affiliate recorded this email BEFORE the person existed, the
 *    earliest such affiliate is the introducer, whatever code was used.
 * 2. Otherwise, a valid code introduces them.
 * Never throws: an affiliate problem must not stop someone registering or buying.
 */
export async function attributeNewPerson(input: {
  person: { id: string; email: string; createdAt: Date };
  referralCode?: string | null;
  source: Extract<ReferralSource, "registration_code" | "order_code">;
  ipAddress: string;
}): Promise<void> {
  try {
    const email = input.person.email.trim().toLowerCase();
    const resolved = input.referralCode ? await resolveCode(input.referralCode) : null;

    const lead = await db.affiliateReferral.findFirst({
      where: { email, personId: null, source: "recorded_by_affiliate", createdAt: { lte: input.person.createdAt } },
      orderBy: { createdAt: "asc" },
      include: { affiliate: true },
    });

    if (lead) {
      try {
        await db.affiliateReferral.update({ where: { id: lead.id }, data: { personId: input.person.id, matchedAt: new Date() } });
      } catch (err) {
        if (isUniqueViolation(err)) return; // already linked in the same instant
        throw err;
      }
      await writeAuditLog({
        actorType: "system",
        actorId: null,
        action: "affiliate.referral_linked",
        entityType: "Person",
        entityId: input.person.id,
        after: { affiliateId: lead.affiliateId, source: "recorded_by_affiliate" },
        ipAddress: input.ipAddress,
      });
      if (resolved?.kind === "ok" && resolved.affiliate.id !== lead.affiliateId) {
        await writeAuditLog({
          actorType: "system",
          actorId: null,
          action: "affiliate.referral_ignored",
          entityType: "Person",
          entityId: input.person.id,
          reason: "This trader was already introduced by another affiliate.",
          after: { affiliateId: resolved.affiliate.id },
          ipAddress: input.ipAddress,
        });
      }
      return;
    }

    if (!input.referralCode) return;
    if (resolved?.kind === "ok") {
      await ensureReferral({ person: input.person, affiliate: resolved.affiliate, codeId: resolved.code.id, source: input.source, ipAddress: input.ipAddress });
    } else {
      await writeAuditLog({
        actorType: "system",
        actorId: null,
        action: "affiliate.code_ignored",
        entityType: "Person",
        entityId: input.person.id,
        reason: resolved?.kind === "revoked" ? "Code has been deactivated." : resolved?.kind === "suspended" ? "Affiliate is suspended." : "Unknown referral code.",
        after: { referralCode: input.referralCode.slice(0, 64) },
        ipAddress: input.ipAddress,
      });
    }
  } catch (err) {
    console.error("[affiliates] could not attribute person", err);
  }
}

// ---------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------

type ReferralRow = Awaited<ReturnType<typeof loadReferrals>>[number];

async function loadReferrals(affiliateId: string) {
  return db.affiliateReferral.findMany({
    where: { affiliateId },
    include: {
      code: { select: { code: true } },
      person: {
        select: {
          id: true,
          fullName: true,
          email: true,
          accounts: { where: { voidedAt: null }, select: { phase: true } },
          payments: { where: { status: "succeeded" }, select: { id: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

function stageOf(r: ReferralRow): ReferralStage {
  return referralStage({
    signedUp: r.person !== null,
    purchased: (r.person?.payments.length ?? 0) > 0,
    funded: r.person?.accounts.some((a) => a.phase === "funded") ?? false,
  });
}

function funnel(rows: { stage: ReferralStage }[]) {
  const count = (pred: (s: ReferralStage) => boolean) => rows.filter((r) => pred(r.stage)).length;
  return {
    introduced: rows.length,
    registered: count((s) => s !== "not_signed_up"),
    purchased: count((s) => s === "purchased" || s === "funded"),
    funded: count((s) => s === "funded"),
  };
}

/** What the affiliate sees: first name, masked email, stage. Nothing else about the person. */
export async function listIntroducedForAffiliate(affiliateId: string) {
  const rows = (await loadReferrals(affiliateId)).map((r) => ({
    id: r.id,
    name: firstName(r.person?.fullName ?? r.nameGiven),
    maskedEmail: maskEmail(r.person?.email ?? r.email),
    stage: stageOf(r),
    introducedAt: r.createdAt,
  }));
  return { rows, funnel: funnel(rows) };
}

/** What staff see: the full record, linked to the trader's page. */
export async function listIntroducedForStaff(affiliateId: string) {
  const rows = (await loadReferrals(affiliateId)).map((r) => ({
    id: r.id,
    name: r.person?.fullName ?? r.nameGiven ?? "—",
    email: r.person?.email ?? r.email,
    personId: r.person?.id ?? null,
    stage: stageOf(r),
    source: r.source,
    codeUsed: r.code?.code ?? null,
    introducedAt: r.createdAt,
    matchedAt: r.matchedAt,
  }));
  return { rows, funnel: funnel(rows) };
}

export async function listCodesForAffiliate(affiliateId: string) {
  return db.affiliateCode.findMany({ where: { affiliateId }, orderBy: { createdAt: "desc" } });
}
