import { Prisma } from "@prisma/client";

const D = (v: string | number) => new Prisma.Decimal(v);

/**
 * What the trading engine needs to know about one instrument. Held in the
 * Instrument table (data, not code: staff can change it without a release) and
 * converted to this shape; the engine never sees a database row.
 */
export type InstrumentSpec = {
  /** ESTIN's name for it, e.g. EURUSD. What a challenge's "permitted instruments" list uses. */
  symbol: string;
  /** What the price provider calls it. Usually the same. */
  providerSymbol: string;
  name: string;
  assetClass: "forex" | "metal" | "index";
  /** The currency profit and loss on this instrument is measured in. */
  quoteCurrency: string;
  digits: number;
  /** Price units in one "pip" (or one point for an index). Display only. */
  pipSize: Prisma.Decimal;
  /** Units in 1.00 lot. */
  contractSize: Prisma.Decimal;
  minLot: Prisma.Decimal;
  maxLot: Prisma.Decimal;
  lotStep: Prisma.Decimal;
  /** The highest leverage this instrument allows; the account's own cap applies too (the lower of the two). */
  maxLeverage: number;
  /** How close (in price units) a stop-loss or take-profit may sit to the entry price. */
  minStopDistance: Prisma.Decimal;
  /** A price move bigger than this (percent, between two ticks) is held until the next tick confirms it. */
  maxJumpPct: Prisma.Decimal;
  /** A bid/ask gap wider than this (percent of price) is treated as a bad quote. */
  maxSpreadPct: Prisma.Decimal;
  /** Flat charge per 1.00 lot, in the account currency, taken when a trade is closed. Zero by default. */
  commissionPerLot: Prisma.Decimal;
  /** When the market is open: windows in minutes since Sunday 00:00 UTC, [start, end). */
  sessions: [number, number][];
  enabled: boolean;
};

const FX_SESSIONS: [number, number][] = [[0 * 1440 + 22 * 60, 5 * 1440 + 21 * 60]]; // Sun 22:00 to Fri 21:00 UTC
const INDEX_SESSIONS: [number, number][] = [[0 * 1440 + 23 * 60, 5 * 1440 + 21 * 60]]; // Sun 23:00 to Fri 21:00 UTC
const UK_SESSIONS: [number, number][] = [1, 2, 3, 4, 5].map((d) => [d * 1440 + 7 * 60, d * 1440 + 21 * 60] as [number, number]); // Mon-Fri 07:00-21:00 UTC

/**
 * The starting set. Every number here is a PLACEHOLDER chosen to be sensible, not
 * a decision: lot limits, leverage, stop distances, bad-quote thresholds and
 * trading hours must be confirmed (trading hours against the provider's own
 * market_opening_times) before real use. `samplePrice` is used only by the
 * simulated price driver.
 */
