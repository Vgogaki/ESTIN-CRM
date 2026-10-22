import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  accountSnapshot,
  closeOutcome,
  effectiveLeverage,
  entryPrice,
  exitPrice,
  floatingPnl,
  pnlInQuoteCurrency,
  prepareMarketOrder,
  requiredMargin,
  stopLevelProblem,
  stopTrigger,
  type OpenPosition,
} from "./engine";
import { converterTo } from "./fx";
import { DEFAULT_INSTRUMENTS, specFrom, type InstrumentSpec } from "./instruments";

const d = (v: string | number) => new Prisma.Decimal(v);
const spec = (symbol: string, over: Partial<InstrumentSpec> = {}): InstrumentSpec => {
  const s = DEFAULT_INSTRUMENTS.find((i) => i.symbol === symbol)!;
  return { ...specFrom(s), ...over };
};

// Round, easy numbers: EURUSD 1.25, USDJPY 150, GBPUSD 1.5. A EUR account.
const MIDS = { EURUSD: d("1.25"), USDJPY: d("150"), GBPUSD: d("1.5") };
const toEur = converterTo("EUR", MIDS);

// A Tuesday midday UTC: every market in the default set is open.
const OPEN_TIME = new Date("2026-10-20T12:00:00Z");

const pos = (over: Partial<OpenPosition> = {}): OpenPosition => ({
  id: "p1",
  symbol: "EURUSD",
  side: "buy",
  lots: d("1"),
  openPrice: d("1.25"),
  stopLoss: null,
  takeProfit: null,
  marginUsed: d("1000"),
  ...over,
});

describe("buying and selling prices", () => {
  const q = { bid: d("1.2499"), ask: d("1.2501") };
  it("a buy fills at the ask and is valued at the bid; a sell the reverse", () => {
    expect(entryPrice("buy", q).toString()).toBe("1.2501");
    expect(entryPrice("sell", q).toString()).toBe("1.2499");
    expect(exitPrice("buy", q).toString()).toBe("1.2499");
    expect(exitPrice("sell", q).toString()).toBe("1.2501");
  });
  it("so a trade opened and closed at once loses the spread", () => {
    const s = spec("EURUSD");
    const open = entryPrice("buy", q);
    const pnl = pnlInQuoteCurrency("buy", open, exitPrice("buy", q), d("1"), s);
    expect(pnl.toString()).toBe("-20"); // 0.0002 x 100,000 = 20 USD
  });
});

describe("profit and loss", () => {
  it("a long position gains when price rises: 1 lot EURUSD, +100 pips = 1,000 USD = 800 EUR at 1.25", () => {
    const p = pos({ openPrice: d("1.2500") });
    expect(floatingPnl(p, spec("EURUSD"), { bid: d("1.2600"), ask: d("1.2602") }, toEur).toString()).toBe("800");
  });
  it("a short position gains when price falls (valued at the ask)", () => {
    const p = pos({ side: "sell", openPrice: d("1.2500") });
    // closes at the ask 1.2402: (1.2500 - 1.2402) = 0.0098 x 100,000 = 980 USD = 784 EUR
    expect(floatingPnl(p, spec("EURUSD"), { bid: d("1.2400"), ask: d("1.2402") }, toEur).toString()).toBe("784");
  });
  it("converts a JPY-quoted profit: short 1 lot USDJPY, 150.000 -> 149.500 = 50,000 JPY = 266.67 EUR", () => {
    const p = pos({ symbol: "USDJPY", side: "sell", openPrice: d("150.000") });
    expect(floatingPnl(p, spec("USDJPY"), { bid: d("149.498"), ask: d("149.500") }, toEur).toString()).toBe("266.67");
  });
  it("converts a GBP-quoted profit (UK100, 1 lot = 1 GBP per point): +10 points = 10 GBP = 12 EUR at GBPUSD 1.5 / EURUSD 1.25", () => {
    const p = pos({ symbol: "UK100", side: "buy", openPrice: d("8500.0"), lots: d("1") });
    expect(floatingPnl(p, spec("UK100"), { bid: d("8510.0"), ask: d("8511.2") }, toEur).toString()).toBe("12");
  });
  it("rounds to the cent, half up, with no floating-point drift", () => {
    const p = pos({ lots: d("0.01"), openPrice: d("1.25000") });
    // 0.01 lot, +0.00001 move: 1000 x 0.00001 = 0.01 USD -> 0.008 EUR -> 0.01 (half up)
    expect(floatingPnl(p, spec("EURUSD"), { bid: d("1.25001"), ask: d("1.25003") }, toEur).toString()).toBe("0.01");
  });
});

