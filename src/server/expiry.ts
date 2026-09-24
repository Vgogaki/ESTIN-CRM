/**
 * Module 3.5 — "a scheduled job runs regularly and closes any account
 * whose phase time limit has passed without a pass"
 * (modules-to-design.md §3.5). Pure date math, no DB access, tested the
 * same way as the rules engine (src/server/rules.ts). The deadline is
 * `phaseStartedAt + timeLimitDays`, using whole UTC calendar days per
 * CLAUDE.md's "all timestamps in UTC" rule — the exact trading-day
 * rollover reference is still an open decision (docs/decisions.md #2),
 * but calendar-day arithmetic here doesn't depend on that.
 */
export type ExpiryInput = {
  timeLimitDays: number | null;
  phaseStartedAt: Date;
  now: Date;
};

function deadline(phaseStartedAt: Date, timeLimitDays: number): Date {
  const d = new Date(phaseStartedAt);
  d.setUTCDate(d.getUTCDate() + timeLimitDays);
  return d;
}

/** A phase with no time limit never expires. */
export function isPhaseExpired(input: ExpiryInput): boolean {
  if (input.timeLimitDays === null) return false;
  return input.now.getTime() >= deadline(input.phaseStartedAt, input.timeLimitDays).getTime();
}

/** Whole days left until the deadline, floored at 0. Null when there's no limit. */
export function daysRemaining(input: ExpiryInput): number | null {
  if (input.timeLimitDays === null) return null;
  const msRemaining = deadline(input.phaseStartedAt, input.timeLimitDays).getTime() - input.now.getTime();
  return Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
}
