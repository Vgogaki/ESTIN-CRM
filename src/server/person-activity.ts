import { db } from "@/server/db";

/**
 * Module 7.3 — the parts of the "User 360" profile that aren't already on the
 * trader page (details, KYC, accounts, payments, payouts, notes and linked
 * people were built with their own modules). This is read-only aggregation:
 * it owns no data and changes nothing. Sections that need a permission are
 * only queried when the caller passes it, so restricted data never leaves the
 * database for someone who may not see it.
 */
export async function getPersonActivity(personId: string, opts: { audit: boolean; support: boolean }) {
  const [competitions, offers, countryReviews, supportThreads, accountIds] = await Promise.all([
    db.competitionEntry.findMany({
      where: { personId },
      include: { competition: { select: { id: true, name: true, status: true } } },
      orderBy: { enteredAt: "desc" },
    }),
    db.issuedOffer.findMany({
      where: { personId },
      include: { campaign: { select: { name: true, code: true } }, challengeType: { select: { name: true, currency: true } } },
      orderBy: { issuedAt: "desc" },
    }),
    db.countryReview.findMany({ where: { personId }, orderBy: { createdAt: "desc" } }),
    opts.support
      ? db.supportThread.findMany({ where: { personId }, orderBy: { lastMessageAt: "desc" } })
      : Promise.resolve(null),
    db.account.findMany({ where: { personId }, select: { id: true } }),
  ]);

  let audit: { id: string; timestamp: Date; actorType: string; actorName: string | null; action: string; entityType: string; reason: string | null }[] | null = null;
  if (opts.audit) {
    const ids = accountIds.map((a) => a.id);
    const rows = await db.auditLog.findMany({
      where: {
        OR: [
          { entityType: "Person", entityId: personId },
          { entityType: "Account", entityId: { in: ids } },
          { actorType: "trader", actorId: personId },
        ],
      },
      orderBy: { timestamp: "desc" },
      take: 100,
    });
    const adminIds = [...new Set(rows.filter((r) => r.actorType === "admin" && r.actorId).map((r) => r.actorId!))];
    const admins = adminIds.length ? await db.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } }) : [];
    const names = new Map(admins.map((a) => [a.id, a.name]));
    audit = rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      actorType: r.actorType,
      actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
      action: r.action,
      entityType: r.entityType,
      reason: r.reason,
    }));
  }

  return { competitions, offers, countryReviews, supportThreads, audit };
}
