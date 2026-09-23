import { randomBytes, createHash } from "node:crypto";

/** Opaque random token for session IDs, email links, etc. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Session/reset/verification tokens are stored as this hash, never in
 * plaintext, so a database read alone can't be used to impersonate a
 * session or replay a reset link.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
