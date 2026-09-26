import type { CountryAction, CountryStage } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";

/**
 * Module 6.3 — restricted-country controls (modules-to-design.md §6.1–6.5).
 * Per country, an allowed / review / blocked action for each of four stages.
 * What is checked today: the country a trader declared at registration or
 * on the order (which is also their billing country — orders carry one).
 * NOT built, and flagged rather than faked: IP geolocation (needs a
 * geolocation provider) and a separate KYC-document country (KYC captures
 * documents, not a structured country). Trading-stage rules are stored
 * but unenforceable until there is a trading platform (3.3).
 */
export function normalizeCountry(code: string): string {
  return code.trim().toUpperCase();
}

/** Pure: a country with no rule is allowed everywhere — no default list is shipped (decisions.md #11). */
export function resolveAction(
  rule: Partial<Record<CountryStage, CountryAction>> | null,
  stage: CountryStage,
): CountryAction {
  return rule?.[stage] ?? "allowed";
}

export async function getAction(countryCode: string, stage: CountryStage): Promise<CountryAction> {
  const rule = await db.countryRule.findUnique({ where: { countryCode: normalizeCountry(countryCode) } });
  return resolveAction(rule, stage);
}

/**
 * Blocked -> throws (and audits the refusal). Review -> returns "review"
 * so the caller can open a review once it has a person to attach it to.
 */
export async function enforceCountry(input: {
  countryCode: string;
  stage: CountryStage;
  ipAddress: string;
  personId?: string;
}): Promise<CountryAction> {
  const code = normalizeCountry(input.countryCode);
  const action = await getAction(code, input.stage);

  if (action === "blocked") {
    await writeAuditLog({
      actorType: "system",
      actorId: null,
      action: "country.blocked",
      entityType: input.personId ? "Person" : "Country",
      entityId: input.personId ?? code,
      after: { countryCode: code, stage: input.stage },
      reason: `Country ${code} is blocked for ${input.stage}.`,
      ipAddress: input.ipAddress,
    });
    throw new ValidationError(
      `We're unable to offer this service in your country (${code}).`,
      403,
    );
  }
  return action;
}

/** Opens a review unless one is already open for this person + stage. */
export async function openReview(input: { personId: string; stage: CountryStage; countryCode: string }) {
  const existing = await db.countryReview.findFirst({
    where: { personId: input.personId, stage: input.stage, status: "open" },
  });
  if (existing) return existing;

  const review = await db.countryReview.create({
    data: { personId: input.personId, stage: input.stage, countryCode: normalizeCountry(input.countryCode) },
  });
  await writeAuditLog({
    actorType: "system",
    actorId: null,
    action: "country.review_opened",
    entityType: "Person",
    entityId: input.personId,
    after: { stage: input.stage, countryCode: review.countryCode },
    reason: `Country ${review.countryCode} is set to review for ${input.stage}.`,
  });
  return review;
}

/** Payout approval is held while a payout-stage review is open (server-side, like the identity-mismatch gate). */
export async function hasOpenPayoutReview(personId: string): Promise<boolean> {
  const open = await db.countryReview.findFirst({
    where: { personId, stage: "payout", status: "open" },
  });
  return open !== null;
}

export async function upsertRule(input: {
  countryCode: string;
  registration: CountryAction;
  purchase: CountryAction;
  trading: CountryAction;
  payout: CountryAction;
  note: string | null;
  adminId: string;
  ipAddress: string;
}) {
  const code = normalizeCountry(input.countryCode);
  if (!/^[A-Z]{2}$/.test(code)) throw new ValidationError("A country is a 2-letter code, e.g. CY.");

  const before = await db.countryRule.findUnique({ where: { countryCode: code } });
  const data = {
    registration: input.registration,
    purchase: input.purchase,
    trading: input.trading,
    payout: input.payout,
    note: input.note,
    updatedById: input.adminId,
  };
  const rule = await db.countryRule.upsert({
    where: { countryCode: code },
    update: data,
    create: { countryCode: code, ...data },
  });

  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: before ? "country_rule.updated" : "country_rule.created",
    entityType: "CountryRule",
    entityId: rule.id,
    before: before
      ? { registration: before.registration, purchase: before.purchase, trading: before.trading, payout: before.payout }
      : null,
    after: { countryCode: code, registration: rule.registration, purchase: rule.purchase, trading: rule.trading, payout: rule.payout },
    reason: input.note,
    ipAddress: input.ipAddress,
  });
  return rule;
}

export async function listRules() {
  return db.countryRule.findMany({ orderBy: { countryCode: "asc" } });
}

export async function listOpenReviews() {
  return db.countryReview.findMany({
    where: { status: "open" },
    include: { person: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function clearReview(input: { reviewId: string; note: string; adminId: string; ipAddress: string }) {
  if (input.note.trim().length < 4) throw new ValidationError("A note is required to clear a review.");
  const review = await db.countryReview.findUniqueOrThrow({ where: { id: input.reviewId } });
  if (review.status !== "open") throw new ValidationError("This review is already cleared.");

  const updated = await db.countryReview.update({
    where: { id: input.reviewId },
    data: { status: "cleared", resolvedAt: new Date(), resolvedById: input.adminId, resolutionNote: input.note.trim() },
  });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "country.review_cleared",
    entityType: "Person",
    entityId: review.personId,
    after: { stage: review.stage, countryCode: review.countryCode },
    reason: input.note,
    ipAddress: input.ipAddress,
  });
  return updated;
}

/**
 * Removing a country from the list. A rule is configuration, not a business
 * record, so it can be deleted — but never silently: the audit entry keeps
 * the rule's full previous settings. Open reviews already raised under the
 * rule are left alone (they belong to the person; clear them separately).
 */
export async function deleteRule(input: { countryCode: string; adminId: string; ipAddress: string }) {
  const code = normalizeCountry(input.countryCode);
  const rule = await db.countryRule.findUnique({ where: { countryCode: code } });
  if (!rule) throw new ValidationError("That country isn't on the list.", 404);

  await db.countryRule.delete({ where: { countryCode: code } });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "country_rule.deleted",
    entityType: "CountryRule",
    entityId: rule.id,
    before: {
      countryCode: code,
      registration: rule.registration,
      purchase: rule.purchase,
      trading: rule.trading,
      payout: rule.payout,
      note: rule.note,
    },
    reason: "Removed from the restricted-country list; the country is allowed everywhere again.",
    ipAddress: input.ipAddress,
  });
}
