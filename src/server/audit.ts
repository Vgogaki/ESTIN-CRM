import type { ActorType, Prisma } from "@prisma/client";
import { db } from "@/server/db";

type WriteAuditLogInput = {
  actorType: ActorType;
  /** Null only for actorType "system" (e.g. a scheduled job). */
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  /** Mandatory in practice for manual overrides — enforced at the call site, not here. */
  reason?: string | null;
  ipAddress?: string | null;
};

/**
 * The only way any part of the app should write to AuditLog. Every state
 * change to a business record must go through this. The table itself is
 * append-only at the database level (see migration
 * 20260923_audit_log_immutable) — UPDATE/DELETE are rejected even for a
 * superuser role, so this function only ever does a plain create.
 */
export async function writeAuditLog(input: WriteAuditLogInput) {
  await db.auditLog.create({
    data: {
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      reason: input.reason ?? undefined,
      ipAddress: input.ipAddress ?? undefined,
    },
  });
}
