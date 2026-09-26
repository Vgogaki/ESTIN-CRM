import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";

/**
 * Module 6.1 — link different PEOPLE who share something. "Flag for review;
 * do not auto-block" (modules-to-design.md §6.1–6.5): nothing here blocks
 * anything. Signals built from data we actually hold:
 *   - shared_kyc_document  (strong)  the same file uploaded under two people
 *   - shared_payment_instrument (strong)  same provider fingerprint — the
 *       column exists but stays empty until a payment provider (decision
 *       #5) supplies one
 *   - shared_ip  (weak)  households, offices, mobile carriers and VPNs all
 *       share addresses, so an IP alone never reaches the review queue
 *   - shared_device  (strong)  the same browser device id (module 6.6) signed
 *       in as two people. A cookie id, not a true fingerprint — see devices.ts
 * NOT built, and listed in docs/deferred-items.md: address details (no
 * address is collected).
 */
export type SignalType = "shared_ip" | "shared_kyc_document" | "shared_payment_instrument" | "shared_device";
export type Signal = { type: SignalType; value: string };

export type Evidence = {
  ips: Set<string>;
  kycChecksums: Set<string>;
  paymentFingerprints: Set<string>;
  deviceHashes: Set<string>;
};

export type FoundLink = { otherId: string; signals: Signal[]; strength: "weak" | "strong" };

const emptyEvidence = (): Evidence => ({ ips: new Set(), kycChecksums: new Set(), paymentFingerprints: new Set(), deviceHashes: new Set() });

/** "unknown" is what requestIp() returns when no proxy header is present — it says nothing about who anyone is. */
const IGNORED_IPS = new Set(["unknown", "", "::1", "127.0.0.1"]);

export function hashFingerprint(raw: string): string {
  return createHash("sha256").update(raw.trim()).digest("hex");
}

/** Pure: which other people share something with `subjectId`. No DB access. */
export function findLinks(subjectId: string, evidence: Map<string, Evidence>): FoundLink[] {
  const subject = evidence.get(subjectId) ?? emptyEvidence();
  const links: FoundLink[] = [];

  for (const [otherId, other] of evidence) {
    if (otherId === subjectId) continue;
    const signals: Signal[] = [];
    for (const ip of subject.ips) if (!IGNORED_IPS.has(ip) && other.ips.has(ip)) signals.push({ type: "shared_ip", value: ip });
    for (const c of subject.kycChecksums) if (other.kycChecksums.has(c)) signals.push({ type: "shared_kyc_document", value: c });
    for (const f of subject.paymentFingerprints) if (other.paymentFingerprints.has(f)) signals.push({ type: "shared_payment_instrument", value: f });
    for (const h of subject.deviceHashes) if (other.deviceHashes.has(h)) signals.push({ type: "shared_device", value: h });
    if (signals.length === 0) continue;
    links.push({
      otherId,
      signals,
      strength: signals.some((s) => s.type !== "shared_ip") ? "strong" : "weak",
    });
  }
  return links;
}

const signalKey = (s: Signal) => `${s.type}:${s.value}`;

/** Gathers what `personId` has, then everyone else who has any of the same values. */
async function loadEvidence(personId: string): Promise<Map<string, Evidence>> {
  const evidence = new Map<string, Evidence>();
  const get = (id: string) => {
    let e = evidence.get(id);
    if (!e) evidence.set(id, (e = emptyEvidence()));
    return e;
  };

  const [sessions, terms, registered, docs, payments, devices] = await Promise.all([
    db.traderSession.findMany({ where: { personId }, select: { ipAddress: true } }),
    db.termsAcceptance.findMany({ where: { personId }, select: { ipAddress: true } }),
    db.auditLog.findMany({ where: { entityType: "Person", entityId: personId, action: "person.registered" }, select: { ipAddress: true } }),
    db.kycDocument.findMany({ where: { personId }, select: { checksum: true } }),
    db.payment.findMany({ where: { personId, paymentFingerprint: { not: null } }, select: { paymentFingerprint: true } }),
    db.deviceSighting.findMany({ where: { personId }, select: { deviceHash: true } }),
  ]);
  const me = get(personId);
  for (const r of [...sessions, ...terms, ...registered]) if (r.ipAddress) me.ips.add(r.ipAddress);
  for (const d of docs) me.kycChecksums.add(d.checksum);
  for (const p of payments) me.paymentFingerprints.add(p.paymentFingerprint!);
  for (const d of devices) me.deviceHashes.add(d.deviceHash);

  const ips = [...me.ips].filter((ip) => !IGNORED_IPS.has(ip));
  const [oSessions, oTerms, oRegistered, oDocs, oPayments, oDevices] = await Promise.all([
    ips.length ? db.traderSession.findMany({ where: { ipAddress: { in: ips }, personId: { not: personId } }, select: { personId: true, ipAddress: true } }) : [],
    ips.length ? db.termsAcceptance.findMany({ where: { ipAddress: { in: ips }, personId: { not: personId } }, select: { personId: true, ipAddress: true } }) : [],
    ips.length ? db.auditLog.findMany({ where: { action: "person.registered", ipAddress: { in: ips }, entityId: { not: personId } }, select: { entityId: true, ipAddress: true } }) : [],
    me.kycChecksums.size ? db.kycDocument.findMany({ where: { checksum: { in: [...me.kycChecksums] }, personId: { not: personId } }, select: { personId: true, checksum: true } }) : [],
    me.paymentFingerprints.size ? db.payment.findMany({ where: { paymentFingerprint: { in: [...me.paymentFingerprints] }, personId: { not: personId } }, select: { personId: true, paymentFingerprint: true } }) : [],
    me.deviceHashes.size ? db.deviceSighting.findMany({ where: { deviceHash: { in: [...me.deviceHashes] }, personId: { not: personId } }, select: { personId: true, deviceHash: true } }) : [],
  ]);
  for (const r of [...oSessions, ...oTerms]) get(r.personId).ips.add(r.ipAddress);
  for (const r of oRegistered) if (r.ipAddress) get(r.entityId).ips.add(r.ipAddress);
  for (const r of oDocs) get(r.personId).kycChecksums.add(r.checksum);
  for (const r of oPayments) get(r.personId).paymentFingerprints.add(r.paymentFingerprint!);
  for (const r of oDevices) get(r.personId).deviceHashes.add(r.deviceHash);

  return evidence;
}

