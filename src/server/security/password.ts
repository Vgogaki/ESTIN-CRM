import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Minimum bar for V1. Not a full strength meter — just blocks the obviously
 * weak cases. Enforced on registration and password reset.
 */
export function isPasswordAcceptable(plaintext: string): boolean {
  return plaintext.length >= 10;
}
