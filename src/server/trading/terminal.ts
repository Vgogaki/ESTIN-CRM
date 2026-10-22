import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { evaluateAccount } from "@/server/rules";
import { floatingPnl } from "./engine";
import { converterTo } from "./fx";
import { isMarketOpen } from "./market-hours";
import { loadMarket, snapshotFor, toOpenPosition, TradeRejected } from "./core";
import { utcDay } from "./day";

/**
 * Everything the trader's terminal screen needs, assembled on the server. The browser
 * asks for this about once a second; it never works anything out for itself and never
 * supplies a price, an equity or a profit. Every function checks that the account
 * belongs to the person asking (anyone else gets "not found", same as a missing one).
 */

export type TerminalAccountSummary = { id: string; name: string; size: string; currency: string; phase: "evaluation" | "funded" };

/** The accounts a trader can trade on: active, not voided, in evaluation or funded. */
export async function listTerminalAccounts(personId: string): Promise<TerminalAccountSummary[]> {
  const rows = await db.account.findMany({
    where: { personId, voidedAt: null, status: "active", phase: { in: ["evaluation", "funded"] } },
    include: { challengeType: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((a) => ({ id: a.id, name: a.challengeType.name, size: a.challengeType.accountSize.toString(), currency: a.challengeType.currency, phase: a.phase as "evaluation" | "funded" }));
}

const str = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : d.toString());

export async function getTerminalState(input: { personId: string; accountId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const account = await db.account.findUnique({ where: { id: input.accountId }, include: { challengeType: true, currentPhase: true } });
  if (!account || account.personId !== input.personId) throw new ValidationError("Account not found.", 404);

  const permitted = new Set(account.challengeType.permittedInstruments);
  const [{ specs, prices }, openRows, dayOpens, latestTick] = await Promise.all([
    loadMarket(db, now),
    db.tradePosition.findMany({ where: { accountId: account.id, status: "open" }, orderBy: { openedAt: "asc" } }),
    db.$queryRaw<{ symbol: string; mid: Prisma.Decimal }[]>`
      SELECT DISTINCT ON ("symbol") "symbol", ("bid" + "ask") / 2 AS "mid"
      FROM "PriceTick" WHERE "status" = 'accepted' AND "receivedAt" >= ${utcDay(now)} AND "receivedAt" <= ${now}
      ORDER BY "symbol", "receivedAt" ASC`,
    db.priceTick.findFirst({ where: { status: "accepted" }, orderBy: { receivedAt: "desc" }, select: { source: true, receivedAt: true } }),
  ]);
  const openOfDay = new Map(dayOpens.map((r) => [r.symbol, new Prisma.Decimal(r.mid.toString())]));

  const instruments = Object.values(specs)
    .filter((s) => permitted.has(s.symbol))
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((s) => {
      const q = prices.quotes[s.symbol];
      const start = openOfDay.get(s.symbol);
      const changePct = q && start && !start.isZero() ? q.bid.plus(q.ask).dividedBy(2).minus(start).dividedBy(start).times(100).toDecimalPlaces(2) : null;
      return {
        symbol: s.symbol,
        name: s.name,
        digits: s.digits,
        pipSize: s.pipSize.toString(),
        minLot: s.minLot.toString(),
        maxLot: s.maxLot.toString(),
        lotStep: s.lotStep.toString(),
        minStopDistance: s.minStopDistance.toString(),
        marketOpen: isMarketOpen(s.sessions, now),
        bid: str(q?.bid),
        ask: str(q?.ask),
        changePct: str(changePct),
      };
    });

  // The live value of the account. If a price needed for it isn't current the screen is told, not given a guess.
  const currency = account.challengeType.currency;
  const open = openRows.map(toOpenPosition);
  let snapshot: ReturnType<typeof snapshotFor> | null = null;
  try {
    snapshot = snapshotFor(account.balance, open, specs, prices, currency);
  } catch (err) {
    if (!(err instanceof TradeRejected && err.code === "prices_unavailable")) throw err;
  }
  const convert = converterTo(currency, prices.mids);
  const positions = openRows.map((r) => {
    const quote = prices.quotes[r.symbol];
    const pnl = snapshot && quote ? floatingPnl(toOpenPosition(r), specs[r.symbol], quote, convert) : null;
    return {
      id: r.id,
      symbol: r.symbol,
      side: r.side,
      lots: r.lots.toString(),
      openPrice: r.openPrice.toString(),
      openedAt: r.openedAt.toISOString(),
      stopLoss: str(r.stopLoss),
      takeProfit: str(r.takeProfit),
      margin: r.marginUsed.toString(),
      floatingPnl: str(pnl),
    };
  });

  // The same rule figures the dashboard shows, but from the live equity.
  const phase = account.currentPhase;
  const equity = snapshot?.equity ?? account.equity;
  const rule =
    phase && account.phase === "evaluation"
      ? evaluateAccount({
          accountSize: account.challengeType.accountSize,
          equity,
          dayStartEquity: account.dayStartEquity,
          peakEquity: account.peakEquity,
          tradingDays: account.tradingDays,
          profitTargetPct: phase.profitTargetPct,
          dailyLossPct: phase.dailyLossPct,
          maxLossPct: phase.maxLossPct,
          drawdownType: phase.drawdownType,
          minTradingDays: phase.minTradingDays,
        })
      : phase
        ? evaluateAccount({
            accountSize: account.challengeType.accountSize,
            equity,
            dayStartEquity: account.dayStartEquity,
            peakEquity: account.peakEquity,
            tradingDays: account.tradingDays,
            profitTargetPct: null,
            dailyLossPct: phase.dailyLossPct,
            maxLossPct: phase.maxLossPct,
            drawdownType: phase.drawdownType,
            minTradingDays: phase.minTradingDays,
          })
        : null;

  return {
    serverTime: now.toISOString(),
    /** True when there is at least one current price; false means nothing can be traded or valued right now. */
    pricesCurrent: Object.keys(prices.quotes).length > 0,
    priceSource: latestTick?.source ?? null,
    canTrade: !account.voidedAt && account.status === "active" && (account.phase === "evaluation" || account.phase === "funded"),
    account: {
      id: account.id,
      name: account.challengeType.name,
      currency,
      size: account.challengeType.accountSize.toString(),
      status: account.status,
      phase: account.phase,
      phaseLabel: phase?.label ?? null,
      closeReason: account.closeReason,
      balance: account.balance.toString(),
      equity: equity.toString(),
      equityIsLive: snapshot !== null,
      floatingPnl: str(snapshot?.floatingPnl),
      usedMargin: str(snapshot?.usedMargin),
      freeMargin: str(snapshot?.freeMargin),
      drawdownType: phase?.drawdownType ?? "trailing",
      tradingDays: account.tradingDays,
      minTradingDays: phase?.minTradingDays ?? 0,
      rule: rule
        ? {
            pnl: rule.pnl.toString(),
            profitTarget: str(rule.profitTarget),
            dailyLossCap: rule.dailyLossCap.toString(),
            maxLossCap: rule.maxLossCap.toString(),
            dailyLossUsed: rule.dailyLossUsed.toString(),
            totalLossUsed: rule.totalLossUsed.toString(),
            dailyBreachLevel: rule.dailyBreachLevel.toString(),
            totalBreachLevel: rule.totalBreachLevel.toString(),
          }
        : null,
    },
    instruments,
    positions,
  };
}

export type TerminalState = Awaited<ReturnType<typeof getTerminalState>>;

/** The most recent closed trades of an account (newest first). */
export async function getTradeHistory(input: { personId: string; accountId: string; limit?: number }) {
  const account = await db.account.findUnique({ where: { id: input.accountId }, select: { personId: true } });
  if (!account || account.personId !== input.personId) throw new ValidationError("Account not found.", 404);
  const rows = await db.tradePosition.findMany({
    where: { accountId: input.accountId, status: "closed" },
    orderBy: { closedAt: "desc" },
    take: Math.min(Math.max(input.limit ?? 50, 1), 200),
  });
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    side: r.side,
    lots: r.lots.toString(),
    openPrice: r.openPrice.toString(),
    closePrice: str(r.closePrice),
    openedAt: r.openedAt.toISOString(),
    closedAt: r.closedAt?.toISOString() ?? null,
    closeReason: r.closeReason,
    netPnl: r.grossPnl ? r.grossPnl.minus(r.commission).toString() : null,
  }));
}

