import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { verifyPassword } from "@/server/security/password";
import { generateTotpSecret, totpEnrollmentUri, verifyTotpToken } from "@/server/security/totp";
import { isLockedOut, recordFailedAttempt } from "@/server/security/lockout";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  looksLikeTotp,
  normalizeRecoveryCode,
} from "@/server/security/recovery-codes";
import { AuthError, LockedOutError } from "./errors";

/**
 * Two-factor sign-in for back-office staff. Admins hold the keys to payouts,
 * KYC documents and every trader's data, so a stolen or guessed password alone
 * must not be enough. Until now the login checked a code *if one existed* but
 * there was no way to set one up.
 *
 * Rules worth knowing:
 *  - Setup can't overwrite an active secret (a hijacked session must not be able
 *    to swap the device); turning it off or regenerating recovery codes needs the
 *    current password AND a current code.
 *  - A wrong code counts toward the same lockout as a wrong password.
 *  - Recovery codes are one-time and stored only as hashes.
 */
export type SecondFactorMethod = "totp" | "recovery";

/**
 * Checks a code at sign-in or re-confirmation: a 6-digit authenticator code, or
 * one of the admin's unused recovery codes (consumed atomically, so two requests
 * can't both spend it).
 */
export async function verifySecondFactor(
  admin: { id: string; twoFactorSecret: string | null },
  input: string,
): Promise<SecondFactorMethod | null> {
  const token = input.trim();
  if (looksLikeTotp(token)) {
    if (!admin.twoFactorSecret) return null;
    return (await verifyTotpToken(token, admin.twoFactorSecret)) ? "totp" : null;
  }
  const normalized = normalizeRecoveryCode(token);
  if (!normalized) return null;
  const spent = await db.adminRecoveryCode.updateMany({
    where: { adminUserId: admin.id, codeHash: hashRecoveryCode(normalized), usedAt: null },
    data: { usedAt: new Date() },
  });
  return spent.count === 1 ? "recovery" : null;
}

export async function getTwoFactorStatus(adminId: string) {
  const admin = await db.adminUser.findUniqueOrThrow({ where: { id: adminId }, select: { twoFactorEnabledAt: true } });
  const enabled = admin.twoFactorEnabledAt !== null;
  const recoveryCodesRemaining = enabled ? await db.adminRecoveryCode.count({ where: { adminUserId: adminId, usedAt: null } }) : 0;
  return { enabled, recoveryCodesRemaining };
}

/** Step 1: make a secret for the authenticator app. It isn't active until confirmed with a real code. */
export async function startEnrollment(adminId: string, ipAddress: string) {
  const admin = await db.adminUser.findUniqueOrThrow({ where: { id: adminId } });
  if (admin.twoFactorEnabledAt) {
    throw new AuthError("Two-factor is already on. To change it, turn it off first (that needs your password and a code).", 409);
  }
  const secret = generateTotpSecret();
  await db.adminUser.update({ where: { id: adminId }, data: { twoFactorSecret: secret } });
  await writeAuditLog({
    actorType: "admin",
    actorId: adminId,
    action: "admin.two_factor_setup_started",
    entityType: "AdminUser",
    entityId: adminId,
    ipAddress,
  });
  return { secret, otpauthUri: totpEnrollmentUri(secret, admin.email) };
}

/** Step 2: prove the app is set up by typing a current code. Returns the recovery codes, shown once. */
export async function confirmEnrollment(adminId: string, token: string, ipAddress: string): Promise<string[]> {
  const admin = await db.adminUser.findUniqueOrThrow({ where: { id: adminId } });
  if (admin.twoFactorEnabledAt) throw new AuthError("Two-factor is already on.", 409);
  if (!admin.twoFactorSecret) throw new AuthError("Start the setup first.", 400);
  if (!looksLikeTotp(token) || !(await verifyTotpToken(token.trim(), admin.twoFactorSecret))) {
    throw new AuthError("That code isn't right. Check the app is showing the code for this account, and try the next one.", 400);
  }

  const codes = generateRecoveryCodes();
  await db.$transaction([
    db.adminUser.update({ where: { id: adminId }, data: { twoFactorEnabledAt: new Date() } }),
    db.adminRecoveryCode.deleteMany({ where: { adminUserId: adminId } }),
    db.adminRecoveryCode.createMany({
      data: codes.map((c) => ({ adminUserId: adminId, codeHash: hashRecoveryCode(normalizeRecoveryCode(c)!) })),
    }),
  ]);
  await writeAuditLog({
    actorType: "admin",
    actorId: adminId,
    action: "admin.two_factor_enabled",
    entityType: "AdminUser",
    entityId: adminId,
    ipAddress,
  });
  return codes;
}

/**
 * Sensitive changes need fresh proof: the current password and a current code
 * (or an unused recovery code). Wrong answers count toward the lockout.
 */
async function requireFreshProof(adminId: string, password: string, token: string, ipAddress: string) {
  const admin = await db.adminUser.findUniqueOrThrow({ where: { id: adminId } });
  if (!admin.twoFactorEnabledAt) throw new AuthError("Two-factor isn't on.", 400);
  if (isLockedOut(admin.lockedUntil)) throw new LockedOutError();

  const passwordOk = await verifyPassword(password, admin.passwordHash);
  const method = passwordOk ? await verifySecondFactor(admin, token) : null;
  if (!method) {
    await db.adminUser.update({ where: { id: adminId }, data: recordFailedAttempt(admin.failedLoginAttempts) });
    await writeAuditLog({
      actorType: "admin",
      actorId: adminId,
      action: "admin.two_factor_reauth_failed",
      entityType: "AdminUser",
      entityId: adminId,
      ipAddress,
    });
    // One message for both causes, so it doesn't reveal which half was right.
    throw new AuthError("Your password or code was not correct.", 400);
  }
  return admin;
}

export async function disableTwoFactor(input: { adminId: string; password: string; token: string; ipAddress: string }) {
  await requireFreshProof(input.adminId, input.password, input.token, input.ipAddress);
  await db.$transaction([
    db.adminUser.update({ where: { id: input.adminId }, data: { twoFactorSecret: null, twoFactorEnabledAt: null } }),
    db.adminRecoveryCode.deleteMany({ where: { adminUserId: input.adminId } }),
  ]);
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "admin.two_factor_disabled",
    entityType: "AdminUser",
    entityId: input.adminId,
    ipAddress: input.ipAddress,
  });
}

/** Replaces all recovery codes (old ones stop working). Returns the new ones, shown once. */
export async function regenerateRecoveryCodes(input: { adminId: string; password: string; token: string; ipAddress: string }): Promise<string[]> {
  await requireFreshProof(input.adminId, input.password, input.token, input.ipAddress);
  const codes = generateRecoveryCodes();
  await db.$transaction([
    db.adminRecoveryCode.deleteMany({ where: { adminUserId: input.adminId } }),
    db.adminRecoveryCode.createMany({
      data: codes.map((c) => ({ adminUserId: input.adminId, codeHash: hashRecoveryCode(normalizeRecoveryCode(c)!) })),
    }),
  ]);
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "admin.recovery_codes_regenerated",
    entityType: "AdminUser",
    entityId: input.adminId,
    ipAddress: input.ipAddress,
  });
  return codes;
}
