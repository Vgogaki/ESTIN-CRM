import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { hashPassword, isPasswordAcceptable, verifyPassword } from "@/server/security/password";
import { generateTotpSecret, totpEnrollmentUri, verifyTotpToken } from "@/server/security/totp";
import { isLockedOut, recordFailedAttempt, resetLockout } from "@/server/security/lockout";
import { createTraderSession, destroyTraderSession } from "@/server/security/session";
import { generateOpaqueToken, hashToken } from "@/server/security/tokens";
import { AuthError, LockedOutError, TwoFactorRequiredError } from "./errors";
import { enforceCountry, openReview } from "@/server/countries";
import { scanPerson } from "@/server/account-links";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * Direct sign-up path (spec: "also allow direct sign-up for competitions
 * and free products"). The order-triggered path in Phase 2 creates the
 * Person record from the order and only needs the password-setup half of
 * this — that will reuse issueEmailVerification below rather than
 * duplicating it.
 */
export async function registerTrader(input: {
  fullName: string;
  email: string;
  country: string;
  password: string;
  ipAddress: string;
}) {
  const email = input.email.trim().toLowerCase();

  if (!isPasswordAcceptable(input.password)) {
    throw new AuthError("Password must be at least 10 characters.", 400);
  }

  const countryAction = await enforceCountry({
    countryCode: input.country,
    stage: "registration",
    ipAddress: input.ipAddress,
  });

  const existing = await db.person.findUnique({ where: { email } });
  if (existing) {
    // Same email is allowed to purchase again later, but not to register
    // twice with two passwords for one identity.
    throw new AuthError("An account with this email already exists.", 409);
  }

  const passwordHash = await hashPassword(input.password);
  const person = await db.person.create({
    data: {
      fullName: input.fullName,
      email,
      country: input.country,
      passwordHash,
    },
  });

  await writeAuditLog({
    actorType: "trader",
    actorId: person.id,
    action: "person.registered",
    entityType: "Person",
    entityId: person.id,
    ipAddress: input.ipAddress,
  });

  await scanPerson(person.id);

  if (countryAction === "review") {
    await openReview({ personId: person.id, stage: "registration", countryCode: input.country });
  }

  const verificationToken = await issueEmailVerification(person.id, person.email);

  return { person, verificationToken };
}

export async function issueEmailVerification(personId: string, email: string) {
  const token = generateOpaqueToken();
  await db.authToken.create({
    data: {
      actorType: "trader",
      actorId: personId,
      purpose: "email_verification",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    },
  });

  // No transactional email provider is configured yet (spec §4.5, still
  // open). Until then, the link is logged server-side so the flow is
  // testable end to end; nothing is emailed to the trader.
  console.log(`[dev] Email verification link for ${email}: /portal/verify-email?token=${token}`);

  return token;
}

export async function verifyEmail(token: string) {
  const record = await db.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (
    !record ||
    record.purpose !== "email_verification" ||
    record.actorType !== "trader" ||
    record.usedAt ||
    record.expiresAt < new Date()
  ) {
    throw new AuthError("This verification link is invalid or has expired.", 400);
  }

  await db.$transaction([
    db.person.update({
      where: { id: record.actorId },
      data: { emailVerifiedAt: new Date() },
    }),
    db.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  await writeAuditLog({
    actorType: "trader",
    actorId: record.actorId,
    action: "person.email_verified",
    entityType: "Person",
    entityId: record.actorId,
  });
}

export async function loginTrader(input: {
  email: string;
  password: string;
  totpToken?: string;
  ipAddress: string;
  userAgent: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  const person = await db.person.findUnique({ where: { email } });

  if (!person || person.voidedAt || !person.passwordHash) {
    throw new AuthError("Invalid email or password.");
  }

  if (isLockedOut(person.lockedUntil)) {
    throw new LockedOutError();
  }

  const passwordOk = await verifyPassword(input.password, person.passwordHash);
  if (!passwordOk) {
    const update = recordFailedAttempt(person.failedLoginAttempts);
    await db.person.update({ where: { id: person.id }, data: update });
    await writeAuditLog({
      actorType: "trader",
      actorId: person.id,
      action: "person.login_failed",
      entityType: "Person",
      entityId: person.id,
      ipAddress: input.ipAddress,
    });
    throw new AuthError("Invalid email or password.");
  }

  if (!person.emailVerifiedAt) {
    throw new AuthError("Please verify your email before logging in.", 403);
  }

  // 2FA is optional at login and mandatory before a payout request (spec).
  // The payout endpoint (Phase 5) re-checks twoFactorEnabledAt itself —
  // this is just the login-time challenge for traders who opted in.
  if (person.twoFactorEnabledAt) {
    if (!input.totpToken) throw new TwoFactorRequiredError();
    if (!person.twoFactorSecret || !(await verifyTotpToken(input.totpToken, person.twoFactorSecret))) {
      throw new AuthError("Invalid two-factor code.");
    }
  }

  await db.person.update({ where: { id: person.id }, data: resetLockout });

  const token = await createTraderSession(person.id, input.ipAddress, input.userAgent);
  await scanPerson(person.id);

  await writeAuditLog({
    actorType: "trader",
    actorId: person.id,
    action: "person.login",
    entityType: "Person",
    entityId: person.id,
    ipAddress: input.ipAddress,
  });

  return { token, person };
}

export async function logoutTrader(token: string, personId: string, ipAddress: string) {
  await destroyTraderSession(token);
  await writeAuditLog({
    actorType: "trader",
    actorId: personId,
    action: "person.logout",
    entityType: "Person",
    entityId: personId,
    ipAddress,
  });
}

/** Never reveals whether the email exists — caller should always respond generically. */
export async function requestPasswordReset(email: string) {
  const person = await db.person.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!person || person.voidedAt) return;

  const token = generateOpaqueToken();
  await db.authToken.create({
    data: {
      actorType: "trader",
      actorId: person.id,
      purpose: "password_reset",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    },
  });

  console.log(`[dev] Password reset link for ${person.email}: /portal/reset-password?token=${token}`);
}

export async function resetPassword(token: string, newPassword: string) {
  if (!isPasswordAcceptable(newPassword)) {
    throw new AuthError("Password must be at least 10 characters.", 400);
  }

  const record = await db.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (
    !record ||
    record.purpose !== "password_reset" ||
    record.actorType !== "trader" ||
    record.usedAt ||
    record.expiresAt < new Date()
  ) {
    throw new AuthError("This reset link is invalid or has expired.", 400);
  }

  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.person.update({
      where: { id: record.actorId },
      data: { passwordHash, ...resetLockout },
    }),
    db.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  await writeAuditLog({
    actorType: "trader",
    actorId: record.actorId,
    action: "person.password_reset",
    entityType: "Person",
    entityId: record.actorId,
  });
}

export async function enrollTwoFactor(personId: string) {
  const person = await db.person.findUniqueOrThrow({ where: { id: personId } });
  const secret = generateTotpSecret();
  await db.person.update({ where: { id: personId }, data: { twoFactorSecret: secret } });
  return { secret, uri: totpEnrollmentUri(secret, person.email) };
}

export async function confirmTwoFactor(personId: string, token: string) {
  const person = await db.person.findUniqueOrThrow({ where: { id: personId } });
  if (!person.twoFactorSecret || !(await verifyTotpToken(token, person.twoFactorSecret))) {
    throw new AuthError("Invalid two-factor code.", 400);
  }
  await db.person.update({
    where: { id: personId },
    data: { twoFactorEnabledAt: new Date() },
  });
  await writeAuditLog({
    actorType: "trader",
    actorId: personId,
    action: "person.two_factor_enabled",
    entityType: "Person",
    entityId: personId,
  });
}
