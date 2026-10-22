import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { createTestDatabase, type TestDatabase } from "@/test/test-database";

/**
 * The price service and the trading engine against a real database: which prices
 * are trusted, how a fill is recorded, how a stop closes a trade, and that
 * simultaneous actions can't double-spend margin or close a position twice.
 * Run with `npm run test:db`.
 */

let testDb: TestDatabase;
let db: typeof import("@/server/db").db;
let ps: typeof import("@/server/trading/price-service");
let tr: typeof import("@/server/trading/trading");
let inst: typeof import("@/server/trading/instruments");
let providers: typeof import("@/server/trading/providers");

const IP = "203.0.113.9";
let n = 0;
const next = () => ++n;

// A Tuesday, so every market in the default set is open. Time only moves forward (a stored price older than the last is rejected as out of order).
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
  inst = await import("@/server/trading/instruments");
  providers = await import("@/server/trading/providers");
  await ps.seedInstruments();
});

afterAll(async () => {
  await db?.$disconnect();
  await testDb?.drop();
});

/** Builds quotes at the given mids (bid/ask around them using each instrument's sample spread). */
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

/**
 * Puts the market at these mids. Sent twice, a second apart: a big move is held as a
 * suspect by the first and confirmed (accepted) by the second, a small one is accepted
 * at once. Returns the time to use as "now" afterwards.
 */
async function feed(mids: Mids = BASE): Promise<Date> {
  const t1 = advance();
  await ps.ingestQuotes({ quotes: await quotesFor(mids, t1), source: "test", receivedAt: t1 });
  const t2 = new Date(t1.getTime() + 1000);
  await ps.ingestQuotes({ quotes: await quotesFor(mids, t2), source: "test", receivedAt: t2 });
  clock = t2;
  return t2;
}

async function makeAccount(opts: { balance?: number; permitted?: string[]; phase?: "evaluation" | "pass_review" | "funded"; leverageCap?: number } = {}) {
  const k = next();
  const ct = await db.challengeType.create({
    data: {
      familyId: `fam-${k}`,
      version: 1,
      name: `Challenge ${k}`,
      accountSize: 100000,
      fee: 500,
      leverageCap: opts.leverageCap ?? 100,
      permittedInstruments: opts.permitted ?? ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "UK100"],
      active: true,
    },
  });
  const person = await db.person.create({ data: { fullName: `Trader ${k}`, email: `t${k}@trade.test`, country: "CY" } });
  const balance = opts.balance ?? 100000;
  const account = await db.account.create({
    data: {
      personId: person.id,
      challengeTypeId: ct.id,
      orderRef: `order-${k}`,
      phase: opts.phase ?? "evaluation",
      equity: balance,
      balance,
      dayStartEquity: balance,
      peakEquity: balance,
    },
  });
  return { account, person, ct };
}

const buy = (a: { account: { id: string }; person: { id: string } }, now: Date, extra: Partial<Parameters<typeof tr.placeMarketOrder>[0]> = {}) =>
  tr.placeMarketOrder({ accountId: a.account.id, personId: a.person.id, symbol: "EURUSD", side: "buy", lots: 1, ipAddress: IP, now, ...extra });
const balanceOf = async (id: string) => (await db.account.findUniqueOrThrow({ where: { id } })).balance.toString();

