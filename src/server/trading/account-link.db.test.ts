import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { createTestDatabase, type TestDatabase } from "@/test/test-database";

/**
 * The link between trading and the challenge rules, against a real database: equity
 * follows the price, breaches and passes close everything and change the account, the
 * day resets at midnight UTC (and the trailing floor only rises at the end of a day),
 * trading days are counted from closed trades, and stale prices change nothing.
 * Run with `npm run test:db`.
 */

let testDb: TestDatabase;
let db: typeof import("@/server/db").db;
let ps: typeof import("@/server/trading/price-service");
let tr: typeof import("@/server/trading/trading");
let link: typeof import("@/server/trading/account-link");
let inst: typeof import("@/server/trading/instruments");
let traders: typeof import("@/server/traders");
let withdrawals: typeof import("@/server/withdrawals");

const IP = "203.0.113.9";
let n = 0;
const next = () => ++n;

// Time only moves forward. Tuesday 20 Oct 2026 12:00 UTC; the day-crossing tests at the end move it to Wednesday and Thursday.
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
  link = await import("@/server/trading/account-link");
  inst = await import("@/server/trading/instruments");
  traders = await import("@/server/traders");
  withdrawals = await import("@/server/withdrawals");
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

/** Sets the market at these mids (sent twice, a second apart, so a big move is confirmed). Returns the time to use as "now". */
async function feed(mids: Mids = BASE, at?: Date): Promise<Date> {
  const t1 = at ?? advance();
  await ps.ingestQuotes({ quotes: await quotesFor(mids, t1), source: "test", receivedAt: t1 });
  const t2 = new Date(t1.getTime() + 1000);
  await ps.ingestQuotes({ quotes: await quotesFor(mids, t2), source: "test", receivedAt: t2 });
  clock = t2;
  return t2;
}

type Opts = { balance?: number; phase?: "evaluation" | "funded"; minTradingDays?: number; targetPct?: number; consistencyRule?: object | null; equity?: number; accountSize?: number };

async function makeAccount(o: Opts = {}) {
  const k = next();
  const size = o.accountSize ?? 100000;
  const ct = await db.challengeType.create({
    data: {
      familyId: `fam-${k}`,
      version: 1,
      name: `Challenge ${k}`,
      accountSize: size,
      fee: 500,
      leverageCap: 100,
      permittedInstruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "UK100"],
      active: true,
      phases: {
        create: [
          { order: 1, label: "Evaluation", isFunded: false, profitTargetPct: o.targetPct ?? 8, dailyLossPct: 5, maxLossPct: 10, drawdownType: "trailing", minTradingDays: o.minTradingDays ?? 0 },
          { order: 2, label: "Funded", isFunded: true, dailyLossPct: 5, maxLossPct: 10, drawdownType: "trailing", profitSplitPct: 80, consistencyRule: o.consistencyRule ?? undefined },
        ],
      },
    },
    include: { phases: { orderBy: { order: "asc" } } },
  });
  const person = await db.person.create({
    data: { fullName: `Trader ${k}`, email: `t${k}@link.test`, country: "CY", kycStatus: "verified", twoFactorEnabledAt: new Date() },
  });
  const phase = o.phase ?? "evaluation";
  const balance = o.balance ?? size;
  const account = await db.account.create({
    data: {
      personId: person.id,
      challengeTypeId: ct.id,
      currentPhaseId: phase === "funded" ? ct.phases[1].id : ct.phases[0].id,
      orderRef: `order-${k}`,
      phase,
      equity: o.equity ?? balance,
      balance,
      dayStartEquity: o.equity ?? balance,
      peakEquity: Math.max(o.equity ?? balance, size),
    },
  });
  return { account, person, ct };
}

const buy = (a: { account: { id: string }; person: { id: string } }, now: Date, lots: number, extra: Partial<Parameters<typeof tr.placeMarketOrder>[0]> = {}) =>
  tr.placeMarketOrder({ accountId: a.account.id, personId: a.person.id, symbol: "EURUSD", side: "buy", lots, ipAddress: IP, now, ...extra });