describe("margin and leverage", () => {
  it("uses the lower of the account cap and the instrument limit", () => {
    expect(effectiveLeverage(100, spec("EURUSD"))).toBe(100);
    expect(effectiveLeverage(30, spec("EURUSD"))).toBe(30);
    expect(effectiveLeverage(500, spec("EURUSD", { maxLeverage: 50 }))).toBe(50);
    expect(effectiveLeverage(0, spec("EURUSD"))).toBe(1);
  });
  it("1 lot EURUSD at 1.25 with 1:100 needs 1,000.00 EUR", () => {
    expect(requiredMargin(d("1"), d("1.25"), spec("EURUSD"), 100, toEur).toString()).toBe("1000");
  });
  it("is rounded UP to the cent, never down", () => {
    // 100,000 EUR / 30 = 3,333.333...
    expect(requiredMargin(d("1"), d("1.25"), spec("EURUSD"), 30, toEur).toString()).toBe("3333.34");
  });
  it("scales with lot size and with the price of an index", () => {
    // 2 lots of UK100 at 8,500: 2 x 1 x 8,500 = 17,000 GBP = 20,400 EUR (x 1.5/1.25) / 100 = 204
    expect(requiredMargin(d("2"), d("8500"), spec("UK100"), 100, toEur).toString()).toBe("204");
  });
});

describe("account snapshot", () => {
  const specs = { EURUSD: spec("EURUSD"), USDJPY: spec("USDJPY") };
  it("is just the balance when nothing is open", () => {
    const s = accountSnapshot({ balance: d("50000"), positions: [], specs, quotes: {}, convert: toEur });
    expect(s).toMatchObject({ equity: d("50000"), floatingPnl: d("0"), usedMargin: d("0"), freeMargin: d("50000") });
  });
  it("equity is balance plus every open position's floating profit", () => {
    const positions = [
      pos({ id: "a", openPrice: d("1.2500"), marginUsed: d("1000") }), // +800 EUR at bid 1.2600
      pos({ id: "b", symbol: "USDJPY", side: "sell", openPrice: d("150.000"), marginUsed: d("800") }), // +266.67
    ];
    const s = accountSnapshot({
      balance: d("50000"),
      positions,
      specs,
      quotes: { EURUSD: { bid: d("1.2600"), ask: d("1.2602") }, USDJPY: { bid: d("149.498"), ask: d("149.500") } },
      convert: toEur,
    });
    expect(s.floatingPnl.toString()).toBe("1066.67");
    expect(s.equity.toString()).toBe("51066.67");
    expect(s.usedMargin.toString()).toBe("1800");
    expect(s.freeMargin.toString()).toBe("49266.67");
  });
  it("refuses to value an account when a price is missing, instead of guessing", () => {
    expect(() => accountSnapshot({ balance: d("100"), positions: [pos()], specs, quotes: {}, convert: toEur })).toThrow(/No price/);
  });
});

