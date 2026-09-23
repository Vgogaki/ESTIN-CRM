import { db } from "@/server/db";
import { generateOpaqueToken, hashToken } from "./tokens";

export const ADMIN_SESSION_COOKIE = "estin_admin_session";
export const TRADER_SESSION_COOKIE = "estin_trader_session";

const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h — shorter, back office is more sensitive
const TRADER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d

export async function createAdminSession(
  adminUserId: string,
  ipAddress: string,
  userAgent: string | null,
) {
  const token = generateOpaqueToken();
  await db.adminSession.create({
    data: {
      tokenHash: hashToken(token),
      adminUserId,
      ipAddress,
      userAgent,
      expiresAt: new Date(Date.now() + ADMIN_SESSION_TTL_MS),
    },
  });
  return token;
}

export async function getAdminSessionByToken(token: string) {
  const session = await db.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { adminUser: { include: { role: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date() || !session.adminUser.active) return null;
  return session;
}

export async function destroyAdminSession(token: string) {
  await db.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function createTraderSession(
  personId: string,
  ipAddress: string,
  userAgent: string | null,
) {
  const token = generateOpaqueToken();
  await db.traderSession.create({
    data: {
      tokenHash: hashToken(token),
      personId,
      ipAddress,
      userAgent,
      expiresAt: new Date(Date.now() + TRADER_SESSION_TTL_MS),
    },
  });
  return token;
}

export async function getTraderSessionByToken(token: string) {
  const session = await db.traderSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { person: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date() || session.person.voidedAt) return null;
  return session;
}

export async function destroyTraderSession(token: string) {
  await db.traderSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}
