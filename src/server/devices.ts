import { randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { hashFingerprint, scanPerson } from "@/server/account-links";

/**
 * Module 6.6 — device recognition. Deliberately modest and honest about it:
 * this is NOT browser fingerprinting. Each browser gets a random first-party
 * cookie the first time it signs in or registers; we remember (as a hash)
 * which people signed in from which cookie. Two different people on one cookie
 * is a strong signal for multiple-account detection (6.1), which flags it for
 * review and never blocks anything.
 *
 * What it can't see: someone who clears cookies, uses a private window or
 * another browser gets a new id. A real fingerprint (canvas, fonts, hardware)
 * catches more but is a vendor / privacy decision — see docs/deferred-items.md.
 */
export const DEVICE_COOKIE = "estin_did";
export const DEVICE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365 * 2;

const VALID_ID = /^[A-Za-z0-9_-]{32}$/;

/** Reuses the browser's existing id if it is well-formed, otherwise mints a new one. Anything else in the cookie is ignored. */
export function resolveDeviceId(existing: string | undefined | null): { id: string; isNew: boolean } {
  if (existing && VALID_ID.test(existing)) return { id: existing, isNew: false };
  return { id: randomBytes(24).toString("base64url"), isNew: true };
}

/** Stored hashed, so the database alone can't be used to impersonate a device. */
export const deviceHash = (id: string) => hashFingerprint(`device:${id}`);

/** Notes that `personId` signed in from this device, then re-checks them for links. Never throws. */
export async function recordDevice(input: { personId: string; deviceId: string; ipAddress: string; userAgent: string | null }) {
  try {
    const hash = deviceHash(input.deviceId);
    await db.deviceSighting.upsert({
      where: { personId_deviceHash: { personId: input.personId, deviceHash: hash } },
      create: { personId: input.personId, deviceHash: hash, ipAddress: input.ipAddress, userAgent: input.userAgent?.slice(0, 300) ?? null },
      update: { lastSeenAt: new Date(), ipAddress: input.ipAddress, userAgent: input.userAgent?.slice(0, 300) ?? null, seenCount: { increment: 1 } },
    });
    await scanPerson(input.personId);
  } catch (err) {
    console.error("[devices] could not record device for", input.personId, err);
  }
}

export async function devicesForPerson(personId: string) {
  const mine = await db.deviceSighting.findMany({ where: { personId }, orderBy: { lastSeenAt: "desc" } });
  const hashes = mine.map((d) => d.deviceHash);
  const shared = hashes.length
    ? await db.deviceSighting.findMany({ where: { deviceHash: { in: hashes }, personId: { not: personId } }, select: { deviceHash: true, personId: true } })
    : [];
  return mine.map((d) => ({
    id: d.id,
    userAgent: d.userAgent,
    ipAddress: d.ipAddress,
    firstSeenAt: d.firstSeenAt,
    lastSeenAt: d.lastSeenAt,
    seenCount: d.seenCount,
    sharedWithPeople: new Set(shared.filter((s) => s.deviceHash === d.deviceHash).map((s) => s.personId)).size,
  }));
}