export const DEFAULT_INSTRUMENTS: (Omit<InstrumentSpec, "pipSize" | "contractSize" | "minLot" | "maxLot" | "lotStep" | "minStopDistance" | "maxJumpPct" | "maxSpreadPct" | "commissionPerLot"> & {
  pipSize: string;
  contractSize: string;
  minLot: string;
  maxLot: string;
  lotStep: string;
  minStopDistance: string;
  maxJumpPct: string;
  maxSpreadPct: string;
  commissionPerLot: string;
  samplePrice: string;
  sampleSpread: string;
})[] = [
  { symbol: "EURUSD", providerSymbol: "EURUSD", name: "Euro / US Dollar", assetClass: "forex", quoteCurrency: "USD", digits: 5, pipSize: "0.0001", contractSize: "100000", minLot: "0.01", maxLot: "50", lotStep: "0.01", maxLeverage: 100, minStopDistance: "0.0003", maxJumpPct: "0.5", maxSpreadPct: "0.1", commissionPerLot: "0", sessions: FX_SESSIONS, enabled: true, samplePrice: "1.18180", sampleSpread: "0.00002" },
  { symbol: "GBPUSD", providerSymbol: "GBPUSD", name: "Pound / US Dollar", assetClass: "forex", quoteCurrency: "USD", digits: 5, pipSize: "0.0001", contractSize: "100000", minLot: "0.01", maxLot: "50", lotStep: "0.01", maxLeverage: 100, minStopDistance: "0.0003", maxJumpPct: "0.5", maxSpreadPct: "0.1", commissionPerLot: "0", sessions: FX_SESSIONS, enabled: true, samplePrice: "1.31700", sampleSpread: "0.00003" },
  { symbol: "USDJPY", providerSymbol: "USDJPY", name: "US Dollar / Yen", assetClass: "forex", quoteCurrency: "JPY", digits: 3, pipSize: "0.01", contractSize: "100000", minLot: "0.01", maxLot: "50", lotStep: "0.01", maxLeverage: 100, minStopDistance: "0.03", maxJumpPct: "0.5", maxSpreadPct: "0.1", commissionPerLot: "0", sessions: FX_SESSIONS, enabled: true, samplePrice: "151.420", sampleSpread: "0.004" },
  { symbol: "XAUUSD", providerSymbol: "XAUUSD", name: "Gold / US Dollar", assetClass: "metal", quoteCurrency: "USD", digits: 2, pipSize: "0.1", contractSize: "100", minLot: "0.01", maxLot: "20", lotStep: "0.01", maxLeverage: 100, minStopDistance: "0.5", maxJumpPct: "1.0", maxSpreadPct: "0.2", commissionPerLot: "0", sessions: FX_SESSIONS, enabled: true, samplePrice: "2338.50", sampleSpread: "0.35" },
  { symbol: "US30", providerSymbol: "US30", name: "Dow Jones 30", assetClass: "index", quoteCurrency: "USD", digits: 1, pipSize: "1", contractSize: "1", minLot: "0.1", maxLot: "100", lotStep: "0.1", maxLeverage: 100, minStopDistance: "5", maxJumpPct: "1.5", maxSpreadPct: "0.2", commissionPerLot: "0", sessions: INDEX_SESSIONS, enabled: true, samplePrice: "39120.0", sampleSpread: "1.8" },
  { symbol: "UK100", providerSymbol: "UK100", name: "FTSE 100", assetClass: "index", quoteCurrency: "GBP", digits: 1, pipSize: "1", contractSize: "1", minLot: "0.1", maxLot: "100", lotStep: "0.1", maxLeverage: 100, minStopDistance: "5", maxJumpPct: "1.5", maxSpreadPct: "0.2", commissionPerLot: "0", sessions: UK_SESSIONS, enabled: true, samplePrice: "8546.5", sampleSpread: "1.2" },
];

/** Builds the engine's spec from a plain description (a database row's fields, or a default above). */
export function specFrom(r: {
  symbol: string;
  providerSymbol: string;
  name: string;
  assetClass: "forex" | "metal" | "index";
  quoteCurrency: string;
  digits: number;
  pipSize: Prisma.Decimal | string | number;
  contractSize: Prisma.Decimal | string | number;
  minLot: Prisma.Decimal | string | number;
  maxLot: Prisma.Decimal | string | number;
  lotStep: Prisma.Decimal | string | number;
  maxLeverage: number;
  minStopDistance: Prisma.Decimal | string | number;
  maxJumpPct: Prisma.Decimal | string | number;
  maxSpreadPct: Prisma.Decimal | string | number;
  commissionPerLot: Prisma.Decimal | string | number;
  sessions: unknown;
  enabled: boolean;
}): InstrumentSpec {
  return {
    symbol: r.symbol,
    providerSymbol: r.providerSymbol,
    name: r.name,
    assetClass: r.assetClass,
    quoteCurrency: r.quoteCurrency,
    digits: r.digits,
    pipSize: D(r.pipSize.toString()),
    contractSize: D(r.contractSize.toString()),
    minLot: D(r.minLot.toString()),
    maxLot: D(r.maxLot.toString()),
    lotStep: D(r.lotStep.toString()),
    maxLeverage: r.maxLeverage,
    minStopDistance: D(r.minStopDistance.toString()),
    maxJumpPct: D(r.maxJumpPct.toString()),
    maxSpreadPct: D(r.maxSpreadPct.toString()),
    commissionPerLot: D(r.commissionPerLot.toString()),
    sessions: Array.isArray(r.sessions) ? (r.sessions as [number, number][]) : [],
    enabled: r.enabled,
  };
}

/** Null if the lot size is acceptable, otherwise the reason it isn't. */
export function lotProblem(spec: InstrumentSpec, lots: Prisma.Decimal): string | null {
  if (lots.lessThan(spec.minLot)) return `The smallest size for ${spec.symbol} is ${spec.minLot.toString()} lots.`;
  if (lots.greaterThan(spec.maxLot)) return `The largest size for ${spec.symbol} is ${spec.maxLot.toString()} lots.`;
  // Must be a whole number of steps above the minimum.
  const steps = lots.minus(spec.minLot).dividedBy(spec.lotStep);
  if (!steps.isInteger()) return `Size for ${spec.symbol} must be in steps of ${spec.lotStep.toString()} lots.`;
  return null;
}