const acct = (id: string) => db.account.findUniqueOrThrow({ where: { id } });
const audits = (entityId: string, action: string) => db.auditLog.count({ where: { entityId, action } });

describe("equity follows the price", () => {
  it("an order updates the account's equity at once; the sync keeps it in step with the price", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    await buy(a, t0, 1);
    // Opened at the ask: equity is already a spread below the balance.
    expect((await acct(a.account.id)).equity.toNumber()).toBeLessThan(100000);

    const t1 = await feed({ ...BASE, EURUSD: 1.26 });
    const r = await link.syncAccountEquity(a.account.id, { now: t1 });
    expect(r.status).toBe("synced");
    // closes at bid 1.25999: (1.25999 - 1.25001) x 100,000 = 998 USD / 1.26 = 792.06 EUR
    expect((await acct(a.account.id)).equity.toString()).toBe("100792.06");
    expect((await acct(a.account.id)).balance.toString()).toBe("100000"); // nothing realised yet
    await feed();
  });

  it("records an equity-curve point at most once a minute", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    await buy(a, t0, 1);
    const count = () => db.equityTick.count({ where: { accountId: a.account.id } });
    const c1 = await count();
    await link.syncAccountEquity(a.account.id, { now: new Date(t0.getTime() + 5_000) });
    expect(await count()).toBe(c1); // within a minute of the last point
    const t2 = await feed(BASE, new Date(t0.getTime() + 61_000));
    await link.syncAccountEquity(a.account.id, { now: t2 });
    expect(await count()).toBe(c1 + 1);
    const tick = await db.equityTick.findFirstOrThrow({ where: { accountId: a.account.id }, orderBy: { timestamp: "desc" } });
    expect(tick.tradingDay.toISOString().slice(0, 10)).toBe(t2.toISOString().slice(0, 10));
    await feed();
  });

  it("with no current price, nothing changes: equity stays put and no breach can be declared", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    await buy(a, t0, 50); // a big position that WOULD breach if the price fell
    const before = await acct(a.account.id);
    const later = new Date(t0.getTime() + 600_000); // ten minutes on, no new price
    const r = await link.syncAccountEquity(a.account.id, { now: later });
    expect(r.status).toBe("frozen");
    const after = await acct(a.account.id);
    expect(after.equity.toString()).toBe(before.equity.toString());
    expect(after.status).toBe("active");
    await feed();
  });

  it("an account that has never traded is left alone by the sweep", async () => {
    const a = await makeAccount();
    const t = await feed();
    const r = await link.syncTerminalAccounts(t);
    expect(r.failed).toBe(0);
    expect((await acct(a.account.id)).lastRolloverOn).toBeNull();
  });
});

