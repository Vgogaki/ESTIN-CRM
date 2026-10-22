import { Prisma } from "@prisma/client";

/**
 * The trading day, as decided (docs/decisions.md): it rolls over at MIDNIGHT UTC, and
 * a trading day is any calendar (UTC) day on which at least one trade was closed.
 * Pure, so the boundaries are tested exactly.
 */

/** Midnight UTC at the start of the day `at` falls in. */
export function utcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

export function sameUtcDay(a: Date | null | undefined, b: Date): boolean {
  return !!a && utcDay(a).getTime() === utcDay(b).getTime();
}

/** Has the daily reset not yet run for `now`'s UTC day? */
export function needsRollover(lastRolloverOn: Date | null | undefined, now: Date): boolean {
  return !lastRolloverOn || utcDay(lastRolloverOn).getTime() < utcDay(now).getTime();
}

/**
 * What the daily reset sets. The equity passed in must be the last equity of the
 * PREVIOUS day (the account's stored equity, from before the first price of the new
 * day), so that:
 *  - the daily loss limit is measured from where the day started, and
 *  - the trailing maximum-loss floor only rises at the end of a day: the
 *    high-water mark is the best END-OF-DAY equity, never an intraday peak.
 */
export function rolloverValues(input: { equity: Prisma.Decimal; peakEquity: Prisma.Decimal }): { dayStartEquity: Prisma.Decimal; peakEquity: Prisma.Decimal } {
  return {
    dayStartEquity: input.equity,
    peakEquity: input.equity.greaterThan(input.peakEquity) ? input.equity : input.peakEquity,
  };
}

/** Does closing a trade at `closedAt` add a new trading day? Only the first close of each UTC day counts. */
export function isNewTradingDay(lastTradingDayOn: Date | null | undefined, closedAt: Date): boolean {
  return !sameUtcDay(lastTradingDayOn, closedAt);
}
