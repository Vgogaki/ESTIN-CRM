import { Prisma } from "@prisma/client";
import { lotProblem, type InstrumentSpec } from "./instruments";
import { isMarketOpen } from "./market-hours";
import type { Converter } from "./fx";

type D = Prisma.Decimal;

/**
 * The simulated trading engine's maths. Pure: no database, no clock of its own, no
 * network, and every number is a Decimal (CLAUDE.md: never floating point for money).
 * The database-backed wrapper that stores positions and takes row locks is trading.ts.
 *
 * Conventions (the ones every retail platform uses, so traders are not surprised):
 *  - You BUY at the ask and SELL at the bid. A long position is valued, and closed,
 *    at the bid; a short position at the ask. So a trade starts a spread down.
 *  - Profit on a position = direction x (exit - entry) x lots x contract size, measured
 *    in the instrument's quote currency, then converted to the account currency.
 *  - A stop-loss or take-profit that is hit fills at the price that triggered it (the
 *    next available price), not at the level you set. If the market jumps through your
 *    stop you get the worse price: that is what a stop is.
 *  - Margin = value of the position in the account currency / leverage, where leverage
 *    is the LOWER of the account's cap and the instrument's own limit.
 *  - Equity = balance + the floating profit of every open position.
 *
 * Open decisions this does NOT settle (kept out of the maths on purpose): whether
 * positions may be held over the weekend, overnight swap charges, news-trading
 * restrictions, and what happens to open trades during a price outage. See
 * docs/deferred-items.md (Trading terminal).
 */

export type Side = "buy" | "sell";
export type CloseReason = "manual" | "stop_loss" | "take_profit" | "admin" | "breach" | "pass";

/** One accepted price, with the id of the stored tick so a fill can always be traced to the exact price used. */
export type Quote = { tickId: string; bid: D; ask: D; at: Date };

export type OpenPosition = {
  id: string;
  symbol: string;
  side: Side;
  lots: D;
  openPrice: D;
  stopLoss: D | null;
  takeProfit: D | null;
  marginUsed: D;
};

const ZERO = new Prisma.Decimal(0);
export const round2 = (v: D): D => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
/** Margin is rounded UP: never under-state what a position needs. */
const roundMargin = (v: D): D => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);

export function entryPrice(side: Side, q: Pick<Quote, "bid" | "ask">): D {
  return side === "buy" ? q.ask : q.bid;
}
export function exitPrice(side: Side, q: Pick<Quote, "bid" | "ask">): D {
  return side === "buy" ? q.bid : q.ask;
}

/** Profit in the instrument's quote currency (not yet converted, not rounded). */
export function pnlInQuoteCurrency(side: Side, open: D, exit: D, lots: D, spec: InstrumentSpec): D {
  const move = side === "buy" ? exit.minus(open) : open.minus(exit);
  return move.times(lots).times(spec.contractSize);
}

/** The leverage that applies: the lower of the account's cap and the instrument's limit. Always at least 1. */
export function effectiveLeverage(accountCap: number, spec: InstrumentSpec): number {
  return Math.max(1, Math.min(accountCap, spec.maxLeverage));
}

export function requiredMargin(lots: D, price: D, spec: InstrumentSpec, accountCap: number, convert: Converter): D {
  const notionalInQuote = lots.times(spec.contractSize).times(price);
  return roundMargin(convert(notionalInQuote, spec.quoteCurrency).dividedBy(effectiveLeverage(accountCap, spec)));
}

/** Floating profit of one open position at the current price, in the account currency (rounded to cents). */
export function floatingPnl(pos: OpenPosition, spec: InstrumentSpec, quote: Pick<Quote, "bid" | "ask">, convert: Converter): D {
  const quoteCcy = pnlInQuoteCurrency(pos.side, pos.openPrice, exitPrice(pos.side, quote), pos.lots, spec);
  return round2(convert(quoteCcy, spec.quoteCurrency));
}

export type AccountSnapshot = { balance: D; floatingPnl: D; equity: D; usedMargin: D; freeMargin: D };

/** The live state of an account: equity is balance plus the floating profit of everything open. */
export function accountSnapshot(input: {
  balance: D;
  positions: OpenPosition[];
  specs: Record<string, InstrumentSpec>;
  quotes: Record<string, Pick<Quote, "bid" | "ask">>;
  convert: Converter;
}): AccountSnapshot {
  let floating = ZERO;
  let usedMargin = ZERO;
  for (const p of input.positions) {
    const spec = input.specs[p.symbol];
    const quote = input.quotes[p.symbol];
    if (!spec || !quote) throw new Error(`No price for open position on ${p.symbol}.`);
    floating = floating.plus(floatingPnl(p, spec, quote, input.convert));
    usedMargin = usedMargin.plus(p.marginUsed);
  }
  const equity = round2(input.balance.plus(floating));
  return { balance: round2(input.balance), floatingPnl: round2(floating), equity, usedMargin: round2(usedMargin), freeMargin: round2(equity.minus(usedMargin)) };
}

export type OrderRejection = {
  code: "instrument_disabled" | "market_closed" | "bad_lots" | "bad_side" | "bad_stop_loss" | "bad_take_profit" | "too_many_positions" | "insufficient_margin";
  message: string;
};

