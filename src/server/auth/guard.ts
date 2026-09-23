import { cookies, headers } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  TRADER_SESSION_COOKIE,
  getAdminSessionByToken,
  getTraderSessionByToken,
} from "@/server/security/session";
import { hasPermission, type Permission } from "@/server/permissions";
import { PermissionDeniedError } from "@/server/permissions";
import { AuthError } from "./errors";

export async function getCurrentAdmin() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getAdminSessionByToken(token);
  return session?.adminUser ?? null;
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

export async function requireTrader() {
  const trader = await getCurrentTrader();
  if (!trader) throw new AuthError("Not logged in.", 401);
  return trader;
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
