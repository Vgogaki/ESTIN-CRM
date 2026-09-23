import { generateSecret, generateURI, verify } from "otplib";

/** Generates a new base32 TOTP secret for enrollment. Store it encrypted. */
export function generateTotpSecret(): string {
  return generateSecret();
}

export function totpEnrollmentUri(secret: string, accountEmail: string): string {
  return generateURI({ issuer: "ESTIN CRM", label: accountEmail, secret });
}

export async function verifyTotpToken(token: string, secret: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token });
    return result.valid;
  } catch {
    return false;
  }
}
