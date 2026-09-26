import type { JurisdictionInputKey, JurisdictionInputStatus } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";

/**
 * Module 6.4. The restricted-country list is a business and legal decision
 * (decisions.md #11), built from four separate inputs. This module doesn't
 * decide anything: it records which inputs have been gathered and confirmed,
 * by whom and when, so the founder can see whether the matrix is ready
 * before launch. The list itself lives in the country rules (6.2).
 */
export const JURISDICTION_INPUTS: readonly { key: JurisdictionInputKey; label: string; source: string; covers: string }[] = [
  {
    key: "sanctions",
    label: "Sanctions and legal prohibitions",
    source: "Legal counsel / compliance adviser",
    covers: "Countries the firm may not deal with at all (sanctions regimes, local prohibitions). Usually the hard 'blocked' rows.",
  },
  {
    key: "payment_provider",
    label: "Payment provider rules",
    source: "The chosen payment provider (decision #5)",
    covers: "Countries the provider will not process card payments from, and countries where it restricts this type of business.",
  },
  {
    key: "data_vendor",
    label: "Data vendor licence terms",
    source: "The trading platform / market data vendor (not yet chosen)",
    covers: "Countries where the vendor's licence forbids serving users or displaying its data.",
  },
  {
    key: "marketing_legal",
    label: "Legal advice on marketing",
    source: "Cyprus legal counsel",
    covers: "Countries where marketing or selling this product is restricted or needs local registration.",
  },
];

export const INPUT_STATUSES: readonly JurisdictionInputStatus[] = ["pending", "in_progress", "done"];

export async function listInputs() {
  const rows = new Map((await db.jurisdictionInput.findMany()).map((r) => [r.key, r]));
  return JURISDICTION_INPUTS.map((def) => {
    const r = rows.get(def.key);
    return { ...def, status: r?.status ?? ("pending" as JurisdictionInputStatus), note: r?.note ?? null, updatedAt: r?.updatedAt ?? null };
  });
}

/** True only when all four inputs are confirmed done. Surfaced to staff; it does not itself change any country rule. */
export function matrixSettled(inputs: { status: JurisdictionInputStatus }[]): boolean {
  return inputs.length === JURISDICTION_INPUTS.length && inputs.every((i) => i.status === "done");
}

export async function updateInput(input: {
  key: JurisdictionInputKey;
  status: JurisdictionInputStatus;
  note: string | null;
  adminId: string;
  ipAddress: string;
}) {
  if (!JURISDICTION_INPUTS.some((d) => d.key === input.key)) throw new ValidationError("Unknown input.");
  // "Done" is a claim that a professional's answer was received, so it must say from whom / when.
  if (input.status === "done" && !input.note?.trim()) {
    throw new ValidationError("Add a note saying who confirmed this and when (for example the adviser's name and date).");
  }
  const before = await db.jurisdictionInput.findUnique({ where: { key: input.key } });
  const saved = await db.jurisdictionInput.upsert({
    where: { key: input.key },
    create: { key: input.key, status: input.status, note: input.note, updatedById: input.adminId },
    update: { status: input.status, note: input.note, updatedById: input.adminId },
  });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: "jurisdiction.input_updated",
    entityType: "JurisdictionInput",
    entityId: input.key,
    before: before ? { status: before.status, note: before.note } : { status: "pending" },
    after: { status: input.status, note: input.note },
    ipAddress: input.ipAddress,
  });
  return saved;
}
