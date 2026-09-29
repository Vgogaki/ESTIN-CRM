import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { lookupCountry } from "@/server/geoip";
import { raiseSystemFlag } from "@/server/risk";

/**
 * Module 6.5 — flags a trader whose recent login IPs consistently resolve to
 * a country different from the one on file. There is no separate KYC-document
 * country field (see countries.ts); "the country on file" is Person.country,
 * the same one 6.3's country rules check. The spec also mentions *trading*
 * IPs — not checked, because there is no trading platform yet (3.3) to
 * generate them.
 *
 * This depends entirely on geoip.ts resolving an IP to a country, which
 * depends on a provider nobody has chosen yet (GEOIP_DRIVER=off by default —
 * see deferred-items.md). With no provider configured every login resolves to
 * "unknown" and this never fires; wiring one in later needs no code change here.
 *
 * The history of resolved countries lives in the (append-only) audit log, not
 * on TraderSession: a trader who signs out has that session row deleted
 * (destroyTraderSession), which would otherwise silently erase the very
 * pattern this module exists to notice.
 */
export const RECENT_LOGIN_WINDOW = 5;
export const MIN_MISMATCH_SAMPLES = 3;
const RESOLVED_ACTION = "person.login_ip_resolved";

/**
 * Pure: true only once there are enough *resolved* recent logins (unresolved
 * ones don't count either way) and every single one differs from home — a
 * one-off trip abroad should never trip this, only a sustained pattern.
 */
export function hasConsistentMismatch(homeCountry: string, recentCountries: readonly string[]): boolean {
  if (recentCountries.length < MIN_MISMATCH_SAMPLES) return false;
  const home = homeCountry.trim().toUpperCase();
  return recentCountries.every((c) => c.trim().toUpperCase() !== home);
}

/**
 * Called after a trader login. Resolves the login IP's country (best-effort)
 * and, only if resolved, records it in the audit log, then re-checks the
 * pattern. Deliberately not awaited by the caller and never throws — a login
 * must never wait on, or fail because of, a third-party lookup.
 */
export async function noteLoginIp(input: { personId: string; ipAddress: string; homeCountry: string }): Promise<void> {
  try {
    const country = await lookupCountry(input.ipAddress);
    if (country) {
      await writeAuditLog({
        actorType: "trader",
        actorId: input.personId,
        action: RESOLVED_ACTION,
        entityType: "Person",
        entityId: input.personId,
        after: { ipCountry: country, ipAddress: input.ipAddress },
      });
    }

    const resolved = await recentLoginCountries(input.personId);
    if (!hasConsistentMismatch(input.homeCountry, resolved)) return;

    await raiseSystemFlag({
      personId: input.personId,
      type: "ip_country_mismatch",
      summary: `Recent sign-ins consistently resolve to a country different from the one on file (${input.homeCountry.toUpperCase()}): ${[...new Set(resolved)].join(", ")}.`,
      dedupeKey: `ip_mismatch:${input.personId}`,
    });
  } catch (err) {
    console.error("[login-geo] could not check IP country for", input.personId, err);
  }
}

/** Most recent resolved login countries, most recent first — used for both the pattern check and the trader page's context line. */
export async function recentLoginCountries(personId: string): Promise<string[]> {
  const rows = await db.auditLog.findMany({
    where: { actorType: "trader", actorId: personId, action: RESOLVED_ACTION },
    orderBy: { timestamp: "desc" },
    take: RECENT_LOGIN_WINDOW,
    select: { after: true },
  });
  return rows
    .map((r) => (r.after as { ipCountry?: string } | null)?.ipCountry)
    .filter((c): c is string => typeof c === "string");
}