describe("the price service: which prices are trusted", () => {
  it("stores an accepted price and offers it as the current price, with the id of the stored tick", async () => {
    const now = await feed();
    const fresh = await ps.getFreshPrices(now);
    expect(fresh.quotes.EURUSD.bid.toString()).toBe("1.24999");
    expect(fresh.quotes.EURUSD.ask.toString()).toBe("1.25001");
    expect(fresh.mids.EURUSD.toString()).toBe("1.25");
    const row = await db.priceTick.findUniqueOrThrow({ where: { id: fresh.quotes.EURUSD.tickId } });
    expect(row).toMatchObject({ status: "accepted", symbol: "EURUSD", source: "test" });
  });

  it("a sudden jump is held as a suspect and NOT used until the next price agrees", async () => {
    const base = await feed(); // baseline 1.25
    const t = new Date(base.getTime() + 2000); // moments later, so the baseline is still current
    await ps.ingestQuotes({ quotes: await quotesFor({ EURUSD: 1.3 }, t), source: "test", receivedAt: t }); // +4%
    const fresh = await ps.getFreshPrices(new Date(t.getTime() + 500));
    expect(fresh.mids.EURUSD.toString()).toBe("1.25"); // still the old price
    const suspect = await db.priceTick.findFirstOrThrow({ where: { symbol: "EURUSD", status: "suspect" }, orderBy: { receivedAt: "desc" } });
    expect(suspect.reason).toMatch(/held until the next price confirms/);

    const t2 = new Date(t.getTime() + 1000);
    await ps.ingestQuotes({ quotes: await quotesFor({ EURUSD: 1.3002 }, t2), source: "test", receivedAt: t2 });
    const after = await ps.getFreshPrices(new Date(t2.getTime() + 500));
    expect(after.mids.EURUSD.toString()).toBe("1.3002");
    const confirmed = await db.priceTick.findUniqueOrThrow({ where: { id: after.quotes.EURUSD.tickId } });
    expect(confirmed.confirmsTickId).toBe(suspect.id);
    await feed(); // back to baseline for the other tests
  });

  it("a bad spike that reverses is kept as evidence but never used", async () => {
    await feed();
    const t = advance();
    await ps.ingestQuotes({ quotes: await quotesFor({ GBPUSD: 1.8 }, t), source: "test", receivedAt: t }); // spike
    const t2 = new Date(t.getTime() + 1000);
    await ps.ingestQuotes({ quotes: await quotesFor({ GBPUSD: 1.5001 }, t2), source: "test", receivedAt: t2 }); // back
    const fresh = await ps.getFreshPrices(new Date(t2.getTime() + 500));
    expect(fresh.mids.GBPUSD.toString()).toBe("1.5001");
    expect(await db.priceTick.count({ where: { symbol: "GBPUSD", status: "suspect", bid: { gt: 1.7 } } })).toBeGreaterThanOrEqual(1);
    await feed();
  });

  it("a crossed quote is stored as rejected and never used", async () => {
    const now = await feed();
    const t = new Date(now.getTime() + 2000);
    const r = await ps.ingestQuotes({
      quotes: [{ symbol: "EURUSD", bid: new Prisma.Decimal("1.2510"), ask: new Prisma.Decimal("1.2500"), quoteTs: t }],
      source: "test",
      receivedAt: t,
    });
    expect(r.rejected).toBe(1);
    const fresh = await ps.getFreshPrices(new Date(t.getTime() + 500));
    expect(fresh.quotes.EURUSD.bid.toString()).toBe("1.24999");
  });

  it("an unchanged price is stored only as a heartbeat, every few seconds", async () => {
    const t = advance();
    const q = await quotesFor({ EURUSD: 1.25 }, t);
    await ps.ingestQuotes({ quotes: q, source: "test", receivedAt: t });
    const again = await ps.ingestQuotes({ quotes: q.map((x) => ({ ...x, quoteTs: new Date(t.getTime() + 2000) })), source: "test", receivedAt: new Date(t.getTime() + 2000) });
    expect(again.unchanged).toBeGreaterThan(0);
    const later = new Date(t.getTime() + 6000);
    const hb = await ps.ingestQuotes({ quotes: q.map((x) => ({ ...x, quoteTs: later })), source: "test", receivedAt: later });
    expect(hb.accepted).toBeGreaterThan(0); // past the heartbeat, stored again
    clock = later;
  });

  it("a price older than the allowed age is not current: absent, never an old price in its place", async () => {
    const now = await feed();
    expect((await ps.getFreshPrices(new Date(now.getTime() + 10_000))).quotes.EURUSD).toBeDefined();
    expect((await ps.getFreshPrices(new Date(now.getTime() + 60_000))).quotes.EURUSD).toBeUndefined();
  });

  it("every stored price is permanent: a database rule refuses edits and deletes", async () => {
    const now = await feed();
    const { quotes } = await ps.getFreshPrices(now);
    await expect(db.priceTick.update({ where: { id: quotes.EURUSD.tickId }, data: { bid: 9 } })).rejects.toThrow(/append-only/);
    await expect(db.priceTick.delete({ where: { id: quotes.EURUSD.tickId } })).rejects.toThrow(/append-only/);
  });

  it("an instrument that is switched off or unknown is ignored", async () => {
    const t = advance();
    const [q] = await quotesFor({ US30: 39000 }, t);
    await db.instrument.update({ where: { symbol: "US30" }, data: { enabled: false } });
    try {
      const r = await ps.ingestQuotes({ quotes: [q, { ...q, symbol: "NOPE" }], source: "test", receivedAt: t });
      expect(r).toMatchObject({ accepted: 0, suspect: 0, rejected: 0 });
    } finally {
      await db.instrument.update({ where: { symbol: "US30" }, data: { enabled: true } });
    }
  });

  it("the same old price sent twice is a harmless duplicate, even inside a transaction (which a failed insert would abort)", async () => {
    const now = await feed();
    const old = new Date(now.getTime() - 3_600_000); // an hour-old price: out of order, stored as rejected
    const q = await quotesFor({ EURUSD: 1.25 }, old);
    const send = () => db.$transaction((tx) => ps.ingestQuotes({ quotes: q, source: "test", receivedAt: new Date(now.getTime() + 500) }, tx as never));
    const first = await send();
    const second = await send();
    expect(first.rejected).toBe(1);
    expect(second).toMatchObject({ rejected: 0, duplicates: 1 });
    // ...and the same transaction can carry on afterwards.
    expect((await ps.getFreshPrices(now)).quotes.EURUSD).toBeDefined();
  });

  it("two copies polling at the same moment don't clash", async () => {
    const provider = new providers.SimulatedProvider(11);
    const t = advance();
    const results = await Promise.allSettled([ps.runPriceCycle(provider, t), ps.runPriceCycle(provider, new Date(t.getTime() + 1)) ]);
    expect(results.map((r) => (r.status === "rejected" ? String(r.reason) : "ok"))).toEqual(["ok", "ok"]);
    clock = new Date(t.getTime() + 1000);
    await feed();
  });

  it("starting instruments are created once and never overwrite staff edits", async () => {
    await db.instrument.update({ where: { symbol: "EURUSD" }, data: { maxLot: 7 } });
    expect(await ps.seedInstruments()).toBe(0);
    expect((await db.instrument.findUniqueOrThrow({ where: { symbol: "EURUSD" } })).maxLot.toString()).toBe("7");
    await db.instrument.update({ where: { symbol: "EURUSD" }, data: { maxLot: 50 } });
  });
});

