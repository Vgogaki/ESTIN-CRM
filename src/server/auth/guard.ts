import { cookies, headers } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  TRADER_SESSION_COOKIE,
  AFFILIATE_SESSION_COOKIE,
  getAdminSessionByToken,
  getTraderSessionByToken,
  getAffiliateSessionByToken,
} from "@/server/security/session";
import { hasPermission, type Permission } from "@/server/permissions";
import { PermissionDeniedError } from "@/server/permissions";
import { touchAdmin } from "@/server/team";
import { AuthError } from "./errors";

/**
 * Every back-office page and API call resolves the signed-in admin here, which
 * makes it the natural place to note "this person just did something" for the
 * sidebar's Team panel. The panel's own refreshing passes `touch: false`, so
 * a tab left open and untouched doesn't read as "active now".
 */
export async function getCurrentAdmin(options: { touch?: boolean } = {}) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getAdminSessionByToken(token);
  const admin = session?.adminUser ?? null;
  if (admin && options.touch !== false) touchAdmin(admin.id);
  return admin;
}

export async function getCurrentTrader() {
  const token = (await cookies()).get(TRADER_SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getTraderSessionByToken(token);
  return session?.person ?? null;
}

/** Throws if there is no logged-in admin with the given permission. Route handlers call this first. */
export async function requireAdminPermission(permission: Permission) {
  const admin = await getCurrentAdmin();
  if (!admin) throw new AuthError("Not logged in.", 401);
  if (!hasPermission(admin.role.permissions, permission)) {
    throw new PermissionDeniedError(permission);
  }
  return admin;
}

/** Any signed-in admin, regardless of permissions: for things every staff member does to their own account. */
export async function requireAdmin(options: { touch?: boolean } = {}) {
  const admin = await getCurrentAdmin(options);
  if (!admin) throw new AuthError("Not logged in.", 401);
  return admin;
}

export async function requireTrader() {
  const trader = await getCurrentTrader();
  if (!trader) throw new AuthError("Not logged in.", 401);
  return trader;
}

export async function getCurrentAffiliate() {
  const token = (await cookies()).get(AFFILIATE_SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getAffiliateSessionByToken(token);
  return session?.affiliate ?? null;
}

export async function requireAffiliate() {
  const affiliate = await getCurrentAffiliate();
  if (!affiliate) throw new AuthError("Not logged in.", 401);
  return affiliate;
}

/** Best-effort client IP for the audit log — trusts the proxy header set by the hosting platform. */
export async function requestIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function requestUserAgent(): Promise<string | null> {
  const h = await headers();
  return h.get("user-agent");
}
