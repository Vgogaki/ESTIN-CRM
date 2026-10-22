import { Prisma } from "@prisma/client";

/**
 * Decides whether a price from the provider can be trusted. Pure.
 *
 * Why it matters: a single bad price (a spike, a crossed quote, a feed glitch)
 * could stop out a trader's positions and breach their account. Every price the
 * provider sends is stored (so any dispute can be checked against the record), but
 * only ACCEPTED prices are ever used for trading. The rules, in order:
 *
 *  1. Non-positive price                     -> rejected
 *  2. Ask below bid (crossed)                -> rejected
 *  3. Spread wider than the instrument allows -> rejected
 *  4. Older than a price already accepted    -> rejected (out of order)
 *  5. First price ever seen                  -> accepted
 *  6. Moved no more than the allowed jump    -> accepted
 *  7. Moved MORE than the allowed jump       -> "suspect": held, not used. If the very
 *     next price agrees with it (within the allowed jump of the suspect), the market
 *     really did move and that next price is accepted (and says which suspect it
 *     confirms). If the next price is back near the last accepted price, the
 *     suspect was a bad tick and is simply never used.
 *
 * The cost of rule 7 is that a genuine large move (the weekend gap, a news spike)
 * takes one extra tick to be used. That is the right trade: a one-tick delay is
 * harmless, a wrong stop-out is not.
 */
export type RawQuote = { bid: Prisma.Decimal; ask: Prisma.Decimal; quoteTs: Date };

export type FilterState = {
  lastAccepted: { bid: Prisma.Decimal; ask: Prisma.Decimal; quoteTs: Date } | null;
  /** The most recent suspect price seen since the last accepted one, if any. */
  pendingSuspect: { id: string; bid: Prisma.Decimal; ask: Prisma.Decimal } | null;
};

export type QuoteLimits = { maxJumpPct: Prisma.Decimal; maxSpreadPct: Prisma.Decimal };

export type Classification = {
  status: "accepted" | "suspect" | "rejected";
  reason: string | null;
  confirmsTickId: string | null;
};

const mid = (q: { bid: Prisma.Decimal; ask: Prisma.Decimal }) => q.bid.plus(q.ask).dividedBy(2);
const pctMove = (from: Prisma.Decimal, to: Prisma.Decimal) => to.minus(from).abs().dividedBy(from).times(100);

export function classifyQuote(q: RawQuote, state: FilterState, limits: QuoteLimits): Classification {
  const rejected = (reason: string): Classification => ({ status: "rejected", reason, confirmsTickId: null });

  if (q.bid.lessThanOrEqualTo(0) || q.ask.lessThanOrEqualTo(0)) return rejected("Price is zero or negative.");
  if (q.ask.lessThan(q.bid)) return rejected("Crossed quote: ask is below bid.");
  const spreadPct = q.ask.minus(q.bid).dividedBy(mid(q)).times(100);
  if (spreadPct.greaterThan(limits.maxSpreadPct)) return rejected(`Spread of ${spreadPct.toFixed(3)}% is wider than the ${limits.maxSpreadPct.toString()}% allowed.`);

  const last = state.lastAccepted;
  if (!last) return { status: "accepted", reason: null, confirmsTickId: null };
  if (q.quoteTs.getTime() < last.quoteTs.getTime()) return rejected("Out of order: older than a price already accepted.");

  if (pctMove(mid(last), mid(q)).lessThanOrEqualTo(limits.maxJumpPct)) {
    return { status: "accepted", reason: null, confirmsTickId: null };
  }

  // A big move. If the previous price was already a suspect and this one agrees with it, the move is real.
  const suspect = state.pendingSuspect;
  if (suspect && pctMove(mid(suspect), mid(q)).lessThanOrEqualTo(limits.maxJumpPct)) {
    return { status: "accepted", reason: `Confirms an earlier jump of ${pctMove(mid(last), mid(q)).toFixed(3)}%.`, confirmsTickId: suspect.id };
  }
  return { status: "suspect", reason: `Jumped ${pctMove(mid(last), mid(q)).toFixed(3)}% from the last accepted price; held until the next price confirms it.`, confirmsTickId: null };
}