describe("opening a position", () => {
  it("fills at the ask, holds the margin, records the exact price tick, and writes an audit entry", async () => {
    const a = await makeAccount();
    const now = await feed();
    const p = await buy(a, now, { stopLoss: "1.2400", takeProfit: "1.2700" });

    expect(p).toMatchObject({ symbol: "EURUSD", side: "buy", status: "open" });
    expect(p.openPrice.toString()).toBe("1.25001");
    // 1 lot at the fill price 1.25001: 125,001 USD = 100,000.80 EUR at 1.25, / 100 = 1,000.008, rounded UP to the cent.
    expect(p.marginUsed.toString()).toBe("1000.01");
    expect(p.stopLoss?.toString()).toBe("1.24");
    const tick = await db.priceTick.findUniqueOrThrow({ where: { id: p.openTickId } });
    expect(tick.ask.toString()).toBe("1.25001"); // the fill can be traced to the stored price
    expect(await db.auditLog.count({ where: { action: "trade.opened", entityId: p.id } })).toBe(1);
  });

  it("the live snapshot moves with the price: equity = balance + floating profit", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    await buy(a, t0);
    const t1 = await feed({ ...BASE, EURUSD: 1.26 });
    const s = await tr.getAccountSnapshot(a.account.id, t1);
    // closes at bid 1.25999: (1.25999 - 1.25001) x 100,000 = 998 USD / 1.26 = 792.06 EUR
    expect(s.floatingPnl.toString()).toBe("792.06");
    expect(s.equity.toString()).toBe("100792.06");
    expect(s.usedMargin.toString()).toBe("1000.01");
    expect(s.positions[0].floatingPnl.toString()).toBe("792.06");
    expect(await balanceOf(a.account.id)).toBe("100000"); // nothing realised yet
    await feed();
  });

  it("refuses an instrument the challenge doesn't permit, and a challenge that permits nothing", async () => {
    const a = await makeAccount();
    const now = await feed();
    await expect(buy(a, now, { symbol: "US30", lots: 1 })).rejects.toMatchObject({ code: "instrument_not_permitted" });
    const none = await makeAccount({ permitted: [] });
    await expect(buy(none, now)).rejects.toMatchObject({ code: "instrument_not_permitted" });
  });

  it("refuses when the margin isn't there, right at the limit", async () => {
    const now = await feed();
    // 1 lot needs 1,000.01 here (see the margin test above).
    const poor = await makeAccount({ balance: 1000 });
    await expect(buy(poor, now)).rejects.toMatchObject({ code: "insufficient_margin" });
    const exact = await makeAccount({ balance: 1000.01 });
    await expect(buy(exact, now)).resolves.toBeTruthy();
  });

  it("uses the challenge's leverage cap", async () => {
    const now = await feed();
    const a = await makeAccount({ leverageCap: 30 });
    const p = await buy(a, now);
    expect(p.marginUsed.toString()).toBe("3333.36"); // 100,000.80 EUR / 30, rounded up
  });

  it("refuses on an account that isn't tradable, someone else's account, or a voided one", async () => {
    const now = await feed();
    const review = await makeAccount({ phase: "pass_review" });
    await expect(buy(review, now)).rejects.toMatchObject({ code: "account_not_tradable" });

    const mine = await makeAccount();
    const other = await makeAccount();
    await expect(tr.placeMarketOrder({ accountId: mine.account.id, personId: other.person.id, symbol: "EURUSD", side: "buy", lots: 1, ipAddress: IP, now })).rejects.toMatchObject({ status: 404 });

    const voided = await makeAccount();
    await db.account.update({ where: { id: voided.account.id }, data: { voidedAt: new Date() } });
    await expect(buy(voided, now)).rejects.toMatchObject({ code: "account_voided" });
  });

  it("refuses without a current price, instead of using an old one", async () => {
    const a = await makeAccount();
    const now = await feed();
    await expect(buy(a, new Date(now.getTime() + 120_000))).rejects.toMatchObject({ code: "no_price", status: 503 });
  });

  it("refuses bad numbers and bad sizes", async () => {
    const a = await makeAccount();
    const now = await feed();
    await expect(buy(a, now, { lots: "abc" })).rejects.toMatchObject({ code: "bad_number" });
    await expect(buy(a, now, { lots: 0.005 })).rejects.toMatchObject({ code: "bad_lots" });
    await expect(buy(a, now, { stopLoss: "1.30" })).rejects.toMatchObject({ code: "bad_stop_loss" });
  });

  it("two orders at the same moment can't both use the same margin", async () => {
    const a = await makeAccount({ balance: 1500 }); // room for one 1,000 margin position, not two
    const now = await feed();
    const results = await Promise.allSettled([buy(a, now), buy(a, now)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "insufficient_margin" });
    expect(await db.tradePosition.count({ where: { accountId: a.account.id } })).toBe(1);
  });
});