export const TIMEFRAMES = {
  "1m": { interval: "1 minute", seconds: 60 },
  "5m": { interval: "5 minutes", seconds: 300 },
  "15m": { interval: "15 minutes", seconds: 900 },
  "1h": { interval: "1 hour", seconds: 3600 },
} as const;
export type Timeframe = keyof typeof TIMEFRAMES;

/**
 * Candles built from OUR OWN stored prices (the trusted ones only), so the chart shows
 * exactly the prices the engine traded on. Prices are mid (halfway between bid and
 * ask). A candle with no price in it simply isn't drawn; the chart only goes back as
 * far as we have been recording.
 */
export async function getCandles(input: { symbol: string; timeframe: Timeframe; count?: number; now?: Date }) {
  const now = input.now ?? new Date();
  const tf = TIMEFRAMES[input.timeframe];
  if (!tf) throw new ValidationError("Unknown timeframe.", 400);
  const known = await db.instrument.findUnique({ where: { symbol: input.symbol }, select: { symbol: true, enabled: true } });
  if (!known || !known.enabled) throw new ValidationError("Unknown instrument.", 404);
  const count = Math.min(Math.max(input.count ?? 80, 5), 200);
  const since = new Date(now.getTime() - count * tf.seconds * 1000);

  const rows = await db.$queryRaw<{ bucket: Date; open: Prisma.Decimal; high: Prisma.Decimal; low: Prisma.Decimal; close: Prisma.Decimal }[]>`
    SELECT date_bin(${tf.interval}::interval, "receivedAt", TIMESTAMP '2000-01-01') AS "bucket",
           (array_agg(("bid" + "ask") / 2 ORDER BY "receivedAt" ASC))[1] AS "open",
           max(("bid" + "ask") / 2) AS "high",
           min(("bid" + "ask") / 2) AS "low",
           (array_agg(("bid" + "ask") / 2 ORDER BY "receivedAt" DESC))[1] AS "close"
    FROM "PriceTick"
    WHERE "symbol" = ${input.symbol} AND "status" = 'accepted' AND "receivedAt" >= ${since} AND "receivedAt" <= ${now}
    GROUP BY 1 ORDER BY 1 DESC LIMIT ${count}`;
  return rows
    .map((r) => ({ t: new Date(r.bucket.getTime() - 0).toISOString(), o: r.open.toString(), h: r.high.toString(), l: r.low.toString(), c: r.close.toString() }))
    .reverse();
}
