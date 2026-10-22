import { Prisma, type TradeCloseReason } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { ValidationError } from "@/server/errors";
import { lockAccount } from "@/server/row-lock";
import { accountSnapshot, closeOutcome, floatingPnl, prepareMarketOrder, stopTrigger, type AccountSnapshot, type OpenPosition, type Quote, type Side } from "./engine";
import { converterTo, RateUnavailable } from "./fx";
import { getFreshPrices, loadInstruments, type FreshPrices } from "./price-service";
import type { InstrumentSpec } from "./instruments";

/**
 * Trading on a simulated account: opening and closing positions against the current
 * price, and closing them when a stop-loss or take-profit is hit.
 *
 * Every action runs in a transaction that takes the account's row lock first (the
 * same lock the payout and account-state code use), so two orders, an order and a
 * stop being hit, or a close and a close can never interleave on one account. The
 * balance, the position and the audit entry are written together or not at all.
 *
 * Deliberately NOT done here (the next step): writing live equity back to the
 * account, running the challenge rules on every price change, closing everything on
 * a breach, daily rollover and trading-day counting. Nothing here changes
 * Account.equity; closing a position changes Account.balance by the realised profit.
 * Until that step exists, nothing in the portal or back office calls these functions.
 */

export const MAX_OPEN_POSITIONS = 20;

/** A refused order, with a stable code the screen can act on. */
export class TradeRejected extends ValidationError {
  constructor(public code: string, message: string, status = 422) {
    super(message, status);
    this.name = "TradeRejected";
  }
}

export type Actor = { type: "trader"; personId: string } | { type: "admin"; adminId: string } | { type: "system" };

const asDecimal = (v: string | number | Prisma.Decimal | null | undefined, field: string): Prisma.Decimal | null => {
  if (v === null || v === undefined || v === "") return null;
  try {
    const d = new Prisma.Decimal(v);
    if (!d.isFinite()) throw new Error("not finite");
    return d;
  } catch {
    throw new TradeRejected("bad_number", `${field} is not a valid number.`, 400);
  }
};

function auditActor(actor: Actor) {
  return actor.type === "trader"
    ? ({ actorType: "trader", actorId: actor.personId } as const)
    : actor.type === "admin"
      ? ({ actorType: "admin", actorId: actor.adminId } as const)
      : ({ actorType: "system", actorId: null } as const);
}

type Tx = Prisma.TransactionClient;

function toOpenPosition(p: { id: string; symbol: string; side: Side; lots: Prisma.Decimal; openPrice: Prisma.Decimal; stopLoss: Prisma.Decimal | null; takeProfit: Prisma.Decimal | null; marginUsed: Prisma.Decimal }): OpenPosition {
  return { id: p.id, symbol: p.symbol, side: p.side, lots: p.lots, openPrice: p.openPrice, stopLoss: p.stopLoss, takeProfit: p.takeProfit, marginUsed: p.marginUsed };
}

/** The live value of an account's open positions. Throws a clear 503 if a price needed for it isn't current. */
function snapshotFor(balance: Prisma.Decimal, positions: OpenPosition[], specs: Record<string, InstrumentSpec>, prices: FreshPrices, currency: string): AccountSnapshot {
  try {
    return accountSnapshot({ balance, positions, specs, quotes: prices.quotes, convert: converterTo(currency, prices.mids) });
  } catch (err) {
    if (err instanceof RateUnavailable || (err instanceof Error && /No price for open position/.test(err.message))) {
      throw new TradeRejected("prices_unavailable", "Prices aren't available right now for part of this account, so it can't be valued. Please try again in a moment.", 503);
    }
    throw err;
  }
}

async function loadMarket(client: Tx | typeof db, now: Date) {
  const [specList, prices] = await Promise.all([loadInstruments(client as typeof db), getFreshPrices(now, undefined, client as typeof db)]);
  return { specs: Object.fromEntries(specList.map((s) => [s.symbol, s])) as Record<string, InstrumentSpec>, prices };
}