/**
 * Re-checks one person and records/updates any links. Idempotent. A
 * dismissed link comes back to "open" only when a NEW signal appears that
 * wasn't there when it was dismissed. Never throws into the caller —
 * detection failing must not break registration, login, or an order.
 */
export async function scanPerson(personId: string): Promise<void> {
  try {
    const found = findLinks(personId, await loadEvidence(personId));
    for (const link of found) {
      const [personAId, personBId] = [personId, link.otherId].sort();
      const existing = await db.accountLink.findUnique({ where: { personAId_personBId: { personAId, personBId } } });

      if (!existing) {
        const created = await db.accountLink.create({
          data: { personAId, personBId, signals: link.signals as unknown as Prisma.InputJsonValue, strength: link.strength },
        });
        await writeAuditLog({
          actorType: "system",
          actorId: null,
          action: "account_link.created",
          entityType: "AccountLink",
          entityId: created.id,
          after: { personAId, personBId, strength: link.strength, signals: link.signals.map((s) => s.type) },
          reason: "Two different people share something. Flagged for review — nothing was blocked.",
        });
        continue;
      }

      const known = new Set((existing.signals as unknown as Signal[]).map(signalKey));
      const added = link.signals.filter((s) => !known.has(signalKey(s)));
      if (added.length === 0) continue;

      const merged = [...(existing.signals as unknown as Signal[]), ...added];
      const strength = merged.some((s) => s.type !== "shared_ip") ? "strong" : "weak";
      const reopen = existing.status === "dismissed";
      await db.accountLink.update({
        where: { id: existing.id },
        data: { signals: merged as unknown as Prisma.InputJsonValue, strength, ...(reopen ? { status: "open", resolvedAt: null, resolvedById: null } : {}) },
      });
      await writeAuditLog({
        actorType: "system",
        actorId: null,
        action: reopen ? "account_link.reopened" : "account_link.signals_added",
        entityType: "AccountLink",
        entityId: existing.id,
        after: { added: added.map((s) => s.type), strength },
        reason: reopen ? "A new shared signal appeared after this link was dismissed." : undefined,
      });
    }
  } catch (err) {
    console.error("[account-links] scan failed for", personId, err);
  }
}

export async function rescanAll(): Promise<number> {
  const people = await db.person.findMany({ select: { id: true } });
  for (const p of people) await scanPerson(p.id);
  return people.length;
}

export async function linksForPerson(personId: string) {
  const links = await db.accountLink.findMany({
    where: { OR: [{ personAId: personId }, { personBId: personId }] },
    include: { personA: true, personB: true },
    orderBy: { createdAt: "desc" },
  });
  return links.map((l) => {
    const other = l.personAId === personId ? l.personB : l.personA;
    return {
      id: l.id,
      otherId: other.id,
      otherName: other.fullName,
      otherEmail: other.email,
      strength: l.strength,
      status: l.status,
      signals: l.signals as unknown as Signal[],
      resolutionNote: l.resolutionNote,
    };
  });
}

/** The review queue: strong links only, still open. Weak (IP-only) links are visible on a profile but stay out of the queue. */
export async function listOpenStrongLinks() {
  return db.accountLink.findMany({
    where: { status: "open", strength: "strong" },
    include: { personA: true, personB: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function resolveLink(input: {
  linkId: string;
  status: "dismissed" | "confirmed";
  note: string;
  adminId: string;
  ipAddress: string;
}) {
  if (input.note.trim().length < 4) throw new ValidationError("A note is required recording what you found.");
  const link = await db.accountLink.findUniqueOrThrow({ where: { id: input.linkId } });
  if (link.status !== "open") throw new ValidationError("This link has already been resolved.");

  const updated = await db.accountLink.update({
    where: { id: input.linkId },
    data: { status: input.status, resolvedAt: new Date(), resolvedById: input.adminId, resolutionNote: input.note.trim() },
  });
  await writeAuditLog({
    actorType: "admin",
    actorId: input.adminId,
    action: input.status === "confirmed" ? "account_link.confirmed" : "account_link.dismissed",
    entityType: "AccountLink",
    entityId: link.id,
    before: { status: link.status },
    after: { status: updated.status },
    reason: input.note,
    ipAddress: input.ipAddress,
  });
  return updated;
}