describe("prepareMarketOrder", () => {
  const base = () => ({
    side: "buy" as const,
    lots: d("1"),
    stopLoss: null,
    takeProfit: null,
    spec: spec("EURUSD"),
    quote: { bid: d("1.24998"), ask: d("1.25000") },
    now: OPEN_TIME,
    equity: d("50000"),
    usedMargin: d("0"),
    openPositionCount: 0,
    maxOpenPositions: 20,
    accountLeverageCap: 100,
    convert: toEur,
  });

  it("accepts a good order and says where it fills and what margin it uses", () => {
    const r = prepareMarketOrder(base());
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.fillPrice.toString()).toBe("1.25");
      expect(r.marginRequired.toString()).toBe("1000");
    }
  });
  it("refuses a disabled instrument", () => {
    expect(prepareMarketOrder({ ...base(), spec: spec("EURUSD", { enabled: false }) })).toMatchObject({ ok: false, code: "instrument_disabled" });
  });
  it("refuses when the market is closed (Saturday)", () => {
    expect(prepareMarketOrder({ ...base(), now: new Date("2026-10-24T12:00:00Z") })).toMatchObject({ ok: false, code: "market_closed" });
  });
  it("refuses a lot size that is too small, too big, or off the step", () => {
    expect(prepareMarketOrder({ ...base(), lots: d("0.005") })).toMatchObject({ ok: false, code: "bad_lots" });
    expect(prepareMarketOrder({ ...base(), lots: d("51") })).toMatchObject({ ok: false, code: "bad_lots" });
    expect(prepareMarketOrder({ ...base(), lots: d("0.015") })).toMatchObject({ ok: false, code: "bad_lots" });
  });
  it("refuses a stop-loss on the wrong side of the price, or too close", () => {
    expect(prepareMarketOrder({ ...base(), stopLoss: d("1.2600") })).toMatchObject({ ok: false, code: "bad_stop_loss" }); // buy with SL above
    expect(prepareMarketOrder({ ...base(), stopLoss: d("1.24990") })).toMatchObject({ ok: false, code: "bad_stop_loss" }); // inside minimum distance
    expect(prepareMarketOrder({ ...base(), stopLoss: d("1.2400") })).toMatchObject({ ok: true });
    expect(prepareMarketOrder({ ...base(), side: "sell", stopLoss: d("1.2400") })).toMatchObject({ ok: false, code: "bad_stop_loss" });
  });
  it("refuses a take-profit on the wrong side", () => {
    expect(prepareMarketOrder({ ...base(), takeProfit: d("1.2400") })).toMatchObject({ ok: false, code: "bad_take_profit" });
    expect(prepareMarketOrder({ ...base(), takeProfit: d("1.2600") })).toMatchObject({ ok: true });
    expect(prepareMarketOrder({ ...base(), side: "sell", takeProfit: d("1.2400") })).toMatchObject({ ok: true });
  });
  it("refuses a zero or negative level", () => {
    expect(prepareMarketOrder({ ...base(), stopLoss: d("0") })).toMatchObject({ ok: false, code: "bad_stop_loss" });
    expect(prepareMarketOrder({ ...base(), takeProfit: d("-1") })).toMatchObject({ ok: false, code: "bad_take_profit" });
  });
  it("refuses when there isn't enough free margin, exactly at the limit", () => {
    // 1 lot needs 1,000. Free margin 999.99 -> refused; 1,000.00 -> allowed.
    expect(prepareMarketOrder({ ...base(), equity: d("999.99") })).toMatchObject({ ok: false, code: "insufficient_margin" });
    expect(prepareMarketOrder({ ...base(), equity: d("1000.00") })).toMatchObject({ ok: true });
    expect(prepareMarketOrder({ ...base(), equity: d("1500"), usedMargin: d("600") })).toMatchObject({ ok: false, code: "insufficient_margin" });
  });
  it("refuses too many open positions", () => {
    expect(prepareMarketOrder({ ...base(), openPositionCount: 20 })).toMatchObject({ ok: false, code: "too_many_positions" });
  });
  it("a lower account leverage cap needs more margin", () => {
    const r = prepareMarketOrder({ ...base(), accountLeverageCap: 30 });
    expect(r.ok && r.marginRequired.toString()).toBe("3333.34");
  });
});

describe("stopLevelProblem (levels on an open position, measured from where it would close)", () => {
  const gap = d("0.0001");
  const bid = d("1.30000");
  it("accepts levels on the right side and far enough away, and accepts none", () => {
    expect(stopLevelProblem("buy", d("1.2900"), d("1.3200"), bid, gap)).toBeNull();
    expect(stopLevelProblem("buy", null, null, bid, gap)).toBeNull();
    expect(stopLevelProblem("sell", d("1.3100"), d("1.2800"), bid, gap)).toBeNull();
  });
  it("is exact at the minimum distance", () => {
    expect(stopLevelProblem("buy", d("1.2999"), null, bid, gap)).toBeNull();
    expect(stopLevelProblem("buy", d("1.29991"), null, bid, gap)).toMatchObject({ code: "bad_stop_loss" });
    expect(stopLevelProblem("buy", null, d("1.3001"), bid, gap)).toBeNull();
    expect(stopLevelProblem("buy", null, d("1.30009"), bid, gap)).toMatchObject({ code: "bad_take_profit" });
  });
  it("refuses the wrong side, for a buy and for a sell", () => {
    expect(stopLevelProblem("buy", d("1.3100"), null, bid, gap)).toMatchObject({ code: "bad_stop_loss" });
    expect(stopLevelProblem("buy", null, d("1.2800"), bid, gap)).toMatchObject({ code: "bad_take_profit" });
    expect(stopLevelProblem("sell", d("1.2900"), null, bid, gap)).toMatchObject({ code: "bad_stop_loss" });
    expect(stopLevelProblem("sell", null, d("1.3100"), bid, gap)).toMatchObject({ code: "bad_take_profit" });
  });
  it("refuses zero and negative levels", () => {
    expect(stopLevelProblem("buy", d("0"), null, bid, gap)).toMatchObject({ code: "bad_stop_loss" });
    expect(stopLevelProblem("sell", null, d("-1"), bid, gap)).toMatchObject({ code: "bad_take_profit" });
  });
});

