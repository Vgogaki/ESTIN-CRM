import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { hashPassword, isPasswordAcceptable, verifyPassword } from "@/server/security/password";
import { isLockedOut, recordFailedAttempt, resetLockout } from "@/server/security/lockout";
import { verifySecondFactor } from "./admin-2fa";
import { createAdminSession, destroyAdminSession } from "@/server/security/session";
import { AuthError, LockedOutError, TwoFactorRequiredError } from "./errors";

type LoginInput = {
  email: string;
  password: string;
  totpToken?: string;
  ipAddress: string;
  userAgent: string | null;
};

export async function loginAdmin(input: LoginInput) {
  const email = input.email.trim().toLowerCase();
  const admin = await db.adminUser.findUnique({
    where: { email },
    include: { role: true },
  });

  // Constant-shape response whether or not the account exists, to avoid
  // leaking which admin emails are valid.
  if (!admin || !admin.active) {
    throw new AuthError("Invalid email or password.");
  }

  if (isLockedOut(admin.lockedUntil)) {
    throw new LockedOutError();
  }

  const passwordOk = await verifyPassword(input.password, admin.passwordHash);
  if (!passwordOk) {
    const update = recordFailedAttempt(admin.failedLoginAttempts);
    await db.adminUser.update({ where: { id: admin.id }, data: update });
    await writeAuditLog({
      actorType: "admin",
      actorId: admin.id,
      action: "admin.login_failed",
      entityType: "AdminUser",
      entityId: admin.id,
      ipAddress: input.ipAddress,
    });
    throw new AuthError("Invalid email or password.");
  }

  if (admin.twoFactorEnabledAt) {
    if (!input.totpToken) throw new TwoFactorRequiredError();
    const method = await verifySecondFactor(admin, input.totpToken);
    if (!method) {
      // A wrong code counts toward the lockout like a wrong password: otherwise
      // someone who knew the password could guess the 6 digits indefinitely.
      await db.adminUser.update({ where: { id: admin.id }, data: recordFailedAttempt(admin.failedLoginAttempts) });
      await writeAuditLog({
        actorType: "admin",
        actorId: admin.id,
        action: "admin.login_failed",
        entityType: "AdminUser",
        entityId: admin.id,
        reason: "Wrong two-factor code.",
        ipAddress: input.ipAddress,
      });
      throw new AuthError("Invalid two-factor code.");
    }
    if (method === "recovery") {
      await writeAuditLog({
        actorType: "admin",
        actorId: admin.id,
        action: "admin.recovery_code_used",
        entityType: "AdminUser",
        entityId: admin.id,
        reason: "Signed in with a one-time recovery code.",
        ipAddress: input.ipAddress,
      });
    }
  }

  await db.adminUser.update({ where: { id: admin.id }, data: resetLockout });

  const token = await createAdminSession(admin.id, input.ipAddress, input.userAgent);

  await writeAuditLog({
    actorType: "admin",
    actorId: admin.id,
    action: "admin.login",
    entityType: "AdminUser",
    entityId: admin.id,
    ipAddress: input.ipAddress,
  });

  return { token, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } };
}

export async function logoutAdmin(token: string, adminId: string, ipAddress: string) {
  await destroyAdminSession(token);
  await writeAuditLog({
    actorType: "admin",
    actorId: adminId,
    action: "admin.logout",
    entityType: "AdminUser",
    entityId: adminId,
    ipAddress,
  });
}

/**
 * Admins are provisioned by another admin with "admins.manage" (or by the
 * seed script for the first account) — there is no admin self-registration.
 */
export async function createAdmin(input: {
  email: string;
  name: string;
  password: string;
  roleId: string;
  createdByAdminId: string | null;
  ipAddress: string;
}) {
  const passwordHash = await hashPassword(input.password);
  const admin = await db.adminUser.create({
    data: {
      email: input.email.trim().toLowerCase(),
      name: input.name,
      passwordHash,
      roleId: input.roleId,
    },
  });

  await writeAuditLog({
    actorType: input.createdByAdminId ? "admin" : "system",
    actorId: input.createdByAdminId,
    action: "admin.created",
    entityType: "AdminUser",
    entityId: admin.id,
    after: { email: admin.email, name: admin.name, roleId: admin.roleId },
    ipAddress: input.ipAddress,
  });

  return admin;
}

export async function changeAdminPassword(input: {
  adminId: string;
  currentPassword: string;
  newPassword: string;
  ipAddress: string;
}) {
  const admin = await db.adminUser.findUniqueOrThrow({ where: { id: input.adminId } });

  const currentOk = await verifyPassword(input.currentPassword, admin.passwordHash);
  if (!currentOk) throw new AuthError("Current password is incorrect.", 400);

  if (!isPasswordAcceptable(input.newPassword)) {
    throw new AuthError("Password must be at least 10 characters.", 400);
  }

  const passwordHash = await hashPassword(input.newPassword);
  await db.adminUser.update({ where: { id: admin.id }, data: { passwordHash } });

  await writeAuditLog({
    actorType: "admin",
    actorId: admin.id,
    action: "admin.password_changed",
    entityType: "AdminUser",
    entityId: admin.id,
    ipAddress: input.ipAddress,
  });
}
