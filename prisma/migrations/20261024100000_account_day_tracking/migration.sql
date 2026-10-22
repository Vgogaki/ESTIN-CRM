-- Terminal accounts: remember the UTC day the daily reset last ran, and the UTC day
-- of the last closed trade, so each day is reset once and counted as a trading day
-- once, however many times the same code runs.
ALTER TABLE "Account" ADD COLUMN "lastRolloverOn" DATE;
ALTER TABLE "Account" ADD COLUMN "lastTradingDayOn" DATE;
