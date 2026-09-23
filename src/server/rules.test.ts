import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { evaluateAccount, type RuleInputs } from "./rules";

const { Decimal } = Prisma;
const d = (n: number) => new Decimal(n);

// 50,000 account, 10% target, 5% daily loss, 10% max loss — matches the
// launch rulebook in docs/decisions.md.
function baseInputs(overrides: Partial<RuleInputs> = {}): RuleInputs {
  return {
    accountSize: d(50000),
    equity: d(50000),
    dayStartEquity: d(50000),
    peakEquity: d(50000),
    tradingDays: 5,
    profitTargetPct: d(10),
    dailyLossPct: d(5),
    maxLossPct: d(10),
    drawdownType: "trailing",
    minTradingDays: 3,
    ...overrides,
  };
}

describe("evaluateAccount — daily loss", () => {
  it("does not breach when daily loss is under the cap", () => {
    const r = evaluateAccount(baseInputs({ equity: d(47501), dayStartEquity: d(50000) })); // 2499 used, cap 2500
    expect(r.breachedDaily).toBe(false);
  });

  it("breaches exactly at the cap", () => {
    const r = evaluateAccount(baseInputs({ equity: d(47500), dayStartEquity: d(50000) })); // 2500 used, cap 2500
    expect(r.breachedDaily).toBe(true);
  });

  it("breaches when over the cap", () => {
    const r = evaluateAccount(baseInputs({ equity: d(47000), dayStartEquity: d(50000) })); // 3000 used, cap 2500
    expect(r.breachedDaily).toBe(true);
  });

  it("floors used loss at zero when equity is above day-start (no negative loss)", () => {
    const r = evaluateAccount(baseInputs({ equity: d(51000), dayStartEquity: d(50000) }));
    expect(r.dailyLossUsed.toNumber()).toBe(0);
    expect(r.breachedDaily).toBe(false);
  });
});

describe("evaluateAccount — max loss, trailing drawdown", () => {
  it("measures from peak equity, not account size", () => {
    // Account grew to 55,000 (new peak), then dropped to 50,500.
    // Trailing loss used = 55000 - 50500 = 4500, cap = 10% of 50000 = 5000.
    const r = evaluateAccount(
      baseInputs({ equity: d(50500), peakEquity: d(55000), drawdownType: "trailing" }),
    );
    expect(r.totalLossUsed.toNumber()).toBe(4500);
    expect(r.breachedTotal).toBe(false);
  });

  it("breaches exactly at the cap measured from peak", () => {
    const r = evaluateAccount(
      baseInputs({ equity: d(50000), peakEquity: d(55000), drawdownType: "trailing" }),
    ); // 5000 used, cap 5000
    expect(r.breachedTotal).toBe(true);
  });

  it("breaches when over the cap", () => {
    const r = evaluateAccount(
      baseInputs({ equity: d(49000), peakEquity: d(55000), drawdownType: "trailing" }),
    );
    expect(r.breachedTotal).toBe(true);
  });
});

describe("evaluateAccount — max loss, static drawdown", () => {
  it("measures from account size, ignoring peak equity", () => {
    // Even though peak reached 55,000, static drawdown only cares about
    // the fixed account size floor: 50000 - 45001 = 4999 < cap 5000.
    const r = evaluateAccount(
      baseInputs({ equity: d(45001), peakEquity: d(55000), drawdownType: "static" }),
    );
    expect(r.totalLossUsed.toNumber()).toBe(4999);
    expect(r.breachedTotal).toBe(false);
  });

  it("breaches exactly at the cap", () => {
    const r = evaluateAccount(
      baseInputs({ equity: d(45000), peakEquity: d(55000), drawdownType: "static" }),
    ); // 5000 used, cap 5000
    expect(r.breachedTotal).toBe(true);
  });
});

describe("evaluateAccount — profit target", () => {
  it("does not pass when pnl is under target", () => {
    const r = evaluateAccount(baseInputs({ equity: d(54999), tradingDays: 5 })); // pnl 4999 < target 5000
    expect(r.hitTarget).toBe(false);
  });

  it("passes exactly at target with enough trading days", () => {
    const r = evaluateAccount(baseInputs({ equity: d(55000), tradingDays: 3 })); // pnl 5000 == target 5000
    expect(r.hitTarget).toBe(true);
  });

  it("does not pass if target is met but minimum trading days are not", () => {
    const r = evaluateAccount(baseInputs({ equity: d(56000), tradingDays: 2 })); // pnl over target, days short
    expect(r.hitTarget).toBe(false);
  });

  it("never passes a phase with no profit target (funded stage)", () => {
    const r = evaluateAccount(baseInputs({ equity: d(999999), profitTargetPct: null }));
    expect(r.profitTarget).toBeNull();
    expect(r.hitTarget).toBe(false);
  });
});

describe("evaluateAccount — combined conditions", () => {
  it("can flag both daily and total breach on the same tick", () => {
    const r = evaluateAccount(
      baseInputs({
        equity: d(44000),
        dayStartEquity: d(50000),
        peakEquity: d(50000),
        drawdownType: "trailing",
      }),
    );
    expect(r.breachedDaily).toBe(true);
    expect(r.breachedTotal).toBe(true);
  });

  it("a breach and a target hit are independent — both can be true in the same evaluation", () => {
    // Target met on this tick, but so is a daily-loss breach from a wild
    // intraday swing. The caller (pending tasks) treats breach as taking
    // priority, but the pure evaluation itself doesn't hide either fact.
    const r = evaluateAccount(
      baseInputs({ equity: d(55000), dayStartEquity: d(58000), tradingDays: 5 }),
    );
    expect(r.hitTarget).toBe(true);
    expect(r.breachedDaily).toBe(true);
  });
});