describe("closing a position", () => {
  it("settles at the bid, converts to euros, changes the balance by exactly that, and is audited", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    const p = await buy(a, t0);
    const t1 = await feed({ ...BASE, EURUSD: 1.26 });

    const c = await tr.closePosition({ accountId: a.account.id, positionId: p.id, actor: { type: "trader", personId: a.person.id }, ipAddress: IP, now: t1 });
    expect(c.closePrice.toString()).toBe("1.25999");
    expect(c.grossPnl.toString()).toBe("792.06");
    expect(await balanceOf(a.account.id)).toBe("100792.06");

    const row = await db.tradePosition.findUniqueOrThrow({ where: { id: p.id } });
    expect(row).toMatchObject({ status: "closed", closeReason: "manual" });
    expect(row.grossPnl?.toString()).toBe("792.06");
    expect((await db.priceTick.findUniqueOrThrow({ where: { id: row.closeTickId! } })).bid.toString()).toBe("1.25999");
    expect(await db.auditLog.count({ where: { action: "trade.closed", entityId: p.id } })).toBe(1);
    await feed();
  });

  it("a losing short on a JPY pair: converted through the yen rate", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    const p = await buy(a, t0, { symbol: "USDJPY", side: "sell" }); // sells at the bid 149.998
    const t1 = await feed({ ...BASE, USDJPY: 150.5 });
    const c = await tr.closePosition({ accountId: a.account.id, positionId: p.id, actor: { type: "system" }, now: t1 });
    // closes at the ask 150.502: (149.998 - 150.502) = -0.504 x 100,000 = -50,400 JPY = -336 USD (at 150) = -268.80 EUR (at 1.25)... mids: USD per JPY = 1/150.5
    expect(c.grossPnl.toString()).toBe("-267.91");
    await feed();
  });

  it("can't be closed twice; the second attempt is refused and the balance changes once", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    const p = await buy(a, t0);
    const t1 = await feed({ ...BASE, EURUSD: 1.255 });
    const results = await Promise.allSettled([
      tr.closePosition({ accountId: a.account.id, positionId: p.id, actor: { type: "trader", personId: a.person.id }, now: t1 }),
      tr.closePosition({ accountId: a.account.id, positionId: p.id, actor: { type: "trader", personId: a.person.id }, now: t1 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "already_closed" });
    const net = Number(await balanceOf(a.account.id)) - 100000;
    expect(net).toBeGreaterThan(0);
    expect(await db.auditLog.count({ where: { action: "trade.closed", entityId: p.id } })).toBe(1);
    await feed();
  });

  it("a trader can't close someone else's position", async () => {
    const a = await makeAccount();
    const stranger = await makeAccount();
    const t0 = await feed();
    const p = await buy(a, t0);
    await expect(tr.closePosition({ accountId: a.account.id, positionId: p.id, actor: { type: "trader", personId: stranger.person.id }, now: t0 })).rejects.toMatchObject({ status: 404 });
    expect((await db.tradePosition.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("open");
  });

  it("closes everything on an account at once, and the balance reflects all of it", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    await buy(a, t0);
    await buy(a, t0, { symbol: "GBPUSD", side: "sell" });
    const t1 = await feed({ ...BASE, EURUSD: 1.251, GBPUSD: 1.499 });
    const closed = await tr.closeAllPositions({ accountId: a.account.id, reason: "breach", actor: { type: "system" }, now: t1 });
    expect(closed).toHaveLength(2);
    expect(await db.tradePosition.count({ where: { accountId: a.account.id, status: "open" } })).toBe(0);
    expect((await db.tradePosition.findMany({ where: { accountId: a.account.id } })).every((x) => x.closeReason === "breach")).toBe(true);
    await feed();
  });
});

