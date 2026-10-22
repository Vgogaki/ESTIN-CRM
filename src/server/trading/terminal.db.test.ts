import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { createTestDatabase, type TestDatabase } from "@/test/test-database";

/**
 * What the trader's terminal screen is given: ownership, the live account state, the
 * chart candles built from stored prices, and the trade history. Run with `npm run test:db`.
 */

let testDb: TestDatabase;
let db: typeof import("@/server/db").db;
let ps: typeof import("@/server/trading/price-service");
let tr: typeof import("@/server/trading/trading");
let term: typeof import("@/server/trading/terminal");
let inst: typeof import("@/server/trading/instruments");

const IP = "203.0.113.9";
let n = 0;
const next = () => ++n;

let clock = new Date("2026-10-20T10:00:00Z");
const advance = (ms = 60_000) => (clock = new Date(clock.getTime() + ms));
const BASE = { EURUSD: 1.25, GBPUSD: 1.5, USDJPY: 150, XAUUSD: 2000, UK100: 8500, US30: 39000 };
type Mids = Partial<Record<keyof typeof BASE, number>>;

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.url;
  ({ db } = await import("@/server/db"));
  ps = await import("@/server/trading/price-service");
  tr = await import("@/server/trading/trading");
  term = await import("@/server/trading/terminal");
  inst = await import("@/server/trading/instruments");
  await ps.seedInstruments();
});

afterAll(async () => {
  await db?.$disconnect();
  await testDb?.drop();
});

async function quotesFor(mids: Mids, at: Date) {
  const specs = await ps.loadInstruments(db, { enabledOnly: true });
  return specs
    .filter((s) => mids[s.symbol as keyof typeof BASE] !== undefined)
    .map((s) => {
      const m = mids[s.symbol as keyof typeof BASE]!;
      const half = Number(inst.DEFAULT_INSTRUMENTS.find((i) => i.symbol === s.symbol)!.sampleSpread) / 2;
      return { symbol: s.symbol, bid: new Prisma.Decimal((m - half).toFixed(s.digits)), ask: new Prisma.Decimal((m + half).toFixed(s.digits)), quoteTs: at };
    });
}
async function feed(mids: Mids = BASE, at?: Date): Promise<Date> {
  const t1 = at ?? advance();
  await ps.ingestQuotes({ quotes: await quotesFor(mids, t1), source: "test", receivedAt: t1 });
  const t2 = new Date(t1.getTime() + 1000);
  await ps.ingestQuotes({ quotes: await quotesFor(mids, t2), source: "test", receivedAt: t2 });
  clock = t2;
  return t2;
}

async function makeAccount(o: { permitted?: string[]; phase?: "evaluation" | "funded" | "pass_review"; status?: "active" | "breached" } = {}) {
  const k = next();
  const ct = await db.challengeType.create({
    data: {
      familyId: `fam-${k}`, version: 1, name: `Challenge ${k}`, accountSize: 100000, fee: 500, leverageCap: 100,
      permittedInstruments: o.permitted ?? ["EURUSD", "GBPUSD", "USDJPY"], active: true,
      phases: { create: [{ order: 1, label: "Evaluation", isFunded: false, profitTargetPct: 8, dailyLossPct: 5, maxLossPct: 10, drawdownType: "trailing", minTradingDays: 0 }] },
    },
    include: { phases: true },
  });
  const person = await db.person.create({ data: { fullName: `Trader ${k}`, email: `t${k}@term.test`, country: "CY" } });
  const account = await db.account.create({
    data: { personId: person.id, challengeTypeId: ct.id, currentPhaseId: ct.phases[0].id, orderRef: `order-${k}`, phase: o.phase ?? "evaluation", status: o.status ?? "active", equity: 100000, balance: 100000, dayStartEquity: 100000, peakEquity: 100000 },
  });
  return { account, person };
}
const buy = (a: { account: { id: string }; person: { id: string } }, now: Date, lots = 1, extra: object = {}) =>
  tr.placeMarketOrder({ accountId: a.account.id, personId: a.person.id, symbol: "EURUSD", side: "buy", lots, ipAddress: IP, now, ...extra });