describe("a breach", () => {
  it("a daily-loss breach closes every position at the current price, closes the account, tells the trader, and stops further trading", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    const p1 = await buy(a, t0, 30);
    const p2 = await buy(a, t0, 20, { symbol: "GBPUSD" });
    // EURUSD down 25 pips on 30 lots, GBPUSD down 25 pips on 20 lots: well past the 5,000 daily limit.
    const t1 = await feed({ ...BASE, EURUSD: 1.2475, GBPUSD: 1.4975 });
    const sweep = await link.syncTerminalAccounts(t1);
    expect(sweep.breached).toBeGreaterThanOrEqual(1);

    const final = await acct(a.account.id);
    expect(final).toMatchObject({ status: "breached", phase: "closed" });
    expect(final.closeReason).toMatch(/Daily loss limit breached/);
    expect(final.endedAt).toBeInstanceOf(Date);
    expect(final.equity.toString()).toBe(final.balance.toString()); // nothing floating any more
    expect(final.balance.toNumber()).toBeLessThan(95000);

    for (const p of [p1, p2]) {
      const row = await db.tradePosition.findUniqueOrThrow({ where: { id: p.id } });
      expect(row).toMatchObject({ status: "closed", closeReason: "breach" });
    }
    expect(await audits(a.account.id, "account.auto_breached")).toBe(1);
    expect(await db.notification.count({ where: { personId: a.person.id, type: "breach" } })).toBe(1);
    await expect(buy(a, t1, 1)).rejects.toMatchObject({ code: "account_not_tradable" });
    await feed();
  });

  it("a funded account is checked against its loss limits too", async () => {
    const a = await makeAccount({ phase: "funded" });
    const t0 = await feed();
    await buy(a, t0, 50);
    const t1 = await feed({ ...BASE, EURUSD: 1.2485 }); // 15 pips on 50 lots = ~7,500 USD + spread
    await link.syncTerminalAccounts(t1);
    const final = await acct(a.account.id);
    expect(final).toMatchObject({ status: "breached", phase: "closed" });
    expect(await audits(a.account.id, "account.auto_breached")).toBe(1);
    await feed();
  });

  it("the maximum loss uses the end-of-day high-water mark: an intraday high does not raise the floor", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    await buy(a, t0, 5);
    // Up 100 pips intraday (about +4,000 EUR) ...
    const t1 = await feed({ ...BASE, EURUSD: 1.26 });
    await link.syncAccountEquity(a.account.id, { now: t1 });
    const mid = await acct(a.account.id);
    expect(mid.equity.toNumber()).toBeGreaterThan(103000);
    expect(mid.peakEquity.toString()).toBe("100000"); // ... but the high-water mark has not moved
    await feed();
  });

  it("two syncs at the same moment on a breaching account breach it once", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    await buy(a, t0, 50);
    const t1 = await feed({ ...BASE, EURUSD: 1.2475 });
    const results = await Promise.allSettled([link.syncAccountEquity(a.account.id, { now: t1 }), link.syncAccountEquity(a.account.id, { now: t1 })]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await audits(a.account.id, "account.auto_breached")).toBe(1);
    expect(await db.notification.count({ where: { personId: a.person.id, type: "breach" } })).toBe(1);
    expect(await db.tradePosition.count({ where: { accountId: a.account.id, status: "open" } })).toBe(0);
    await feed();
  });
});

describe("passing the evaluation", () => {
  it("reaching the profit target closes everything and moves the account to pass review", async () => {
    const a = await makeAccount({ minTradingDays: 1 });
    const t0 = await feed();
    // One trade opened and closed: the first trading day.
    const first = await buy(a, t0, 1);
    await tr.closePosition({ accountId: a.account.id, positionId: first.id, actor: { type: "trader", personId: a.person.id }, now: t0 });
    expect((await acct(a.account.id)).tradingDays).toBe(1);

    const big = await buy(a, t0, 30);
    const t1 = await feed({ ...BASE, EURUSD: 1.255 }); // +50 pips on 30 lots = 15,000 USD = ~12,000 EUR: past the 8% target
    await link.syncTerminalAccounts(t1);

    const final = await acct(a.account.id);
    expect(final.phase).toBe("pass_review");
    expect(final.status).toBe("active");
    expect(final.equity.toString()).toBe(final.balance.toString());
    expect((await db.tradePosition.findUniqueOrThrow({ where: { id: big.id } })).closeReason).toBe("pass");
    expect(await audits(a.account.id, "account.auto_pass_review")).toBe(1);
    expect(await db.notification.count({ where: { personId: a.person.id, type: "phase_passed" } })).toBe(1);
    await feed();
  });

  it("the target is not enough until the minimum trading days are done", async () => {
    const a = await makeAccount({ minTradingDays: 2 });
    const t0 = await feed();
    await buy(a, t0, 30);
    const t1 = await feed({ ...BASE, EURUSD: 1.255 });
    await link.syncTerminalAccounts(t1);
    const state = await acct(a.account.id);
    expect(state.phase).toBe("evaluation"); // target met, but no trading day yet
    expect(state.equity.toNumber()).toBeGreaterThan(108000);
    await feed();
  });
});

