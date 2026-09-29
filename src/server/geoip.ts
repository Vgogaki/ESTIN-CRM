/**
 * IP address -> country resolution. Part of module 6.5 ("checked against KYC
 * country, billing country, and IP geolocation" — modules-to-design.md
 * §6.1–6.5). No geolocation provider has been chosen (docs/deferred-items.md),
 * so — like transactional email (4.5) — this is a pluggable driver rather
 * than a hard dependency:
 *
 *   GEOIP_DRIVER=off   (default) — no lookup is attempted; every IP is unknown
 *   GEOIP_DRIVER=http           — GET GEOIP_API_URL with the literal text
 *                                 "{ip}" replaced by the address; the
 *                                 response body must be a bare two-letter
 *                                 country code (the "country code only"
 *                                 endpoint most IP geolocation APIs offer,
 *                                 e.g. ipapi.co/{ip}/country/)
 *
 * Never throws: a lookup failing must never block a login. No package is
 * needed for this — it's a single GET request with the runtime's own fetch.
 */
export type GeoipDriver = "off" | "http";

export function geoipDriver(): GeoipDriver {
  return process.env.GEOIP_DRIVER === "http" ? "http" : "off";
}

const LOOKUP_TIMEOUT_MS = 3000;

/** Addresses that identify no one — never worth sending to a provider. */
const IGNORED_IPS = new Set(["", "unknown", "::1", "127.0.0.1"]);

/** Pure: validates and normalises whatever text a provider sent back. */
export function parseCountryCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export async function lookupCountry(ip: string): Promise<string | null> {
  if (geoipDriver() !== "http" || IGNORED_IPS.has(ip)) return null;
  const template = process.env.GEOIP_API_URL;
  if (!template) return null;
  try {
    const res = await fetch(template.replace("{ip}", encodeURIComponent(ip)), {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return parseCountryCode(await res.text());
  } catch (err) {
    console.error("[geoip] lookup failed for", ip, err);
    return null;
  }
}