export async function placeMarketOrder(input: {
  accountId: string;
  personId: string;
  symbol: string;
  side: Side;
  lots: string | number;
  stopLoss?: string | number | null;
  takeProfit?: string | number | null;
  ipAddress: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const lots = asDecimal(input.lots, "Size");
  if (!lots) throw new TradeRejected("bad_lots", "Enter a size.", 400);
  const stopLoss = asDecimal(input.stopLoss, "Stop-loss");
  const takeProfit = asDecimal(input.takeProfit, "Take-profit");

  return db.$transaction(async (tx) => {
    await lockAccount(tx, input.accountId);
    const account = await tx.account.findUniqueOrThrow({ where: { id: input.accountId }, include: { challengeType: true, currentPhase: true } });

    if (account.personId !== input.personId) throw new ValidationError("Account not found.", 404);
    if (account.voidedAt) throw new TradeRejected("account_voided", "This account is voided.");
    if (account.status !== "active" || (account.phase !== "evaluation" && account.phase !== "funded")) {
      throw new TradeRejected("account_not_tradable", "This account isn't open for trading.");
    }
    // Deny by default: an instrument must be on the challenge's permitted list. An empty list permits nothing.
    if (!account.challengeType.permittedInstruments.includes(input.symbol)) {
      throw new TradeRejected("instrument_not_permitted", `${input.symbol} isn't permitted on this challenge.`);
    }

    const { specs, prices } = await loadMarket(tx, now);
    const spec = specs[input.symbol];
    if (!spec) throw new TradeRejected("unknown_instrument", `${input.symbol} isn't a tradable instrument.`);
    const quote = prices.quotes[input.symbol];
    if (!quote) throw new TradeRejected("no_price", `There's no current price for ${input.symbol}, so it can't be traded right now.`, 503);

    const openRows = await tx.tradePosition.findMany({ where: { accountId: account.id, status: "open" } });
    const open = openRows.map(toOpenPosition);
    const currency = account.challengeType.currency;
    const snap = snapshotFor(account.balance, open, specs, prices, currency);

    let prepared;
    try {
      prepared = prepareMarketOrder({
        side: input.side,
        lots,
        stopLoss,
        takeProfit,
        spec,
        quote,
        now,
        equity: snap.equity,
        usedMargin: snap.usedMargin,
        openPositionCount: open.length,
        maxOpenPositions: MAX_OPEN_POSITIONS,
        accountLeverageCap: account.challengeType.leverageCap,
        convert: converterTo(currency, prices.mids),
      });
    } catch (err) {
      if (err instanceof RateUnavailable) throw new TradeRejected("prices_unavailable", "Prices aren't available right now, so the margin can't be worked out. Please try again in a moment.", 503);
      throw err;
    }
    if (!prepared.ok) throw new TradeRejected(prepared.code, prepared.message);

    const position = await tx.tradePosition.create({
      data: {
        accountId: account.id,
        symbol: spec.symbol,
        side: input.side,
        lots,
        openPrice: prepared.fillPrice,
        openedAt: now,
        openTickId: quote.tickId,
        stopLoss,
        takeProfit,
        marginUsed: prepared.marginRequired,
      },
    });
    await writeAuditLog(
      {
        ...auditActor({ type: "trader", personId: input.personId }),
        action: "trade.opened",
        entityType: "TradePosition",
        entityId: position.id,
        after: { accountId: account.id, symbol: spec.symbol, side: input.side, lots: lots.toString(), price: prepared.fillPrice.toString(), tickId: quote.tickId, stopLoss: stopLoss?.toString() ?? null, takeProfit: takeProfit?.toString() ?? null, margin: prepared.marginRequired.toString() },
        ipAddress: input.ipAddress,
      },
      tx,
    );
    return position;
  });
}

/** Closes one position inside a transaction that already holds the account lock. */
async function closeInTx(tx: Tx, position: { id: string; accountId: string }, reason: TradeCloseReason, actor: Actor, now: Date, market: { specs: Record<string, InstrumentSpec>; prices: FreshPrices }, ipAddress: string | null) {
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

  // Only a position that is STILL open can be closed, whoever else is trying to at the same moment.
  const changed = await tx.tradePosition.updateMany({
    where: { id: row.id, status: "open" },
    data: { status: "closed", closePrice: outcome.closePrice, closedAt: now, closeTickId: quote.tickId, closeReason: reason, grossPnl: outcome.grossPnl, commission: outcome.commission, closeFxRate: outcome.fxRate },
  });
  if (changed.count === 0) throw new TradeRejected("already_closed", "This position is already closed.", 409);

  const balanceBefore = row.account.balance;
  const updated = await tx.account.update({ where: { id: row.accountId }, data: { balance: { increment: outcome.netPnl } } });
  await writeAuditLog(
    {
      ...auditActor(actor),
      action: "trade.closed",
      entityType: "TradePosition",
      entityId: row.id,
      before: { balance: balanceBefore.toString() },
      after: { balance: updated.balance.toString(), reason, price: outcome.closePrice.toString(), tickId: quote.tickId, grossPnl: outcome.grossPnl.toString(), commission: outcome.commission.toString(), netPnl: outcome.netPnl.toString() },
      ipAddress,
    },
    tx,
  );
  return { positionId: row.id, accountId: row.accountId, reason, ...outcome };
}

export async function closePosition(input: { accountId: string; positionId: string; reason?: TradeCloseReason; actor: Actor; ipAddress?: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    await lockAccount(tx, input.accountId);
    const p = await tx.tradePosition.findUnique({ where: { id: input.positionId }, select: { id: true, accountId: true } });
    if (!p || p.accountId !== input.accountId) throw new ValidationError("Position not found.", 404);
    if (input.actor.type === "trader") {
      const owner = await tx.account.findUniqueOrThrow({ where: { id: input.accountId }, select: { personId: true } });
      if (owner.personId !== input.actor.personId) throw new ValidationError("Position not found.", 404);
    }
    const market = await loadMarket(tx, now);
    return closeInTx(tx, p, input.reason ?? "manual", input.actor, now, market, input.ipAddress ?? null);
  });
}