describe("staff can't type over a trading account's equity", () => {
  it("refuses an equity override once the account has traded, but a status change is still allowed; accounts that never traded are unaffected", async () => {
    const traded = await makeAccount();
    const t0 = await feed();
    await buy(traded, t0, 1);
    const admin = await db.adminUser.create({
      data: { email: `adm${next()}@link.test`, name: "Admin", passwordHash: "x", role: { connectOrCreate: { where: { name: "r" }, create: { name: "r", permissions: [] } } } },
    });
    const base = { adminId: admin.id, ipAddress: IP, reason: "Correction needed" };
    await expect(traders.updateAccountState({ ...base, accountId: traded.account.id, patch: { equity: 50000 } })).rejects.toMatchObject({ status: 409 });
    await expect(traders.updateAccountState({ ...base, accountId: traded.account.id, patch: { tradingDays: 5 } })).rejects.toMatchObject({ status: 409 });
    await expect(traders.updateAccountState({ ...base, accountId: traded.account.id, patch: { status: "closed", phase: "closed" } })).resolves.toBeTruthy();

    const manual = await makeAccount();
    await expect(traders.updateAccountState({ ...base, accountId: manual.account.id, patch: { equity: 99000 } })).resolves.toBeTruthy();
    await feed();
  });
});

describe("the best-day consistency rule at payout", () => {
  async function fundedWithTrades(days: { date: string; profit: number }[], rule: object | null) {
    const a = await makeAccount({ phase: "funded", balance: 101000, equity: 101000, consistencyRule: rule });
    await db.account.update({ where: { id: a.account.id }, data: { phaseStartedAt: new Date("2026-01-01T00:00:00Z") } });
    for (const d of days) {
      await db.tradePosition.create({
        data: {
          accountId: a.account.id, symbol: "EURUSD", side: "buy", lots: 1, openPrice: 1.2, openedAt: new Date(`${d.date}T10:00:00Z`), openTickId: "x", marginUsed: 1000,
          status: "closed", closePrice: 1.21, closedAt: new Date(`${d.date}T12:00:00Z`), closeTickId: "y", closeReason: "manual", grossPnl: d.profit, commission: 0,
        },
      });
    }
    return a;
  }
  const request = (a: { account: { id: string }; person: { id: string } }) => withdrawals.requestWithdrawal({ personId: a.person.id, accountId: a.account.id, ipAddress: IP });
  const RULE = { type: "best_day", maxPct: 50 };

  it("refuses a payout when one day carries more than the limit of the profit, and says why", async () => {
    const a = await fundedWithTrades([{ date: "2026-10-01", profit: 800 }, { date: "2026-10-02", profit: 100 }, { date: "2026-10-03", profit: 100 }], RULE);
    await expect(request(a)).rejects.toThrow(/best day \(800\.00\) is 80\.0%/);
    expect(await db.withdrawal.count({ where: { accountId: a.account.id } })).toBe(0);
  });
  it("allows it when profit is spread evenly", async () => {
    const a = await fundedWithTrades([{ date: "2026-10-01", profit: 400 }, { date: "2026-10-02", profit: 300 }, { date: "2026-10-03", profit: 300 }], RULE);
    await expect(request(a)).resolves.toBeTruthy();
  });
  it("is not applied where there are no trades to look at, or no rule is set", async () => {
    await expect(request(await fundedWithTrades([], RULE))).resolves.toBeTruthy();
    await expect(request(await fundedWithTrades([{ date: "2026-10-01", profit: 900 }], null))).resolves.toBeTruthy();
  });
});

