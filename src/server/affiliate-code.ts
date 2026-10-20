import { randomInt } from "node:crypto";
import { ValidationError } from "@/server/errors";

/**
 * Pure helpers for referral codes and introduced traders (no database), so
 * they can be tested like the rules engine. The database side is
 * affiliate-referrals.ts.
 */

/** Accepts any code already in circulation (3-32 letters, numbers, - or _), uppercased. Used to LOOK UP a code; codes are never typed in to create one. */
export function normalizeCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    throw new ValidationError("A code is 3 to 32 letters, numbers, dashes or underscores.");
  }
  return code;
}

// No I, O, 0 or 1: nobody mistakes one for another when reading a code aloud or off a screen.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const GENERATED_CODE_PREFIX = "EST-";
const GENERATED_CODE_LENGTH = 8;

/**
 * A random code like EST-7K4Q2M9X: 8 characters from a 32-letter alphabet is
 * about 10^12 possibilities, so codes can't be guessed or run through in order.
 * `pick` is injectable for tests; the default is the operating system's
 * cryptographic randomness, unbiased.
 */
export function generateReferralCode(pick: (maxExclusive: number) => number = (n) => randomInt(n)): string {
  let out = "";
  for (let i = 0; i < GENERATED_CODE_LENGTH; i++) out += CODE_ALPHABET[pick(CODE_ALPHABET.length)];
  return GENERATED_CODE_PREFIX + out;
}

/** The link an affiliate shares: the trader portal's sign-up page with their code filled in. */
export function referralLink(baseUrl: string, code: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/portal/register?ref=${encodeURIComponent(code)}`;
}

/** "alex.smith@gmail.com" -> "a***@gmail.com". The affiliate sees enough to recognise their own contact, not enough to contact a stranger. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/** First word of a name; what an affiliate is allowed to see. */
export function firstName(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first || "—";
}

export type ReferralStage = "not_signed_up" | "registered" | "purchased" | "funded";

/**
 * How far an introduced person has got. Deliberately only these four steps:
 * an affiliate learns nothing about trading results, KYC or payouts.
 */
export function referralStage(input: { signedUp: boolean; purchased: boolean; funded: boolean }): ReferralStage {
  if (!input.signedUp) return "not_signed_up";
  if (input.funded) return "funded";
  if (input.purchased) return "purchased";
  return "registered";
}

export const STAGE_LABEL: Record<ReferralStage, string> = {
  not_signed_up: "Not signed up yet",
  registered: "Registered",
  purchased: "Bought a challenge",
  funded: "Funded",
};

export type ReferralDecision =
  | { action: "create" }
  | { action: "keep" }
  | { action: "ignore"; reason: string };

/**
 * One introducer per trader, and the first one wins. `existingAffiliateId` is
 * whoever already introduced this person (null if nobody has).
 */
export function decideReferral(input: {
  existingAffiliateId: string | null;
  candidateAffiliateId: string;
  isSelf: boolean;
}): ReferralDecision {
  if (input.isSelf) return { action: "ignore", reason: "The affiliate cannot introduce themselves." };
  if (input.existingAffiliateId === null) return { action: "create" };
  if (input.existingAffiliateId === input.candidateAffiliateId) return { action: "keep" };
  return { action: "ignore", reason: "This trader was already introduced by another affiliate." };
}
