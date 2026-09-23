import { Prisma } from "@prisma/client";

const { Decimal } = Prisma;
type D = InstanceType<typeof Decimal>;

/**
 * Pure evaluation of one account against its current challenge phase's
 * rules — see docs/crm-specification.md §4.2/§4.3. No side effects, no
 * database access: reused by the trader detail meters and the pending
 * tasks queue, and will be the same math the real rules engine (Phase 3)
 * runs automatically once the equity feed exists. Manual "simulate
 * account state" edits in the back office are what feed this until then.
 */
export type RuleInputs = {
  accountSize: D;
  equity: D;
  dayStartEquity: D;
  peakEquity: D;
  tradingDays: number;
  profitTargetPct: D | null;
  dailyLossPct: D;
  maxLossPct: D;
  drawdownType: "trailing" | "static";
  minTradingDays: number;
};

export type RuleEvaluation = {
  pnl: D;
  profitTarget: D | null;
  dailyLossCap: D;
  maxLossCap: D;
  dailyLossUsed: D;
  totalLossUsed: D;
  breachedDaily: boolean;
  breachedTotal: boolean;
  hitTarget: boolean;
};

const zero = new Decimal(0);
const max0 = (v: D) => (v.lessThan(zero) ? zero : v);

export function evaluateAccount(input: RuleInputs): RuleEvaluation {
  const pnl = input.equity.minus(input.accountSize);
  const profitTarget = input.profitTargetPct
    ? input.accountSize.times(input.profitTargetPct).dividedBy(100)
    : null;
  const dailyLossCap = input.accountSize.times(input.dailyLossPct).dividedBy(100);
  const maxLossCap = input.accountSize.times(input.maxLossPct).dividedBy(100);

  const dailyLossUsed = max0(input.dayStartEquity.minus(input.equity));
  const totalLossUsed =
    input.drawdownType === "trailing"
      ? max0(input.peakEquity.minus(input.equity))
      : max0(input.accountSize.minus(input.equity));

  const breachedDaily = dailyLossUsed.greaterThanOrEqualTo(dailyLossCap);
  const breachedTotal = totalLossUsed.greaterThanOrEqualTo(maxLossCap);
  const hitTarget = Boolean(
    profitTarget &&
      pnl.greaterThanOrEqualTo(profitTarget) &&
      input.tradingDays >= input.minTradingDays,
  );

  return {
    pnl,
    profitTarget,
    dailyLossCap,
    maxLossCap,
    dailyLossUsed,
    totalLossUsed,
    breachedDaily,
    breachedTotal,
    hitTarget,
  };
}
