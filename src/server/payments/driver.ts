/**
 * How a challenge purchase in the portal is paid.
 *
 * No payment provider has been chosen (docs/decisions.md #5), so nothing here can
 * take real money. PAYMENT_DRIVER decides what the "Pay" step does:
 *
 *   (unset / anything else)  "none": purchases are switched off. The portal says so
 *                            and nothing can be bought. This is the safe default and
 *                            what a live system without a provider must run.
 *   "demo"                   a clearly labelled SIMULATED payment, for the local copy
 *                            and the review copy only. It runs the real order path
 *                            (price, terms, offer, account creation) but no money moves.
 *
 * A real provider later becomes a third value that creates its own hosted payment
 * and confirms it by a signed webhook; the rest of the flow does not change.
 * An unrecognised value is treated as "none": it fails closed.
 */
export type PaymentMode = "none" | "demo";

export const DEMO_PROVIDER = "demo-checkout";

export function paymentMode(env: Record<string, string | undefined> = process.env): PaymentMode {
  return env.PAYMENT_DRIVER === "demo" ? "demo" : "none";
}

/**
 * The most challenge accounts one trader may hold at once (active, in pass review or
 * funded; closed, breached and voided ones don't count). MAX_ACTIVE_ACCOUNTS unset,
 * 0 or not a whole number means NO limit: the number is a business decision that
 * has not been made yet (docs/decisions.md), so it is a setting, off by default.
 */
export function maxActiveAccounts(env: Record<string, string | undefined> = process.env): number | null {
  const raw = env.MAX_ACTIVE_ACCOUNTS?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

export function purchasesAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return paymentMode(env) !== "none";
}
