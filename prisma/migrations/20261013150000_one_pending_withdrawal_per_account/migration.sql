-- One pending payout request per account, enforced by the database itself.
--
-- The application also checks this (and takes a row lock so that two requests
-- arriving at the same moment are handled one after the other), but a rule that
-- protects money should not depend on application code alone. If a second
-- pending request is ever attempted, Postgres rejects it.
--
-- A partial unique index: it only covers rows whose status is 'pending', so
-- approved, declined and paid payouts are unaffected and an account can have
-- any number of those.
--
-- If this migration fails, an account already has two pending payouts. That
-- needs a person to look at it: do NOT delete either row (records are never
-- hard-deleted); decline one with a reason in the back office, then re-run.
CREATE UNIQUE INDEX "Withdrawal_one_pending_per_account"
  ON "Withdrawal" ("accountId")
  WHERE "status" = 'pending';
