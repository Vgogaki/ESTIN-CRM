import type { Prisma } from "@prisma/client";
import { ValidationError } from "@/server/errors";

/**
 * Row locks for the actions that must not run twice at once on the same
 * record (two payout requests, an approve and a decline, two "advance"
 * clicks, the expiry job racing a staff override).
 *
 * How it is used: open a transaction, take the lock FIRST, then re-read the
 * record and re-check everything the decision depends on, then write. A second
 * request for the same record waits at the lock until the first has committed,
 * and then sees the first one's result when it re-reads — so it fails cleanly
 * (or is skipped) instead of overwriting it.
 *
 * Locks are held only for the length of the transaction. Keep email, network
 * and other slow work OUTSIDE the transaction.
 *
 * Lock order, to rule out deadlocks: always the person first, then the
 * account. No function may take them the other way round.
 */
type Tx = Prisma.TransactionClient;

export async function lockPerson(tx: Tx, personId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Person" WHERE "id" = ${personId} FOR UPDATE`;
  if (rows.length === 0) throw new ValidationError("Person not found.", 404);
}

/** Serialises "generate my code" and "deactivate code" for one affiliate. Independent of person/account, so it cannot join a lock cycle with them. */
export async function lockAffiliate(tx: Tx, affiliateId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Affiliate" WHERE "id" = ${affiliateId} FOR UPDATE`;
  if (rows.length === 0) throw new ValidationError("Affiliate not found.", 404);
}

export async function lockAccount(tx: Tx, accountId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Account" WHERE "id" = ${accountId} FOR UPDATE`;
  if (rows.length === 0) throw new ValidationError("Account not found.", 404);
}