describe("which accounts appear in the terminal", () => {
  it("only the trader's own active accounts in evaluation or funded", async () => {
    const live = await makeAccount();
    const funded = await makeAccount({ phase: "funded" });
    const review = await makeAccount({ phase: "pass_review" });
    const breached = await makeAccount({ status: "breached" });
    const mine = await term.listTerminalAccounts(live.person.id);
    expect(mine.map((a) => a.id)).toEqual([live.account.id]);
    expect((await term.listTerminalAccounts(funded.person.id))[0].phase).toBe("funded");
    expect(await term.listTerminalAccounts(review.person.id)).toEqual([]);
    expect(await term.listTerminalAccounts(breached.person.id)).toEqual([]);
  });
});

describe("the live state of an account", () => {
  it("is only given to the account's owner; anyone else gets 'not found'", async () => {
    const a = await makeAccount();
    const stranger = await makeAccount();
    const now = await feed();
    await expect(term.getTerminalState({ personId: stranger.person.id, accountId: a.account.id, now })).rejects.toMatchObject({ status: 404 });
    await expect(term.getTerminalState({ personId: a.person.id, accountId: "nope", now })).rejects.toMatchObject({ status: 404 });
    await expect(term.getTerminalState({ personId: a.person.id, accountId: a.account.id, now })).resolves.toBeTruthy();
  });

  it("lists only the instruments the challenge permits, with prices, market status and size limits", async () => {
    const a = await makeAccount({ permitted: ["EURUSD", "UK100"] });
    const now = await feed();
    const s = await term.getTerminalState({ personId: a.person.id, accountId: a.account.id, now });
    expect(s.instruments.map((i) => i.symbol)).toEqual(["EURUSD", "UK100"]);
    const eur = s.instruments.find((i) => i.symbol === "EURUSD")!;
    expect(eur).toMatchObject({ bid: "1.24999", ask: "1.25001", digits: 5, minLot: "0.01", lotStep: "0.01", marketOpen: true });
    expect(s.pricesCurrent).toBe(true);
    expect(s.priceSource).toBe("test");
    expect(s.canTrade).toBe(true);
  });

  it("an instrument with no current price is listed without one", async () => {
    const a = await makeAccount({ permitted: ["EURUSD", "XAUUSD"] });
    const now = await feed({ EURUSD: 1.25 }); // gold gets no price this time
    const s = await term.getTerminalState({ personId: a.person.id, accountId: a.account.id, now: new Date(now.getTime() + 60_000 - 59_000) });
    const gold = s.instruments.find((i) => i.symbol === "XAUUSD")!;
    expect(gold.bid).toBeNull();
    await feed();
  });

  it("shows the live equity, floating profit, margin and rule meters for an open position", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    await buy(a, t0, 1);
    const t1 = await feed({ ...BASE, EURUSD: 1.26 });
    const s = await term.getTerminalState({ personId: a.person.id, accountId: a.account.id, now: t1 });

    expect(s.account.equityIsLive).toBe(true);
    expect(s.account.floatingPnl).toBe("792.06");
    expect(s.account.equity).toBe("100792.06");
    expect(s.account.balance).toBe("100000");
    expect(s.account.usedMargin).toBe("1000.01");
    expect(s.positions).toHaveLength(1);
    expect(s.positions[0]).toMatchObject({ symbol: "EURUSD", side: "buy", lots: "1", openPrice: "1.25001", floatingPnl: "792.06" });
    expect(s.account.rule?.pnl).toBe("792.06");
    expect(s.account.rule?.dailyLossCap).toBe("5000");
    expect(s.account.rule?.profitTarget).toBe("8000");
    await feed();
  });

  it("when prices aren't current, the screen is told: no live equity, no profit shown, nothing guessed", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    await buy(a, t0, 1);
    const s = await term.getTerminalState({ personId: a.person.id, accountId: a.account.id, now: new Date(t0.getTime() + 300_000) });
    expect(s.pricesCurrent).toBe(false);
    expect(s.account.equityIsLive).toBe(false);
    expect(s.account.floatingPnl).toBeNull();
    expect(s.positions[0].floatingPnl).toBeNull();
    expect(s.account.equity).toBe((await db.account.findUniqueOrThrow({ where: { id: a.account.id } })).equity.toString()); // the last stored equity
    await feed();
  });

  it("an account that can't trade says so", async () => {
    const a = await makeAccount({ phase: "pass_review" });
    const now = await feed();
    expect((await term.getTerminalState({ personId: a.person.id, accountId: a.account.id, now })).canTrade).toBe(false);
  });

  it("today's move is measured from the first price of the UTC day", async () => {
    const a = await makeAccount();
    await feed({ ...BASE, EURUSD: 1.25 }, new Date("2026-10-20T12:30:00Z"));
    const later = await feed({ ...BASE, EURUSD: 1.2562 }, new Date("2026-10-20T13:30:00Z")); // +0.496%
    const s = await term.getTerminalState({ personId: a.person.id, accountId: a.account.id, now: later });
    const eur = s.instruments.find((i) => i.symbol === "EURUSD")!;
    expect(Number(eur.changePct)).toBeGreaterThan(0.3);
    expect(Number(eur.changePct)).toBeLessThan(0.7);
  });
});

