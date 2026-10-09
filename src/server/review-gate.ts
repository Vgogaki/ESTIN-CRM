/**
 * Optional password gate in front of the WHOLE site, for a review/staging
 * host (docs/hosting-review.md). The system has not had its independent
 * security review yet (build plan Part 1), so a review copy must not be
 * reachable by strangers or bots. Before anyone sees even a login page the
 * browser asks for a shared username and password; the app's own logins still
 * apply behind it.
 *
 *   REVIEW_GATE=on            switches it on (off/unset locally: no effect)
 *   REVIEW_GATE_USER / REVIEW_GATE_PASSWORD   the shared credentials
 *
 * Fails CLOSED: switched on with a missing username or password, every request
 * is refused (503) instead of letting the site through.
 */
export type GateDecision = "allow" | "challenge" | "misconfigured";

/** Compares without bailing at the first difference, so response time doesn't leak how much of a guess was right. */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function checkBasicAuth(header: string | null, user: string, pass: string): boolean {
  if (!header || !header.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  const split = decoded.indexOf(":");
  if (split < 0) return false;
  // Both are always evaluated, so a wrong username takes as long as a wrong password.
  const userOk = constantTimeEqual(decoded.slice(0, split), user);
  const passOk = constantTimeEqual(decoded.slice(split + 1), pass);
  return userOk && passOk;
}

/** The only path left open: the host's "is it alive" check. It reveals nothing and touches no data. */
export const HEALTH_PATH = "/api/health";

export function gateDecision(input: {
  enabled: boolean;
  user: string | undefined;
  pass: string | undefined;
  header: string | null;
  pathname: string;
}): GateDecision {
  if (!input.enabled) return "allow";
  if (input.pathname === HEALTH_PATH) return "allow";
  if (!input.user || !input.pass) return "misconfigured";
  return checkBasicAuth(input.header, input.user, input.pass) ? "allow" : "challenge";
}
