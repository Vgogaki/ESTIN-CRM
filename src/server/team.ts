import { db } from "@/server/db";

/** Activity is written at most this often per person, so browsing never turns into a stream of database writes. */
export const TOUCH_INTERVAL_MS = 60_000;

/**
 * Notes that this staff member just did something. Fire-and-forget and
 * conditional (the database itself skips the write if one happened in the last
 * minute), and it never throws: a presence hiccup must never break a page.
 */
export function touchAdmin(adminId: string): void {
  const now = new Date();
  void db.adminUser
    .updateMany({
      where: { id: adminId, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: new Date(now.getTime() - TOUCH_INTERVAL_MS) } }] },
      data: { lastActiveAt: now },
    })
    .catch((err) => console.error("[team] could not record activity", err));
}

/** Everyone on the active staff list, most recently active first. Names and roles only; nothing sensitive. */
export async function listTeam() {
  const admins = await db.adminUser.findMany({
    where: { active: true },
    select: { id: true, name: true, lastActiveAt: true, role: { select: { name: true } } },
  });
  return admins
    .map((a) => ({ id: a.id, name: a.name, roleName: a.role.name, lastActiveAt: a.lastActiveAt }))
    .sort((a, b) => (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0));
}