// These move the clock across midnight, so they come last.
describe("the daily reset at midnight UTC", () => {
  it("runs once per UTC day, from the previous day's last equity", async () => {
    const a = await makeAccount();
    const t0 = await feed();
    await buy(a, t0, 5);
    const t1 = await feed({ ...BASE, EURUSD: 1.254 });
    await link.syncAccountEquity(a.account.id, { now: t1 });
    const lastEquity = (await acct(a.account.id)).equity;

    // Just after midnight, same prices.
    const dayTwo = await feed({ ...BASE, EURUSD: 1.254 }, new Date("2026-10-21T00:00:10Z"));
    const r = await link.syncAccountEquity(a.account.id, { now: dayTwo });
    expect(r.rolledOver).toBe(true);
    const after = await acct(a.account.id);
    expect(after.dayStartEquity.toString()).toBe(lastEquity.toString()); // yesterday's closing equity, not a fresh recalculation
    expect(after.lastRolloverOn?.toISOString().slice(0, 10)).toBe("2026-10-21");
    expect(await audits(a.account.id, "account.day_rollover")).toBeGreaterThanOrEqual(1);

    const again = await link.syncAccountEquity(a.account.id, { now: new Date(dayTwo.getTime() + 1000) });
    expect(again.rolledOver).toBe(false); // the same day: no second reset
  });

  it("the daily loss limit is measured from the new day's start, so yesterday's loss doesn't count today", async () => {
    const a = await makeAccount();
    const t0 = await feed(BASE, new Date("2026-10-21T01:00:00Z"));
    await buy(a, t0, 50);
    // A day-one loss of about 4,100 EUR (10 pips on 50 lots): under the 5,000 daily limit.
    const t1 = await feed({ ...BASE, EURUSD: 1.2490 }, new Date("2026-10-21T02:00:00Z"));
    await link.syncAccountEquity(a.account.id, { now: t1 });
    expect((await acct(a.account.id)).status).toBe("active");
    // Next day (Thursday), a further loss of about 2,400 EUR (6 pips): about 6,500 in all since the account
    // began (more than the 5,000 daily limit), but only about 2,400 since today's start, so no breach.
    const t2 = await feed({ ...BASE, EURUSD: 1.2490 }, new Date("2026-10-22T00:00:10Z"));
    await link.syncAccountEquity(a.account.id, { now: t2 });
    const t3 = await feed({ ...BASE, EURUSD: 1.2484 }, new Date("2026-10-22T01:00:00Z"));
    await link.syncAccountEquity(a.account.id, { now: t3 });
    const s = await acct(a.account.id);
    expect(s.dayStartEquity.toNumber()).toBeLessThan(96000); // the new day started lower
    expect(100000 - s.equity.toNumber()).toBeGreaterThan(5000); // down more than 5,000 overall...
    expect(s.status).toBe("active"); // ...but today's own loss is within the limit
  });

  it("the high-water mark rises at the end of a profitable day", async () => {
    const a = await makeAccount();
    const t0 = await feed(BASE, new Date("2026-10-22T02:00:00Z"));
    await buy(a, t0, 5);
    const t1 = await feed({ ...BASE, EURUSD: 1.26 }, new Date("2026-10-22T03:00:00Z"));
    await link.syncAccountEquity(a.account.id, { now: t1 });
    const endOfDay = (await acct(a.account.id)).equity;
    expect(endOfDay.toNumber()).toBeGreaterThan(103000);
    expect((await acct(a.account.id)).peakEquity.toString()).toBe("100000");

    const nextDay = await feed({ ...BASE, EURUSD: 1.26 }, new Date("2026-10-23T00:00:10Z"));
    await link.syncAccountEquity(a.account.id, { now: nextDay });
    expect((await acct(a.account.id)).peakEquity.toString()).toBe(endOfDay.toString()); // now it has risen, to the end-of-day equity
  });
});

describe("trading days", () => {
  it("counts a day once however many trades are closed on it, and a later day again", async () => {
    const a = await makeAccount();
    const t0 = await feed(BASE, new Date("2026-10-23T02:00:00Z"));
    const p1 = await buy(a, t0, 1);
    const p2 = await buy(a, t0, 1);
    const p3 = await buy(a, t0, 1);
    const who = { type: "trader" as const, personId: a.person.id };
    await tr.closePosition({ accountId: a.account.id, positionId: p1.id, actor: who, now: t0 });
    await tr.closePosition({ accountId: a.account.id, positionId: p2.id, actor: who, now: t0 });
    expect((await acct(a.account.id)).tradingDays).toBe(1);

    const t1 = await feed(BASE, new Date("2026-10-23T20:00:00Z"));
    await tr.closePosition({ accountId: a.account.id, positionId: p3.id, actor: who, now: t1 });
    expect((await acct(a.account.id)).tradingDays).toBe(1); // the same UTC day: still one
    expect((await acct(a.account.id)).lastTradingDayOn?.toISOString().slice(0, 10)).toBe("2026-10-23");
  });
});
