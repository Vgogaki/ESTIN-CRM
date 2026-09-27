import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { hashPassword, isPasswordAcceptable, verifyPassword } from "@/server/security/password";
import { isLockedOut, recordFailedAttempt, resetLockout } from "@/server/security/lockout";
import { createAffiliateSession, destroyAffiliateSession } from "@/server/security/session";
import { generateOpaqueToken, hashToken } from "@/server/security/tokens";
import { AuthError, LockedOutError } from "./errors";
import { queueEmail } from "@/server/email/outbox";
import { appBaseUrl } from "@/server/email/transport";

/**
 * A separate login for affiliates (module 7.4's portal), independent of the
 * trader login. An affiliate need not be a trader — most referral partners
 * (media buyers, influencers) never buy a challenge — so this can't reuse
 * Person/trader auth. Affiliates are created by staff, not self-registered
 * (the commission rate is a human decision, spec/decisions.md #7), so there
 * is no registerAffiliate(): the flow starts with an invite email instead.
 */
const SET_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000; // 24h — same as the "invite", reused for a later forgot-password

/** Sent when staff create an affiliate, and again on demand ("Resend invite"). */
export async function issueAffiliateInvite(affiliateId: string) {
  const affiliate = await db.affiliate.findUniqueOrThrow({ where: { id: affiliateId } });
  const token = generateOpaqueToken();
  await db.authToken.create({
    data: {
      actorType: "affiliate",
      actorId: affiliateId,
      purpose: "password_reset",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SET_PASSWORD_TTL_MS),
    },
  });
  await queueEmail({
    templateKey: affiliate.passwordHash ? "affiliate_password_reset" : "affiliate_invite",
    toEmail: affiliate.email,
    vars: { name: affiliate.name, link: `${appBaseUrl()}/affiliate/reset-password?token=${token}` },
  });
  return token;
}

export async function loginAffiliate(input: { email: string; password: string; ipAddress: string; userAgent: string | null }) {
  const email = input.email.trim().toLowerCase();
  const affiliate = await db.affiliate.findUnique({ where: { email } });

  if (!affiliate || !affiliate.passwordHash) {
    throw new AuthError("Invalid email or password.");
  }
  if (isLockedOut(affiliate.lockedUntil)) throw new LockedOutError();

  const ok = await verifyPassword(input.password, affiliate.passwordHash);
  if (!ok) {
    const update = recordFailedAttempt(affiliate.failedLoginAttempts);
    await db.affiliate.update({ where: { id: affiliate.id }, data: update });
    await writeAuditLog({
      actorType: "affiliate",
      actorId: affiliate.id,
      action: "affiliate.login_failed",
      entityType: "Affiliate",
      entityId: affiliate.id,
      ipAddress: input.ipAddress,
    });
    throw new AuthError("Invalid email or password.");
  }

  await db.affiliate.update({ where: { id: affiliate.id }, data: { ...resetLockout, lastLoginAt: new Date() } });
  const token = await createAffiliateSession(affiliate.id, input.ipAddress, input.userAgent);
  await writeAuditLog({
    actorType: "affiliate",
    actorId: affiliate.id,
    action: "affiliate.login",
    entityType: "Affiliate",
    entityId: affiliate.id,
    ipAddress: input.ipAddress,
  });
  return { token, affiliate };
}

export async function logoutAffiliate(token: string, affiliateId: string, ipAddress: string) {
  await destroyAffiliateSession(token);
  await writeAuditLog({
    actorType: "affiliate",
    actorId: affiliateId,
    action: "affiliate.logout",
    entityType: "Affiliate",
    entityId: affiliateId,
    ipAddress,
  });
}

/** Never reveals whether the email exists. */
export async function requestAffiliatePasswordReset(email: string) {
  const affiliate = await db.affiliate.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!affiliate) return;
  await issueAffiliateInvite(affiliate.id);
}

export async function resetAffiliatePassword(token: string, newPassword: string) {
  if (!isPasswordAcceptable(newPassword)) throw new AuthError("Password must be at least 10 characters.", 400);

  const record = await db.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.purpose !== "password_reset" || record.actorType !== "affiliate" || record.usedAt || record.expiresAt < new Date()) {
    throw new AuthError("This link is invalid or has expired.", 400);
  }

  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.affiliate.update({ where: { id: record.actorId }, data: { passwordHash, ...resetLockout } }),
    db.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  await writeAuditLog({
    actorType: "affiliate",
    actorId: record.actorId,
    action: "affiliate.password_set",
    entityType: "Affiliate",
    entityId: record.actorId,
  });
}
