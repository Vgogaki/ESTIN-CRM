import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { floatingPnl } from "./engine";
import { converterTo } from "./fx";
import { loadMarket, snapshotFor, toOpenPosition, TradeRejected } from "./core";
import { closePosition } from "./trading";

/**
 * The back office's view of a trader's simulated trading, and the one thing staff can
 * do to it: force-close an open position. Viewing needs traders.view; the force-close
 * needs trading.forceClose and a written reason, which is kept in the audit log with
 * the staff member, the exact price used and the balance before and after.
 */

const str = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : d.toString());

const CLOSED_SHOWN = 25;

/** Every account of this person that has traded in the terminal: open positions with live profit, and the latest closed trades. */
export async function getPersonTrading(personId: string, now: Date = new Date()) {
  const accounts = await db.account.findMany({
    where: { personId, positions: { some: {} } },
    include: { challengeType: true },
    orderBy: { createdAt: "desc" },
  });
  if (accounts.length === 0) return { pricesCurrent: true, accounts: [] };

  const { specs, prices } = await loadMarket(db, now);
  const out = [];
  for (const a of accounts) {
    const [openRows, closedRows] = await Promise.all([
      db.tradePosition.findMany({ where: { accountId: a.id, status: "open" }, orderBy: { openedAt: "asc" } }),
      db.tradePosition.findMany({ where: { accountId: a.id, status: "closed" }, orderBy: { closedAt: "desc" }, take: CLOSED_SHOWN }),
    ]);
    const currency = a.challengeType.currency;
    const open = openRows.map(toOpenPosition);
    // If a price a position needs isn't current, nothing is valued: staff are shown that, not a guess.
    let snapshot: ReturnType<typeof snapshotFor> | null = null;
    try {
      snapshot = snapshotFor(a.balance, open, specs, prices, currency);
    } catch (err) {
      if (!(err instanceof TradeRejected && err.code === "prices_unavailable")) throw err;
    }
    const convert = converterTo(currency, prices.mids);
    out.push({
      id: a.id,
      name: a.challengeType.name,
      currency,
      status: a.status,
      phase: a.phase,
      voided: a.voidedAt !== null,
      balance: a.balance.toString(),
      liveEquity: str(snapshot?.equity),
      floatingPnl: str(snapshot?.floatingPnl),
      open: openRows.map((r) => {
        const quote = prices.quotes[r.symbol];
        return {
          id: r.id,
          symbol: r.symbol,
          side: r.side,
          lots: r.lots.toString(),
          openPrice: r.openPrice.toString(),
          openedAt: r.openedAt.toISOString(),
          stopLoss: str(r.stopLoss),
          takeProfit: str(r.takeProfit),
          floatingPnl: snapshot && quote ? floatingPnl(toOpenPosition(r), specs[r.symbol], quote, convert).toString() : null,
        };
      }),
      closed: closedRows.map((r) => ({
        id: r.id,
        symbol: r.symbol,
        side: r.side,
        lots: r.lots.toString(),
        openPrice: r.openPrice.toString(),
        closePrice: str(r.closePrice),
        closedAt: r.closedAt?.toISOString() ?? null,
        closeReason: r.closeReason,
        netPnl: r.grossPnl ? r.grossPnl.minus(r.commission).toString() : null,
      })),
    });
  }
  return { pricesCurrent: Object.keys(prices.quotes).length > 0, accounts: out };
}

/**
 * Closes one open position at the current price on a staff member's decision. The
 * reason is required. Refused (never guessed) if there is no current price for the
 * instrument. The balance moves by the real result, exactly as for a trader's own close.
 */
export async function forceClosePosition(input: { personId: string; accountId: string; positionId: string; adminId: string; reason: string; ipAddress?: string | null; now?: Date }) {
  const reason = input.reason.trim();
  if (reason.length < 5) throw new ValidationError("Give a reason (at least a few words): it is kept in the audit log.", 400);

  // The account must belong to the trader whose page this was done from.
  const account = await db.account.findUnique({ where: { id: input.accountId }, select: { personId: true } });
  if (!account || account.personId !== input.personId) throw new ValidationError("Position not found.", 404);

  return closePosition({
    accountId: input.accountId,
    positionId: input.positionId,
    reason: "admin",
    actor: { type: "admin", adminId: input.adminId },
    ipAddress: input.ipAddress ?? null,
    note: reason.slice(0, 1000),
    now: input.now,
  });
}