describe("chart candles from stored prices", () => {
  it("builds open, high, low and close per minute from the mid prices, oldest first, ignoring held-back prices", async () => {
    const base = new Date("2026-10-21T08:00:00Z");
    const at = (s: number) => new Date(base.getTime() + s * 1000);
    for (const [s, m] of [[10, 1.25], [30, 1.2505], [50, 1.2498], [70, 1.2502]] as const) {
      await ps.ingestQuotes({ quotes: await quotesFor({ EURUSD: m }, at(s)), source: "test", receivedAt: at(s) });
    }
    // A wild price that is only held as a suspect must not appear in any candle.
    await ps.ingestQuotes({ quotes: await quotesFor({ EURUSD: 1.4 }, at(80)), source: "test", receivedAt: at(80) });

    const candles = await term.getCandles({ symbol: "EURUSD", timeframe: "1m", count: 10, now: at(100) });
    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({ o: "1.25", h: "1.2505", l: "1.2498", c: "1.2498" });
    expect(candles[1]).toMatchObject({ o: "1.2502", h: "1.2502", l: "1.2502", c: "1.2502" });
    expect(new Date(candles[0].t).getTime()).toBeLessThan(new Date(candles[1].t).getTime());
  });

  it("groups into larger candles for a longer timeframe, and refuses an unknown instrument", async () => {
    const now = new Date("2026-10-21T08:03:00Z");
    const five = await term.getCandles({ symbol: "EURUSD", timeframe: "5m", count: 10, now });
    expect(five).toHaveLength(1);
    expect(five[0]).toMatchObject({ o: "1.25", h: "1.2505", l: "1.2498", c: "1.2502" });
    await expect(term.getCandles({ symbol: "NOPE", timeframe: "1m", now })).rejects.toMatchObject({ status: 404 });
  });
});

describe("trade history", () => {
  it("lists closed trades with profit after commission, newest first, only for the owner", async () => {
    clock = new Date("2026-10-21T09:00:00Z"); // after the prices the chart tests stored (time only moves forward)
    const a = await makeAccount();
    const stranger = await makeAccount();
    const t0 = await feed();
    const p1 = await buy(a, t0, 1);
    const t1 = await feed({ ...BASE, EURUSD: 1.26 });
    await tr.closePosition({ accountId: a.account.id, positionId: p1.id, actor: { type: "trader", personId: a.person.id }, now: t1 });
    const p2 = await buy(a, t1, 1);
    const t2 = await feed({ ...BASE, EURUSD: 1.261 });
    await tr.closePosition({ accountId: a.account.id, positionId: p2.id, actor: { type: "trader", personId: a.person.id }, now: t2 });

    const h = await term.getTradeHistory({ personId: a.person.id, accountId: a.account.id });
    expect(h).toHaveLength(2);
    expect(h[0].id).toBe(p2.id);
    expect(h[1]).toMatchObject({ id: p1.id, symbol: "EURUSD", closeReason: "manual", netPnl: "792.06" });
    await expect(term.getTradeHistory({ personId: stranger.person.id, accountId: a.account.id })).rejects.toMatchObject({ status: 404 });
    await feed();
  });
});