describe("stop-loss and take-profit", () => {
  const q = (bid: string, ask: string) => ({ bid: d(bid), ask: d(ask) });
  it("a long is stopped on the BID reaching its stop, and takes profit on the bid reaching its target", () => {
    const p = pos({ side: "buy", stopLoss: d("1.2400"), takeProfit: d("1.2600") });
    expect(stopTrigger(p, q("1.2450", "1.2452"))).toBeNull();
    expect(stopTrigger(p, q("1.2400", "1.2402"))).toBe("stop_loss"); // exactly at the level counts
    expect(stopTrigger(p, q("1.2390", "1.2392"))).toBe("stop_loss");
    expect(stopTrigger(p, q("1.2600", "1.2602"))).toBe("take_profit");
  });
  it("a short is stopped on the ASK reaching its stop, and takes profit on the ask falling to its target", () => {
    const p = pos({ side: "sell", stopLoss: d("1.2600"), takeProfit: d("1.2400") });
    expect(stopTrigger(p, q("1.2498", "1.2500"))).toBeNull();
    expect(stopTrigger(p, q("1.2598", "1.2600"))).toBe("stop_loss");
    expect(stopTrigger(p, q("1.2398", "1.2400"))).toBe("take_profit");
  });
  it("the spread matters: a long's stop is checked against the bid, not the ask", () => {
    const p = pos({ side: "buy", stopLoss: d("1.2400") });
    expect(stopTrigger(p, q("1.24010", "1.24030"))).toBeNull(); // bid still above the stop
    expect(stopTrigger(p, q("1.23990", "1.24010"))).toBe("stop_loss"); // bid through the stop, ask still above it
  });
  it("a position with no stop or target never triggers", () => {
    expect(stopTrigger(pos(), q("1.0", "1.0001"))).toBeNull();
  });
});

describe("closing a position", () => {
  it("settles at the exit price, in euros, with commission taken off", () => {
    const s = spec("EURUSD", { commissionPerLot: d("7") });
    const p = pos({ lots: d("0.5"), openPrice: d("1.2500") });
    const c = closeOutcome(p, s, { bid: d("1.2600"), ask: d("1.2602") }, toEur);
    expect(c.closePrice.toString()).toBe("1.26");
    // 0.5 lot x 100,000 x 0.01 = 500 USD = 400 EUR; commission 7 x 0.5 = 3.50
    expect(c.grossPnl.toString()).toBe("400");
    expect(c.commission.toString()).toBe("3.5");
    expect(c.netPnl.toString()).toBe("396.5");
    expect(c.fxRate.toString()).toBe("0.8"); // 1 USD = 0.8 EUR at EURUSD 1.25
  });
  it("a losing short closes at the ask, and commission makes a loss bigger", () => {
    const p = pos({ side: "sell", openPrice: d("1.2500") });
    const c = closeOutcome(p, spec("EURUSD", { commissionPerLot: d("5") }), { bid: d("1.2598"), ask: d("1.2600") }, toEur);
    expect(c.closePrice.toString()).toBe("1.26");
    expect(c.grossPnl.toString()).toBe("-800"); // -0.01 x 100,000 = -1,000 USD = -800 EUR
    expect(c.netPnl.toString()).toBe("-805");
  });
  it("no commission by default", () => {
    const c = closeOutcome(pos(), spec("EURUSD"), { bid: d("1.2500"), ask: d("1.2502") }, toEur);
    expect(c.commission.toString()).toBe("0");
    expect(c.netPnl.toString()).toBe(c.grossPnl.toString());
  });
});
