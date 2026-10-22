import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { lockAccount } from "@/server/row-lock";
import { notifyTrader } from "@/server/notifications";
import { determineAutoTransition, evaluateAccount } from "@/server/rules";
import { closeInTx, loadMarket, snapshotFor, toOpenPosition, TradeRejected, type Market } from "./core";
import { needsRollover, rolloverValues, utcDay } from "./day";

/**
 * The link between trading and the challenge rules: what turns trades and prices into
 * the account's equity and applies the rules to it. For every account that trades in
 * the terminal, on every price update:
 *
 *  1. DAILY RESET (at midnight UTC, applied on the first look after it, from the
 *     account's last stored equity): the day starts from yesterday's closing equity
 *     (the daily loss limit is measured from it) and the trailing high-water mark rises
 *     to the best END-OF-DAY equity, never to an intraday high. Once per UTC day.
 *  2. EQUITY: equity = balance + the floating profit of every open position, at the
 *     current prices, written to the account. If a price needed to value the account
 *     is not current, NOTHING happens (the equity stays at its last value and no
 *     breach can be declared on stale data). That is the placeholder outage policy.
 *  3. RULES: the same evaluateAccount / determineAutoTransition the back office uses.
 *     A breached daily or maximum loss limit closes every position at the current
 *     prices and closes the account as breached; for an evaluation account, reaching
 *     the profit target (with the minimum trading days done) closes every position
 *     and moves the account to pass review. FUNDED accounts are now checked against
 *     their loss limits too (before this, only evaluation accounts were).
 *
 * All of it runs under the account's row lock, in one transaction: the closing
 * trades, the new state and the audit entries are written together or not at all.
 * Notifications go out after it commits.
 */

export type SyncStatus = "synced" | "frozen" | "skipped" | "breached" | "passed";
export type SyncResult = { status: SyncStatus; rolledOver: boolean };

const TICK_EVERY_MS = 60_000; // one equity-curve point per account per minute

function stateOf(a: { status: string; phase: string; equity: Prisma.Decimal; dayStartEquity: Prisma.Decimal; peakEquity: Prisma.Decimal; tradingDays: number }) {
  return { status: a.status, phase: a.phase, equity: a.equity.toString(), dayStartEquity: a.dayStartEquity.toString(), peakEquity: a.peakEquity.toString(), tradingDays: a.tradingDays };
}

