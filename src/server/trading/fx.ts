import { Prisma } from "@prisma/client";

/**
 * Currency conversion for profit, loss and margin. Pure.
 *
 * A trade's profit is measured in the instrument's quote currency (USD for EURUSD,
 * JPY for USDJPY, GBP for UK100) but the account is held in its own currency
 * (EUR for today's challenges). Everything is converted through US dollars using
 * the latest mid prices of the major pairs, so the converter needs, for each
 * currency involved, either CCYUSD or USDCCY in the prices it is given.
 *
 * If a rate that is needed is missing the converter throws RateUnavailable and the
 * caller must refuse to trade or to value the account: guessing a rate is how
 * wrong balances happen.
 */
export class RateUnavailable extends Error {
  constructor(public currency: string) {
    super(`No current exchange rate for ${currency}.`);
    this.name = "RateUnavailable";
  }
}

export type MidPrices = Record<string, Prisma.Decimal>;

/** How many US dollars one unit of `currency` is worth. */
export function usdPer(currency: string, mids: MidPrices): Prisma.Decimal {
  if (currency === "USD") return new Prisma.Decimal(1);
  const direct = mids[`${currency}USD`];
  if (direct && direct.greaterThan(0)) return direct;
  const inverse = mids[`USD${currency}`];
  if (inverse && inverse.greaterThan(0)) return new Prisma.Decimal(1).dividedBy(inverse);
  throw new RateUnavailable(currency);
}

/** Converts an amount between currencies at the given mids. Unrounded: callers round money once, at the end. */
export function convertAmount(amount: Prisma.Decimal, from: string, to: string, mids: MidPrices): Prisma.Decimal {
  if (from === to) return amount;
  return amount.times(usdPer(from, mids)).dividedBy(usdPer(to, mids));
}

export type Converter = (amount: Prisma.Decimal, from: string) => Prisma.Decimal;

/** A converter into one account currency, over one set of prices. */
export function converterTo(accountCurrency: string, mids: MidPrices): Converter {
  return (amount, from) => convertAmount(amount, from, accountCurrency, mids);
}
