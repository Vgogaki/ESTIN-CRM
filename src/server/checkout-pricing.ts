import { Prisma } from "@prisma/client";

/**
 * Pure rules for pricing and timing a portal checkout (no database), so they can
 * be tested like the rules engine. Money is always Decimal, never floating point.
 */

/** "1,250.00 EUR": exact decimal text with thousands separators, never through floating point. */
export function formatMoney(amount: Prisma.Decimal, currency: string): string {
  const [int, frac] = amount.toFixed(2).split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac} ${currency}`;
}

/** A checkout is open for this long. After it, the price and offer are looked at again. */
export const CHECKOUT_TTL_MS = 30 * 60_000;

export function checkoutExpiry(now: Date): Date {
  return new Date(now.getTime() + CHECKOUT_TTL_MS);
}

export function isCheckoutExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export type OfferPrice = { id: string; campaignCode: string; offerFee: Prisma.Decimal };

/** If several offers apply, the trader gets the cheapest one. */
export function chooseBestOffer<T extends { offerFee: Prisma.Decimal }>(offers: T[]): T | null {
  if (offers.length === 0) return null;
  return offers.reduce((best, o) => (o.offerFee.lessThan(best.offerFee) ? o : best));
}

/**
 * What is charged: the offer price if there is an offer, otherwise the fee. Never
 * more than the normal fee (an offer issued against an older, dearer version of
 * the challenge can't raise the price), and never negative.
 */
export function amountDueFor(fee: Prisma.Decimal, offer: { offerFee: Prisma.Decimal } | null): Prisma.Decimal {
  if (!offer) return fee;
  const price = offer.offerFee.lessThan(fee) ? offer.offerFee : fee;
  return price.lessThan(0) ? new Prisma.Decimal(0) : price;
}
