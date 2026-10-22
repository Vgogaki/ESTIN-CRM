import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { classifyQuote, type FilterState } from "./quote-filter";
import { DEFAULT_INSTRUMENTS, specFrom, type InstrumentSpec } from "./instruments";
import type { ProviderQuote, PriceProvider } from "./providers";
import type { Quote } from "./engine";
import type { MidPrices } from "./fx";

/**
 * The price service: takes prices from a provider, decides which can be trusted,
 * stores every one of them, and answers "what is the current price?" for the
 * trading engine.
 *
 *  - EVERY price received is stored (accepted, suspect or rejected) in the
 *    append-only PriceTick table, so any dispute can be checked against the record.
 *  - Only ACCEPTED prices are used for trading (quote-filter.ts decides).
 *  - A price counts as "current" only if we received it within the last
 *    PRICE_MAX_AGE_MS (default 15 seconds). Older than that, trading on it is
 *    refused: no price is better than a wrong one.
 *  - To keep the table from growing without limit, a price identical to the last
 *    accepted one is stored at most once every HEARTBEAT_MS (5 s); any change is
 *    stored at once. The heartbeat is also what keeps a quiet market "current".
 *
 * Several copies of the app can run at once: ingestion takes a database lock, so
 * two copies never interleave, and a duplicate of an already-stored price is ignored.
 */

type Client = Pick<typeof db, "priceTick" | "instrument" | "$queryRaw">;

export const HEARTBEAT_MS = 5000;
export const DEFAULT_MAX_PRICE_AGE_MS = 15_000;

export function maxPriceAgeMs(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.PRICE_MAX_AGE_MS);
  return Number.isFinite(n) && n >= 1000 ? n : DEFAULT_MAX_PRICE_AGE_MS;
}

/** Creates any starting instrument that doesn't exist yet. Never overwrites one staff have edited. Safe to run on every start. */
export async function seedInstruments(client: Pick<typeof db, "instrument"> = db): Promise<number> {
  let created = 0;
  for (const i of DEFAULT_INSTRUMENTS) {
    const exists = await client.instrument.findUnique({ where: { symbol: i.symbol }, select: { symbol: true } });
    if (exists) continue;
    await client.instrument.create({
      data: {
        symbol: i.symbol,
        providerSymbol: i.providerSymbol,
        name: i.name,
        assetClass: i.assetClass,
        quoteCurrency: i.quoteCurrency,
        digits: i.digits,
        pipSize: i.pipSize,
        contractSize: i.contractSize,
        minLot: i.minLot,
        maxLot: i.maxLot,
        lotStep: i.lotStep,
        maxLeverage: i.maxLeverage,
        minStopDistance: i.minStopDistance,
        maxJumpPct: i.maxJumpPct,
        maxSpreadPct: i.maxSpreadPct,
        commissionPerLot: i.commissionPerLot,
        sessions: i.sessions,
        enabled: i.enabled,
      },
    });
    created++;
  }
  return created;
}

export async function loadInstruments(client: Pick<typeof db, "instrument"> = db, opts: { enabledOnly?: boolean } = {}): Promise<InstrumentSpec[]> {
  const rows = await client.instrument.findMany({ where: opts.enabledOnly ? { enabled: true } : undefined, orderBy: { symbol: "asc" } });
  return rows.map((r) => specFrom({ ...r, assetClass: r.assetClass }));
}

export type IngestResult = { accepted: number; suspect: number; rejected: number; unchanged: number; duplicates: number };

async function filterState(client: Client, symbol: string): Promise<{ state: FilterState; lastReceivedAt: Date | null }> {
  const last = await client.priceTick.findFirst({ where: { symbol, status: "accepted" }, orderBy: [{ receivedAt: "desc" }, { id: "desc" }] });
  const suspect = await client.priceTick.findFirst({
    where: { symbol, status: "suspect", ...(last ? { receivedAt: { gt: last.receivedAt } } : {}) },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
  });
  return {
    state: {
      lastAccepted: last ? { bid: last.bid, ask: last.ask, quoteTs: last.quoteTs } : null,
      pendingSuspect: suspect ? { id: suspect.id, bid: suspect.bid, ask: suspect.ask } : null,
    },
    lastReceivedAt: last?.receivedAt ?? null,
  };
}

