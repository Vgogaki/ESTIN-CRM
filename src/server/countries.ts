import type { CountryAction, CountryStage } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";
import { parseCountryCsv, type CountryCsvError } from "@/server/country-import";

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
export type ImportRowPreview = {
  countryCode: string;
  row: number;
  isNew: boolean;
  before: { registration: CountryAction; purchase: CountryAction; trading: CountryAction; payout: CountryAction } | null;
  after: { registration: CountryAction; purchase: CountryAction; trading: CountryAction; payout: CountryAction; note: string | null };
};

/** Read-only: parses the file and shows exactly what applying it would change. Never touches the database. */
export async function previewCountryImport(csvText: string): Promise<{ fatalError: string | null; changes: ImportRowPreview[]; errors: CountryCsvError[] }> {
  const parsed = parseCountryCsv(csvText);
  if (parsed.fatalError || parsed.valid.length === 0) {
    return { fatalError: parsed.fatalError, changes: [], errors: parsed.errors };
  }

  const codes = parsed.valid.map((r) => r.countryCode);
  const existing = await db.countryRule.findMany({ where: { countryCode: { in: codes } } });
  const byCode = new Map(existing.map((r) => [r.countryCode, r]));

  const changes: ImportRowPreview[] = parsed.valid.map((row) => {
    const current = byCode.get(row.countryCode);
    return {
      countryCode: row.countryCode,
      row: row.row,
      isNew: !current,
      before: current ? { registration: current.registration, purchase: current.purchase, trading: current.trading, payout: current.payout } : null,
      after: { registration: row.registration, purchase: row.purchase, trading: row.trading, payout: row.payout, note: row.note },
    };
  });

  return { fatalError: null, changes, errors: parsed.errors };
}

/**
 * Applies the file: one upsertRule() call per valid row, so each country gets
 * the exact same validation and per-row audit entry a manual edit would.
 * Upsert-only — a country left out of the file is never touched, let alone
 * removed. Also writes one summary audit entry for the import itself, so
 * staff can tell a bulk upload apart from a string of manual edits later.
 */
export async function applyCountryImport(input: {
  csvText: string;
  adminId: string;
  ipAddress: string;
}): Promise<{ fatalError: string | null; applied: number; errors: CountryCsvError[] }> {
  const parsed = parseCountryCsv(input.csvText);
  if (parsed.fatalError) return { fatalError: parsed.fatalError, applied: 0, errors: parsed.errors };

  for (const row of parsed.valid) {
    await upsertRule({
      countryCode: row.countryCode,
      registration: row.registration,
      purchase: row.purchase,
      trading: row.trading,
      payout: row.payout,
      note: row.note,
      adminId: input.adminId,
      ipAddress: input.ipAddress,
    });
  }

  if (parsed.valid.length > 0) {
    await writeAuditLog({
      actorType: "admin",
      actorId: input.adminId,
      action: "country_rules.imported",
      entityType: "CountryRule",
      entityId: "bulk-import",
      after: { count: parsed.valid.length, countryCodes: parsed.valid.map((r) => r.countryCode) },
      reason: parsed.errors.length > 0 ? `${parsed.errors.length} row(s) in the file were skipped — see the per-row errors.` : null,
      ipAddress: input.ipAddress,
    });
  }

  return { fatalError: null, applied: parsed.valid.length, errors: parsed.errors };
}

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