export async function syncAccountEquity(accountId: string, opts: { now?: Date; market?: Market } = {}): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  let notice: { kind: "breach" | "pass"; personId: string; challenge: string; reason: string } | null = null;

  const result = await db.$transaction(async (tx): Promise<SyncResult> => {
    await lockAccount(tx, accountId);
    const account = await tx.account.findUniqueOrThrow({ where: { id: accountId }, include: { challengeType: true, currentPhase: true } });
    if (account.voidedAt || account.status !== "active" || (account.phase !== "evaluation" && account.phase !== "funded")) {
      return { status: "skipped", rolledOver: false };
    }

    // 1. Daily reset.
    let dayStart = account.dayStartEquity;
    let peak = account.peakEquity;
    let rolledOver = false;
    if (needsRollover(account.lastRolloverOn, now)) {
      const v = rolloverValues({ equity: account.equity, peakEquity: account.peakEquity });
      dayStart = v.dayStartEquity;
      peak = v.peakEquity;
      rolledOver = true;
      await tx.account.update({ where: { id: account.id }, data: { dayStartEquity: dayStart, peakEquity: peak, lastRolloverOn: utcDay(now) } });
      await writeAuditLog(
        {
          actorType: "system",
          actorId: null,
          action: "account.day_rollover",
          entityType: "Account",
          entityId: account.id,
          before: { dayStartEquity: account.dayStartEquity.toString(), peakEquity: account.peakEquity.toString() },
          after: { dayStartEquity: dayStart.toString(), peakEquity: peak.toString(), day: utcDay(now).toISOString().slice(0, 10) },
          reason: "Daily reset at midnight UTC: day-start equity set; trailing high-water mark raised to the end-of-day equity if higher.",
        },
        tx,
      );
    }

    // 2. Equity at current prices. Stale or missing prices: freeze, change nothing further.
    const openRows = await tx.tradePosition.findMany({ where: { accountId: account.id, status: "open" } });
    const market = opts.market ?? (await loadMarket(tx, now));
    let snap;
    try {
      snap = snapshotFor(account.balance, openRows.map(toOpenPosition), market.specs, market.prices, account.challengeType.currency);
    } catch (err) {
      if (err instanceof TradeRejected && err.code === "prices_unavailable") return { status: "frozen", rolledOver };
      throw err;
    }

    // 3. The rules.
    const phase = account.currentPhase;
    const transition = phase
      ? determineAutoTransition(
          evaluateAccount({
            accountSize: account.challengeType.accountSize,
            equity: snap.equity,
            dayStartEquity: dayStart,
            peakEquity: peak,
            tradingDays: account.tradingDays,
            profitTargetPct: phase.profitTargetPct,
            dailyLossPct: phase.dailyLossPct,
            maxLossPct: phase.maxLossPct,
            drawdownType: phase.drawdownType,
            minTradingDays: phase.minTradingDays,
          }),
        )
      : null;

    if (transition) {
      // Everything is closed at the current prices first; the account's final equity is then its balance.
      for (const p of openRows) await closeInTx(tx, p, transition.kind === "breach" ? "breach" : "pass", { type: "system" }, now, market, null);
      const after = await tx.account.findUniqueOrThrow({ where: { id: account.id } });
      const patch =
        transition.kind === "breach"
          ? { equity: after.balance, status: "breached" as const, phase: "closed" as const, endedAt: now, closeReason: transition.reason }
          : { equity: after.balance, phase: "pass_review" as const };
      const final = await tx.account.update({ where: { id: account.id }, data: patch });
      await writeAuditLog(
        {
          actorType: "system",
          actorId: null,
          action: transition.kind === "breach" ? "account.auto_breached" : "account.auto_pass_review",
          entityType: "Account",
          entityId: account.id,
          before: stateOf({ ...account, equity: snap.equity, dayStartEquity: dayStart, peakEquity: peak }),
          after: stateOf(final),
          reason: transition.reason,
        },
        tx,
      );
      notice = { kind: transition.kind, personId: account.personId, challenge: account.challengeType.name, reason: transition.reason };
      return { status: transition.kind === "breach" ? "breached" : "passed", rolledOver };
    }

    // No transition: record the equity, and an equity-curve point at most once a minute.
    await tx.account.update({ where: { id: account.id }, data: { equity: snap.equity } });
    const last = await tx.equityTick.findFirst({ where: { accountId: account.id }, orderBy: { timestamp: "desc" } });
    if (!last || now.getTime() - last.timestamp.getTime() >= TICK_EVERY_MS) {
      await tx.equityTick.create({
        data: {
          accountId: account.id,
          equity: snap.equity,
          balance: snap.balance,
          openPnl: snap.floatingPnl,
          closedTrades: await tx.tradePosition.count({ where: { accountId: account.id, status: "closed" } }),
          tradingDay: utcDay(now),
          timestamp: now,
        },
      });
    }
    return { status: "synced", rolledOver };
  });

  // Told only after the change has committed.
  if (notice) {
    const n: { kind: "breach" | "pass"; personId: string; challenge: string; reason: string } = notice;
    await notifyTrader({
      personId: n.personId,
      type: n.kind === "breach" ? "breach" : "phase_passed",
      title: n.kind === "breach" ? "Account closed — rule breached" : "Profit target reached",
      body: n.kind === "breach" ? `Your ${n.challenge} account was closed: ${n.reason}` : `Your ${n.challenge} account hit its profit target and is now under review.`,
      link: "/portal",
    });
  }
  return result;
}

/** Best effort, after an order or a close: bring the account's equity up to date without ever failing the caller's action. */
export async function syncAfterTrade(accountId: string, now?: Date): Promise<void> {
  try {
    await syncAccountEquity(accountId, { now });
  } catch (err) {
    console.error("[trading] could not update equity after a trade", accountId, err instanceof Error ? err.message : err);
  }
}

/**
 * One pass over every account that trades in the terminal and needs looking at: those
 * holding open positions (to follow the price), and those that have traded but have not
 * yet had today's reset. Prices are read once for the whole pass. One account failing
 * never stops the others.
 */
export async function syncTerminalAccounts(now: Date = new Date()): Promise<{ checked: number; synced: number; frozen: number; breached: number; passed: number; failed: number }> {
  const today = utcDay(now);
  const accounts = await db.account.findMany({
    where: {
      status: "active",
      voidedAt: null,
      phase: { in: ["evaluation", "funded"] },
      positions: { some: {} },
      OR: [{ positions: { some: { status: "open" } } }, { lastRolloverOn: null }, { lastRolloverOn: { lt: today } }],
    },
    select: { id: true },
  });
  const out = { checked: accounts.length, synced: 0, frozen: 0, breached: 0, passed: 0, failed: 0 };
  if (accounts.length === 0) return out;

  const market = await loadMarket(db, now);
  for (const { id } of accounts) {
    try {
      const r = await syncAccountEquity(id, { now, market });
      if (r.status === "synced") out.synced++;
      else if (r.status === "frozen") out.frozen++;
      else if (r.status === "breached") out.breached++;
      else if (r.status === "passed") out.passed++;
    } catch (err) {
      out.failed++;
      console.error("[trading] could not sync account", id, err instanceof Error ? err.message : err);
    }
  }
  return out;
}