/** Checks and stores a batch of provider quotes. Quotes for instruments we don't have (or have switched off) are ignored. */
export async function ingestQuotes(input: { quotes: ProviderQuote[]; source: string; receivedAt: Date }, client: Client = db): Promise<IngestResult> {
  const specs = new Map((await loadInstruments(client as typeof db, { enabledOnly: true })).map((s) => [s.symbol, s]));
  const result: IngestResult = { accepted: 0, suspect: 0, rejected: 0, unchanged: 0, duplicates: 0 };

  for (const q of input.quotes) {
    const spec = specs.get(q.symbol);
    if (!spec) continue;
    const { state, lastReceivedAt } = await filterState(client, q.symbol);
    const verdict = classifyQuote(q, state, { maxJumpPct: spec.maxJumpPct, maxSpreadPct: spec.maxSpreadPct });

    // An unchanged price is stored only as a heartbeat.
    const last = state.lastAccepted;
    if (verdict.status === "accepted" && last && lastReceivedAt && last.bid.equals(q.bid) && last.ask.equals(q.ask) && input.receivedAt.getTime() - lastReceivedAt.getTime() < HEARTBEAT_MS) {
      result.unchanged++;
      continue;
    }
    // "Insert unless it is already there" rather than insert-and-catch: inside a transaction a
    // failed insert would abort every statement after it, so a duplicate (the provider
    // repeating itself, an old price sent again) must never be allowed to fail at all.
    const stored = await client.priceTick.createMany({
      data: [{ symbol: q.symbol, bid: q.bid, ask: q.ask, quoteTs: q.quoteTs, receivedAt: input.receivedAt, source: input.source, status: verdict.status, reason: verdict.reason, confirmsTickId: verdict.confirmsTickId }],
      skipDuplicates: true,
    });
    if (stored.count === 0) result.duplicates++;
    else result[verdict.status]++;
  }
  return result;
}

/** One poll: fetch from the provider, then check and store, under a lock so two copies of the app can't interleave. */
export async function runPriceCycle(provider: PriceProvider, now: Date = new Date()): Promise<IngestResult> {
  const specs = await loadInstruments(db, { enabledOnly: true });
  const quotes = await provider.fetchQuotes(specs, now);
  return db.$transaction(async (tx) => {
    // executeRaw, not queryRaw: the lock call returns "void", which the query path cannot read back.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(724001)`;
    return ingestQuotes({ quotes, source: provider.name, receivedAt: now }, tx as unknown as Client);
  });
}

export type FreshPrices = {
  /** Each instrument's latest usable price (received within the allowed age). */
  quotes: Record<string, Quote>;
  /** Mid prices of the same, for currency conversion. */
  mids: MidPrices;
};

/**
 * The current price of every instrument that has one. An instrument with no price
 * received in the last `maxAgeMs` is simply absent: callers must treat absence as
 * "can't trade, can't value", never fall back to an older price.
 */
export async function getFreshPrices(now: Date = new Date(), maxAgeMs: number = maxPriceAgeMs(), client: Pick<typeof db, "$queryRaw"> = db): Promise<FreshPrices> {
  const since = new Date(now.getTime() - maxAgeMs);
  const rows = await client.$queryRaw<{ id: string; symbol: string; bid: Prisma.Decimal; ask: Prisma.Decimal; quoteTs: Date; receivedAt: Date }[]>`
    SELECT DISTINCT ON ("symbol") "id", "symbol", "bid", "ask", "quoteTs", "receivedAt"
    FROM "PriceTick"
    WHERE "status" = 'accepted' AND "receivedAt" >= ${since} AND "receivedAt" <= ${new Date(now.getTime() + 5000)}
    ORDER BY "symbol", "receivedAt" DESC, "id" DESC`;
  const quotes: Record<string, Quote> = {};
  const mids: MidPrices = {};
  for (const r of rows) {
    const bid = new Prisma.Decimal(r.bid.toString());
    const ask = new Prisma.Decimal(r.ask.toString());
    quotes[r.symbol] = { tickId: r.id, bid, ask, at: r.receivedAt };
    mids[r.symbol] = bid.plus(ask).dividedBy(2);
  }
  return { quotes, mids };
}
