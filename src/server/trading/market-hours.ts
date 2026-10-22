/**
 * Is a market open at a given moment? Pure. A market's hours are a list of weekly
 * windows in minutes since Sunday 00:00 UTC, [start, end): so Friday 21:00 UTC is
 * 5 * 1440 + 21 * 60. An empty list means "no schedule known", which counts as closed
 * (an instrument with no schedule cannot be traded).
 *
 * These windows are an approximation kept in the Instrument table. The provider's
 * own opening times (and daylight-saving shifts) should be checked before relying
 * on them; the price-staleness check is a second line of defence.
 */
export function minutesIntoWeek(at: Date): number {
  return at.getUTCDay() * 1440 + at.getUTCHours() * 60 + at.getUTCMinutes();
}

export function isMarketOpen(sessions: readonly [number, number][], at: Date): boolean {
  const m = minutesIntoWeek(at);
  return sessions.some(([start, end]) => m >= start && m < end);
}

/** The next moment the market opens after `at` (null if it never does). Used for "opens Sunday 22:00" style messages. */
export function nextOpen(sessions: readonly [number, number][], at: Date): Date | null {
  if (sessions.length === 0) return null;
  if (isMarketOpen(sessions, at)) return at;
  const m = minutesIntoWeek(at);
  const week = 7 * 1440;
  let best: number | null = null;
  for (const [start] of sessions) {
    const wait = start > m ? start - m : start + week - m;
    if (best === null || wait < best) best = wait;
  }
  const startOfMinute = new Date(Math.floor(at.getTime() / 60000) * 60000);
  return best === null ? null : new Date(startOfMinute.getTime() + best * 60000);
}
