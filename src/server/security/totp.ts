import { generateSecret, generateURI, verify } from "otplib";

/** Generates a new base32 TOTP secret for enrollment. Store it encrypted. */
export function generateTotpSecret(): string {
  return generateSecret();
}

export function totpEnrollmentUri(secret: string, accountEmail: string): string {
  return generateURI({ issuer: "ESTIN CRM", label: accountEmail, secret });
}

/**
 * Codes change every 30 seconds. Accepting the step before and the step after
 * is the standard allowance (RFC 6238) for a phone clock that's a few seconds
 * off, or a code typed just as it rolls over; without it a correct code is
 * sometimes refused. Anything older or newer than that is rejected.
 */
const CLOCK_DRIFT_TOLERANCE_SECONDS = 30;

export async function verifyTotpToken(token: string, secret: string, nowSeconds?: number): Promise<boolean> {
  try {
    const result = await verify({
      secret,
      token,
      epochTolerance: CLOCK_DRIFT_TOLERANCE_SECONDS,
      ...(nowSeconds !== undefined ? { epoch: nowSeconds } : {}),
    });
    return result.valid;
  } catch {
    return false;
  }
}