/**
 * Is a stop-loss / take-profit on the right side of the price, and far enough from it?
 * `reference` is the price the level is measured from: the fill price for a new order,
 * the price the position would close at right now when a level is changed afterwards
 * (so a stop can never be set where it would trigger at once). Returns the first
 * problem, or null if both levels are acceptable (either may be absent).
 */
export function stopLevelProblem(side: Side, stopLoss: D | null, takeProfit: D | null, reference: D, gap: D): OrderRejection | null {
  const long = side === "buy";
  if (stopLoss) {
    const wrongSide = long ? stopLoss.greaterThan(reference.minus(gap)) : stopLoss.lessThan(reference.plus(gap));
    if (stopLoss.lessThanOrEqualTo(0) || wrongSide) {
      return { code: "bad_stop_loss", message: `A stop-loss for a ${side} must be at least ${gap.toString()} ${long ? "below" : "above"} the price (${reference.toString()}).` };
    }
  }
  if (takeProfit) {
    const wrongSide = long ? takeProfit.lessThan(reference.plus(gap)) : takeProfit.greaterThan(reference.minus(gap));
    if (takeProfit.lessThanOrEqualTo(0) || wrongSide) {
      return { code: "bad_take_profit", message: `A take-profit for a ${side} must be at least ${gap.toString()} ${long ? "above" : "below"} the price (${reference.toString()}).` };
    }
  }
  return null;
}

export type PreparedOrder ={ ok: true; fillPrice: D; marginRequired: D } | ({ ok: false } & OrderRejection);

/**
 * Everything that must be true before a market order is allowed, in the order a
 * trader would want to hear about it. Returns the price it would fill at and the
 * margin it would use, or the first reason it can't.
 */
export function prepareMarketOrder(input: {
  side: Side;
  lots: D;
  stopLoss: D | null;
  takeProfit: D | null;
  spec: InstrumentSpec;
  quote: Pick<Quote, "bid" | "ask">;
  now: Date;
  /** Equity right now and the margin already in use (from accountSnapshot). */
  equity: D;
  usedMargin: D;
  openPositionCount: number;
  maxOpenPositions: number;
  accountLeverageCap: number;
  convert: Converter;
}): PreparedOrder {
  const reject = (code: OrderRejection["code"], message: string): PreparedOrder => ({ ok: false, code, message });
  const { spec } = input;

  if (!spec.enabled) return reject("instrument_disabled", `${spec.symbol} is not available for trading.`);
  if (!isMarketOpen(spec.sessions, input.now)) return reject("market_closed", `The ${spec.symbol} market is closed.`);
  if (input.side !== "buy" && input.side !== "sell") return reject("bad_side", "Choose buy or sell.");
  const lotIssue = lotProblem(spec, input.lots);
  if (lotIssue) return reject("bad_lots", lotIssue);
  if (input.openPositionCount >= input.maxOpenPositions) {
    return reject("too_many_positions", `You can have at most ${input.maxOpenPositions} open positions at once.`);
  }

  const fill = entryPrice(input.side, input.quote);
  const levelProblem = stopLevelProblem(input.side, input.stopLoss, input.takeProfit, fill, spec.minStopDistance);
  if (levelProblem) return { ok: false, ...levelProblem };

  const marginRequired = requiredMargin(input.lots, fill, spec, input.accountLeverageCap, input.convert);
  if (input.usedMargin.plus(marginRequired).greaterThan(input.equity)) {
    return reject("insufficient_margin", `Not enough free margin: this needs ${marginRequired.toFixed(2)} and ${round2(input.equity.minus(input.usedMargin)).toFixed(2)} is free.`);
  }
  return { ok: true, fillPrice: fill, marginRequired };
}

/**
 * Has the current price hit a position's stop-loss or take-profit? A long position
 * is stopped on the bid, a short on the ask. If both could apply, the stop-loss wins
 * (the cautious reading).
 */
export function stopTrigger(pos: Pick<OpenPosition, "side" | "stopLoss" | "takeProfit">, quote: Pick<Quote, "bid" | "ask">): "stop_loss" | "take_profit" | null {
  const px = exitPrice(pos.side, quote);
  if (pos.stopLoss && (pos.side === "buy" ? px.lessThanOrEqualTo(pos.stopLoss) : px.greaterThanOrEqualTo(pos.stopLoss))) return "stop_loss";
  if (pos.takeProfit && (pos.side === "buy" ? px.greaterThanOrEqualTo(pos.takeProfit) : px.lessThanOrEqualTo(pos.takeProfit))) return "take_profit";
  return null;
}

export type CloseOutcome = {
  closePrice: D;
  /** Profit before charges, in the account currency, to the cent. */
  grossPnl: D;
  commission: D;
  /** What changes the balance: gross profit minus commission. */
  netPnl: D;
  /** Account-currency value of one unit of the quote currency at the moment of closing (kept for the record). */
  fxRate: D;
};

export function closeOutcome(pos: OpenPosition, spec: InstrumentSpec, quote: Pick<Quote, "bid" | "ask">, convert: Converter): CloseOutcome {
  const closePrice = exitPrice(pos.side, quote);
  const quoteCcy = pnlInQuoteCurrency(pos.side, pos.openPrice, closePrice, pos.lots, spec);
  const grossPnl = round2(convert(quoteCcy, spec.quoteCurrency));
  const commission = round2(spec.commissionPerLot.times(pos.lots));
  return { closePrice, grossPnl, commission, netPnl: grossPnl.minus(commission), fxRate: convert(new Prisma.Decimal(1), spec.quoteCurrency) };
}
