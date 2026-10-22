import { Prisma } from "@prisma/client";
import { DEFAULT_INSTRUMENTS, type InstrumentSpec } from "./instruments";

/**
 * Where prices come from. A provider turns "give me the latest prices for these
 * instruments" into a list of quotes; everything after that (checking them, storing
 * them, using them) is the same whichever provider supplied them.
 *
 *   PRICE_DRIVER=tradermade   real prices from TraderMade's REST /live endpoint
 *   PRICE_DRIVER=simulated    invented prices that wander, for the local and review
 *                             copies (never for anything real)
 *   (unset)                   no price service runs
 *
 * The TraderMade key (TRADERMADE_API_KEY) lives only on the server: it is sent in the
 * request URL, so URLs are never logged and errors never include them.
 */
export type ProviderQuote = { symbol: string; bid: Prisma.Decimal; ask: Prisma.Decimal; quoteTs: Date };

export interface PriceProvider {
  readonly name: string;
  fetchQuotes(specs: InstrumentSpec[], now: Date): Promise<ProviderQuote[]>;
}

const asDecimal = (v: unknown): Prisma.Decimal | null => {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return new Prisma.Decimal(v);
};

/**
 * Reads TraderMade's /live response (spec: LiveRatesResponse). A forex quote is
 * identified by base_currency + quote_currency, a CFD by `instrument`. The response
 * carries one timestamp (epoch seconds) for the whole request, used as every
 * quote's time. Quotes for instruments we don't trade, and error entries, are skipped.
 */
export function parseTraderMadeLive(json: unknown, specs: InstrumentSpec[], fallbackNow: Date): ProviderQuote[] {
  if (!json || typeof json !== "object") throw new Error("TraderMade returned something that is not a price list.");
  const body = json as { quotes?: unknown; timestamp?: unknown };
  if (!Array.isArray(body.quotes)) throw new Error("TraderMade's response had no quotes.");

  const quoteTs = typeof body.timestamp === "number" && Number.isFinite(body.timestamp) ? new Date(body.timestamp * 1000) : fallbackNow;
  const bySymbol = new Map(specs.map((s) => [s.providerSymbol, s.symbol]));
  const out: ProviderQuote[] = [];

  for (const item of body.quotes) {
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    if ("error" in q) continue;
    const providerSymbol = typeof q.instrument === "string" ? q.instrument : typeof q.base_currency === "string" && typeof q.quote_currency === "string" ? `${q.base_currency}${q.quote_currency}` : null;
    const symbol = providerSymbol ? bySymbol.get(providerSymbol) : undefined;
    const bid = asDecimal(q.bid);
    const ask = asDecimal(q.ask);
    if (!symbol || !bid || !ask) continue;
    out.push({ symbol, bid, ask, quoteTs });
  }
  return out;
}

export class TraderMadeProvider implements PriceProvider {
  readonly name = "tradermade";
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly baseUrl = "https://marketdata.tradermade.com/api/v1",
    private readonly timeoutMs = 5000,
  ) {}

  async fetchQuotes(specs: InstrumentSpec[], now: Date): Promise<ProviderQuote[]> {
    if (specs.length === 0) return [];
    const list = specs.map((s) => s.providerSymbol).join(",");
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/live?currency=${encodeURIComponent(list)}&api_key=${encodeURIComponent(this.apiKey)}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { Accept: "application/json" },
      });
    } catch (err) {
      // Never include the URL: it contains the key.
      throw new Error(`Could not reach TraderMade (${err instanceof Error ? err.name : "network error"}).`);
    }
    if (!res.ok) throw new Error(`TraderMade responded with status ${res.status}.`);
    return parseTraderMadeLive(await res.json(), specs, now);
  }
}

/** A made-up feed for local and review use: each price takes a small random step. Deterministic when given a seed. */
export class SimulatedProvider implements PriceProvider {
  readonly name = "simulated";
  private mids = new Map<string, number>();
  private forced = new Map<string, number>();
  private next: () => number;

  constructor(seed = Date.now() & 0xffffffff) {
    let s = seed | 0;
    this.next = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Makes the next quote for a symbol land exactly here (to demonstrate a stop being hit, or a bad spike). */
  force(symbol: string, mid: number) {
    this.forced.set(symbol, mid);
  }

  async fetchQuotes(specs: InstrumentSpec[], now: Date): Promise<ProviderQuote[]> {
    return specs.flatMap((s) => {
      const base = DEFAULT_INSTRUMENTS.find((i) => i.symbol === s.symbol);
      if (!base) return [];
      const price = Number(base.samplePrice);
      const prev = this.mids.get(s.symbol) ?? price;
      // A step of about 0.004% of the price: small enough never to look like a jump.
      const step = (this.next() - 0.5) * price * 0.00008;
      const forced = this.forced.get(s.symbol);
      const mid = forced ?? prev + step;
      this.forced.delete(s.symbol);
      this.mids.set(s.symbol, mid);
      const half = Number(base.sampleSpread) / 2;
      const dp = s.digits;
      return [{ symbol: s.symbol, bid: new Prisma.Decimal((mid - half).toFixed(dp)), ask: new Prisma.Decimal((mid + half).toFixed(dp)), quoteTs: now }];
    });
  }
}

/** The provider the environment asks for, or null if prices are switched off. */
export function priceProviderFromEnv(env: Record<string, string | undefined> = process.env): PriceProvider | null {
  switch (env.PRICE_DRIVER) {
    case "tradermade": {
      const key = env.TRADERMADE_API_KEY?.trim();
      if (!key) throw new Error("PRICE_DRIVER=tradermade needs TRADERMADE_API_KEY.");
      return new TraderMadeProvider(key);
    }
    case "simulated":
      return new SimulatedProvider();
    default:
      return null;
  }
}