describe("stop-loss and take-profit", () => {
  it("a stop-loss closes the position at the price that triggered it, not at the level set", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    const p = await buy(a, t0, { stopLoss: "1.2400" });
    const t1 = await feed({ ...BASE, EURUSD: 1.239 }); // gaps through the stop
    const r = await tr.processStops(t1);
    expect(r.closed).toBeGreaterThanOrEqual(1);

    const row = await db.tradePosition.findUniqueOrThrow({ where: { id: p.id } });
    expect(row).toMatchObject({ status: "closed", closeReason: "stop_loss" });
    expect(row.closePrice?.toString()).toBe("1.23899"); // the bid at the time, worse than 1.2400
    // (1.23899 - 1.25001) x 100,000 = -1,102 USD / 1.239 = -889.43 EUR
    expect(row.grossPnl?.toString()).toBe("-889.43");
    expect(await balanceOf(a.account.id)).toBe("99110.57");
    await feed();
  });

  it("a take-profit on a short closes at the ask when it falls to the target", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    const p = await buy(a, t0, { side: "sell", takeProfit: "1.2400" });
    const t1 = await feed({ ...BASE, EURUSD: 1.2395 });
    await tr.processStops(t1);
    const row = await db.tradePosition.findUniqueOrThrow({ where: { id: p.id } });
    expect(row).toMatchObject({ status: "closed", closeReason: "take_profit" });
    expect(row.closePrice?.toString()).toBe("1.23951");
    await feed();
  });

  it("leaves a position alone while the price hasn't reached its stop", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    const p = await buy(a, t0, { stopLoss: "1.2000" });
    const t1 = await feed({ ...BASE, EURUSD: 1.2495 });
    await tr.processStops(t1);
    expect((await db.tradePosition.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("open");
    await feed();
  });

  it("never closes on stale data: with no current price the stop is skipped, not triggered", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    const p = await buy(a, t0, { stopLoss: "1.2400" });
    const r = await tr.processStops(new Date(t0.getTime() + 300_000)); // five minutes later, no price since
    expect(r.skipped).toBeGreaterThanOrEqual(1);
    expect((await db.tradePosition.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("open");
    await feed();
  });

  it("a stop being hit at the same moment as a manual close: exactly one close happens", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    const p = await buy(a, t0, { stopLoss: "1.2400" });
    const t1 = await feed({ ...BASE, EURUSD: 1.239 });
    await Promise.allSettled([
      tr.processStops(t1),
      tr.closePosition({ accountId: a.account.id, positionId: p.id, actor: { type: "trader", personId: a.person.id }, now: t1 }),
    ]);
    expect(await db.auditLog.count({ where: { action: "trade.closed", entityId: p.id } })).toBe(1);
    const closes = (await balanceOf(a.account.id)) === "99110.57";
    expect(closes).toBe(true); // the loss was taken once
    await feed();
  });
});

describe("the market being closed (kept last: it moves the clock to a Saturday)", () => {
  it("refuses to open a position on a closed market, even with a price on file", async () => {
    const a = await makeAccount();
    clock = new Date("2026-10-24T12:00:00Z"); // Saturday
    const now = await feed();
    await expect(buy(a, now)).rejects.toMatchObject({ code: "market_closed" });
  });
});
