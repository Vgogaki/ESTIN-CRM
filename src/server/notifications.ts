import type { NotificationType } from "@prisma/client";
import { db } from "@/server/db";

/**
 * Module 4.4 — in-app notifications centre. Email delivery (4.5, same
 * table in modules-to-design.md) is a separate, still-unbuilt concern
 * blocked on a transactional email provider decision — see
 * docs/decisions.md. Callers across the codebase (orders, the 3.4 breach/
 * pass automation, the 3.5 expiry sweep, KYC review) call notifyTrader()
 * at the point each event already happens, rather than this module trying
 * to infer events after the fact.
 */
export async function notifyTrader(input: {
  personId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}) {
  return db.notification.create({
    data: {
      personId: input.personId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    },
  });
}

export async function listNotifications(personId: string) {
  return db.notification.findMany({ where: { personId }, orderBy: { createdAt: "desc" } });
}

export async function unreadNotificationCount(personId: string) {
  return db.notification.count({ where: { personId, readAt: null } });
}

/** Scoped to personId in the query itself, not a separate ownership check — a trader can only ever mark their own notifications read. */
export async function markAllNotificationsRead(personId: string) {
  await db.notification.updateMany({ where: { personId, readAt: null }, data: { readAt: new Date() } });
}
