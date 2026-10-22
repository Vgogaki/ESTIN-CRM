import { Prisma, type TradeCloseReason } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";
import { accountSnapshot, closeOutcome, type AccountSnapshot, type OpenPosition, type Side } from "./engine";
import { converterTo, RateUnavailable } from "./fx";
import { getFreshPrices, loadInstruments, type FreshPrices } from "./price-service";
import { isNewTradingDay, utcDay } from "./day";
import type { InstrumentSpec } from "./instruments";

/**
 * Shared internals of the trading code (used by trading.ts for orders and by
 * account-link.ts for the equity and rules link). Kept apart so neither imports the
 * other. See trading.ts for what the whole is for.
 */

export type Tx = Prisma.TransactionClient;
export type Market = { specs: Record<string, InstrumentSpec>; prices: FreshPrices };

/** A refused order or action, with a stable code the screen can act on. */
export class TradeRejected extends ValidationError {
  constructor(public code: string, message: string, status = 422) {
    super(message, status);
    this.name = "TradeRejected";
  }
}

export type Actor = { type: "trader"; personId: string } | { type: "admin"; adminId: string } | { type: "system" };

export function auditActor(actor: Actor) {
  return actor.type === "trader"
    ? ({ actorType: "trader", actorId: actor.personId } as const)
    : actor.type === "admin"
      ? ({ actorType: "admin", actorId: actor.adminId } as const)
      : ({ actorType: "system", actorId: null } as const);
}

export function toOpenPosition(p: { id: string; symbol: string; side: Side; lots: Prisma.Decimal; openPrice: Prisma.Decimal; stopLoss: Prisma.Decimal | null; takeProfit: Prisma.Decimal | null; marginUsed: Prisma.Decimal }): OpenPosition {
  return { id: p.id, symbol: p.symbol, side: p.side, lots: p.lots, openPrice: p.openPrice, stopLoss: p.stopLoss, takeProfit: p.takeProfit, marginUsed: p.marginUsed };
}

/** The live value of an account's open positions. Throws a clear 503 if a price needed for it isn't current. */
export function snapshotFor(balance: Prisma.Decimal, positions: OpenPosition[], specs: Record<string, InstrumentSpec>, prices: FreshPrices, currency: string): AccountSnapshot {
  try {
    return accountSnapshot({ balance, positions, specs, quotes: prices.quotes, convert: converterTo(currency, prices.mids) });
  } catch (err) {
    if (err instanceof RateUnavailable || (err instanceof Error && /No price for open position/.test(err.message))) {
      throw new TradeRejected("prices_unavailable", "Prices aren't available right now for part of this account, so it can't be valued. Please try again in a moment.", 503);
    }
    throw err;
  }
}

export async function loadMarket(client: Tx | typeof db, now: Date): Promise<Market> {
  const [specList, prices] = await Promise.all([loadInstruments(client as typeof db), getFreshPrices(now, undefined, client as typeof db)]);
  return { specs: Object.fromEntries(specList.map((s) => [s.symbol, s])) as Record<string, InstrumentSpec>, prices };
}

/**
 * Closes one position inside a transaction that already holds the account lock: marks
 * it closed at the current price, changes the balance by the realised profit, counts
 * the day as a trading day if it is the first close of that UTC day, and writes the
 * audit entry. Only a position that is STILL open can be closed, whoever else is
 * trying to at the same moment.
 */
export async function closeInTx(tx: Tx, position: { id: string; accountId: string }, reason: TradeCloseReason, actor: Actor, now: Date, market: Market, ipAddress: string | null) {
  const row = await tx.tradePosition.findUniqueOrThrow({ where: { id: position.id }, include: { account: { include: { challengeType: true } } } });
  if (row.status !== "open") throw new TradeRejected("already_closed", "This position is already closed.", 409);
  const spec = market.specs[row.symbol];
  const quote = market.prices.quotes[row.symbol];
  if (!spec || !quote) throw new TradeRejected("no_price", `There's no current price for ${row.symbol}, so it can't be closed right now.`, 503);

  let outcome;
  try {
    outcome = closeOutcome(toOpenPosition(row), spec, quote, converterTo(row.account.challengeType.currency, market.prices.mids));
  } catch (err) {
    if (err instanceof RateUnavailable) throw new TradeRejected("prices_unavailable", "Prices aren't available right now, so the profit can't be worked out. Please try again in a moment.", 503);
    throw err;
  }

  const changed = await tx.tradePosition.updateMany({
    where: { id: row.id, status: "open" },
    data: { status: "closed", closePrice: outcome.closePrice, closedAt: now, closeTickId: quote.tickId, closeReason: reason, grossPnl: outcome.grossPnl, commission: outcome.commission, closeFxRate: outcome.fxRate },
  });
  if (changed.count === 0) throw new TradeRejected("already_closed", "This position is already closed.", 409);

  // A trading day is any UTC day on which a trade was closed (decided 29 Sept 2026).
  const newDay = isNewTradingDay(row.account.lastTradingDayOn, now);
  const balanceBefore = row.account.balance;
  const updated = await tx.account.update({
    where: { id: row.accountId },
    data: { balance: { increment: outcome.netPnl }, ...(newDay ? { tradingDays: { increment: 1 }, lastTradingDayOn: utcDay(now) } : {}) },
  });
  await writeAuditLog(
    {
      ...auditActor(actor),
      action: "trade.closed",
      entityType: "TradePosition",
      entityId: row.id,
      before: { balance: balanceBefore.toString() },
      after: { balance: updated.balance.toString(), reason, price: outcome.closePrice.toString(), tickId: quote.tickId, grossPnl: outcome.grossPnl.toString(), commission: outcome.commission.toString(), netPnl: outcome.netPnl.toString(), newTradingDay: newDay },
      ipAddress,
    },
    tx,
  );
  return { positionId: row.id, accountId: row.accountId, reason, ...outcome };
}

/** Has this account ever traded in the terminal? Such an account's equity comes from its trades, not from what staff type. */
export async function isTerminalAccount(client: Pick<typeof db, "tradePosition">, accountId: string): Promise<boolean> {
  return (await client.tradePosition.count({ where: { accountId } })) > 0;
}
