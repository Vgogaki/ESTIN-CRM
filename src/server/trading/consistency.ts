import { Prisma } from "@prisma/client";

/**
 * The "best day" consistency rule (docs/decisions.md, launch rules): for payout
 * eligibility, the best single day's profit must be no more than a set percentage
 * (50) of the total profit made on all profitable days. It stops one lucky day
 * carrying an account. Pure.
 *
 * How the rule is stored on a challenge phase (its `consistencyRule` JSON):
 *   { "type": "best_day", "maxPct": 50 }
 * Anything else is not recognised and is not enforced (and is reported as such).
 *
 * PLACEHOLDERS to confirm: the days counted are the UTC days of the current phase's
 * closed trades; a day's profit is the sum of its trades' profit after commission;
 * a loss-making day does not count towards the total.
 */
export type BestDayRule = { maxPct: Prisma.Decimal };

export function parseConsistencyRule(raw: unknown): BestDayRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { type?: unknown; maxPct?: unknown };
  if (r.type !== "best_day") return null;
  if (typeof r.maxPct !== "number" && typeof r.maxPct !== "string") return null;
  try {
    const maxPct = new Prisma.Decimal(r.maxPct);
    return maxPct.greaterThan(0) && maxPct.lessThanOrEqualTo(100) ? { maxPct } : null;
  } catch {
    return null;
  }
}

/** Net profit per UTC day, keyed "YYYY-MM-DD". */
export function dailyNetProfits(trades: { closedAt: Date; netPnl: Prisma.Decimal }[]): Map<string, Prisma.Decimal> {
  const days = new Map<string, Prisma.Decimal>();
  for (const t of trades) {
    const key = t.closedAt.toISOString().slice(0, 10);
    days.set(key, (days.get(key) ?? new Prisma.Decimal(0)).plus(t.netPnl));
  }
  return days;
}

export type BestDayCheck = {
  ok: boolean;
  bestDay: Prisma.Decimal;
  totalPositive: Prisma.Decimal;
  /** Best day as a percentage of the total of profitable days; null when there is no profit at all. */
  pct: Prisma.Decimal | null;
};

export function checkBestDay(dailyProfits: Prisma.Decimal[], rule: BestDayRule): BestDayCheck {
  const positive = dailyProfits.filter((p) => p.greaterThan(0));
  const totalPositive = positive.reduce((s, p) => s.plus(p), new Prisma.Decimal(0));
  if (totalPositive.isZero()) return { ok: true, bestDay: new Prisma.Decimal(0), totalPositive, pct: null }; // nothing to be inconsistent about
  const bestDay = positive.reduce((m, p) => (p.greaterThan(m) ? p : m), new Prisma.Decimal(0));
  const pct = bestDay.dividedBy(totalPositive).times(100);
  return { ok: pct.lessThanOrEqualTo(rule.maxPct), bestDay, totalPositive, pct };
}