/** Closes every open position on an account (for a breach or a pass, in the next step). One transaction: all or none. */
export async function closeAllPositions(input: { accountId: string; reason: TradeCloseReason; actor: Actor; ipAddress?: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    await lockAccount(tx, input.accountId);
    const open = await tx.tradePosition.findMany({ where: { accountId: input.accountId, status: "open" }, select: { id: true, accountId: true } });
    if (open.length === 0) return [];
    const market = await loadMarket(tx, now);
    const closed = [];
    for (const p of open) closed.push(await closeInTx(tx, p, input.reason, input.actor, now, market, input.ipAddress ?? null));
    return closed;
  });
}

/**
 * Looks at every open position with a stop-loss or take-profit and closes the ones
 * whose price has been reached. A position whose instrument has no current price is
 * left alone (never closed on stale data). Each close is its own transaction, so one
 * failing never stops the rest.
 */
export async function processStops(now: Date = new Date()): Promise<{ checked: number; closed: number; skipped: number; failed: number }> {
  const candidates = await db.tradePosition.findMany({
    where: { status: "open", OR: [{ stopLoss: { not: null } }, { takeProfit: { not: null } }] },
  });
  if (candidates.length === 0) return { checked: 0, closed: 0, skipped: 0, failed: 0 };
  const prices = await getFreshPrices(now);

  let closed = 0;
  let skipped = 0;
  let failed = 0;
  for (const p of candidates) {
    const quote = prices.quotes[p.symbol];
    if (!quote) {
      skipped++;
      continue;
    }
    const hit = stopTrigger(toOpenPosition(p), quote);
    if (!hit) continue;
    try {
      await closePosition({ accountId: p.accountId, positionId: p.id, reason: hit, actor: { type: "system" }, now });
      closed++;
    } catch (err) {
      if (err instanceof TradeRejected && err.code === "already_closed") continue;
      failed++;
      console.error("[trading] could not close a stopped position", p.id, err instanceof Error ? err.message : err);
    }
  }
  return { checked: candidates.length, closed, skipped, failed };
}

/** The live state of an account: balance, floating profit, equity, margin, and each open position's current profit. Writes nothing. */
export async function getAccountSnapshot(accountId: string, now: Date = new Date()) {
  const account = await db.account.findUniqueOrThrow({ where: { id: accountId }, include: { challengeType: true } });
  const rows = await db.tradePosition.findMany({ where: { accountId, status: "open" }, orderBy: { openedAt: "asc" } });
  const open = rows.map(toOpenPosition);
  const { specs, prices } = await loadMarket(db, now);
  const currency = account.challengeType.currency;
  const snapshot = snapshotFor(account.balance, open, specs, prices, currency);
  const convert = converterTo(currency, prices.mids);
  return {
    ...snapshot,
    currency,
    positions: rows.map((r) => ({ ...r, floatingPnl: floatingPnl(toOpenPosition(r), specs[r.symbol], prices.quotes[r.symbol] as Quote, convert) })),
  };
}
