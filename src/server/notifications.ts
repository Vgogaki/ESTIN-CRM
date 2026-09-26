import type { NotificationType } from "@prisma/client";
import { db } from "@/server/db";
import { queueEmail } from "@/server/email/outbox";
import { appBaseUrl } from "@/server/email/transport";

/**
 * Module 4.4 — in-app notifications centre, with the email copy (4.5) queued
 * alongside it: every notification type has an email template (see
 * src/server/email/defaults.ts). Callers across the codebase (orders, the 3.4 breach/
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
  const notification = await db.notification.create({
    data: {
      personId: input.personId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    },
  });

  // Email copy (4.5). queueEmail never throws, so a mail problem can't undo the event.
  const person = await db.person.findUnique({ where: { id: input.personId }, select: { email: true, fullName: true } });
  if (person) {
    await queueEmail({
      templateKey: input.type,
      toEmail: person.email,
      personId: input.personId,
      vars: {
        name: person.fullName,
        title: input.title,
        body: input.body,
        link: `${appBaseUrl()}${input.link ?? "/portal"}`,
      },
    });
  }
  return notification;
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
