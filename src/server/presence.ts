/**
 * How the sidebar's "Team" panel describes a staff member. Pure (no database),
 * so the browser can use it to keep the labels fresh between refreshes.
 *
 * "Active" means they last *did something* (opened a page, used the app), not
 * that a session exists: a sign-in lasts up to 12 hours, so "signed in" would
 * say someone is here long after they walked away.
 */
export const ONLINE_WINDOW_MS = 3 * 60_000; // activity is recorded at most once a minute, so 3 minutes of slack

export type PresenceState = "online" | "recent" | "away" | "never";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function presenceState(lastActiveAt: Date | null, now: Date): PresenceState {
  if (!lastActiveAt) return "never";
  // A timestamp slightly in the future (clocks differ a little) counts as "now".
  const age = now.getTime() - lastActiveAt.getTime();
  if (age <= ONLINE_WINDOW_MS) return "online";
  return age < HOUR ? "recent" : "away";
}

export function presenceLabel(lastActiveAt: Date | null, now: Date): string {
  if (!lastActiveAt) return "Not signed in yet";
  const age = now.getTime() - lastActiveAt.getTime();
  if (age <= ONLINE_WINDOW_MS) return "Active now";
  if (age < HOUR) return `Active ${Math.floor(age / MINUTE)} min ago`;
  if (age < DAY) return `Active ${Math.floor(age / HOUR)} h ago`;
  const days = Math.floor(age / DAY);
  return `Last seen ${days} day${days === 1 ? "" : "s"} ago`;
}
