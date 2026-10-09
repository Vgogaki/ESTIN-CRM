import { randomInt } from "node:crypto";
import { hashToken } from "./tokens";

/**
 * One-time recovery codes for two-factor sign-in: what an admin uses if they
 * lose their authenticator device. Shown once at setup, stored only as hashes
 * (a database read can't reveal a usable code), each usable a single time.
 *
 * 10 characters from a 32-letter alphabet (no I, O, 0 or 1, which are easy to
 * misread when copying from paper) is 50 bits of randomness: unguessable
 * online, and long enough that a fast hash is fine for storage.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
export const RECOVERY_CODE_COUNT = 10;

/** "ABCDE-FGHJK": grouped so it's easy to read and type. */
export function generateRecoveryCode(): string {
  let raw = "";
  for (let i = 0; i < CODE_LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateRecoveryCode());
  return [...codes];
}

/** Accepts what a person might type (lowercase, spaces, with or without the dash). Null if it can't be a recovery code. */
export function normalizeRecoveryCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-HJ-NP-Z2-9]{10}$/.test(cleaned) ? cleaned : null;
}

export function hashRecoveryCode(normalized: string): string {
  return hashToken(`recovery-code:${normalized}`);
}

/** A 6-digit authenticator code, as opposed to a recovery code. */
export function looksLikeTotp(input: string): boolean {
  return /^\d{6}$/.test(input.trim());
}
