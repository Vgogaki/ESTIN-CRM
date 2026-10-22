-- Trading engine foundation: instruments, stored prices, and simulated positions.
--
--  Instrument     what the engine knows about each tradable instrument (data, not code)
--  PriceTick      every price the provider sends, exactly as received (APPEND-ONLY)
--  TradePosition  a simulated position; every fill names the exact price tick it used

-- CreateEnum
CREATE TYPE "InstrumentClass" AS ENUM ('forex', 'metal', 'index');
-- CreateEnum
CREATE TYPE "PriceTickStatus" AS ENUM ('accepted', 'suspect', 'rejected');
-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('buy', 'sell');
-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('open', 'closed');
-- CreateEnum
CREATE TYPE "TradeCloseReason" AS ENUM ('manual', 'stop_loss', 'take_profit', 'admin', 'breach', 'pass');
-- CreateTable
CREATE TABLE "Instrument" (
    "symbol" TEXT NOT NULL,
    "providerSymbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetClass" "InstrumentClass" NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "digits" INTEGER NOT NULL,
    "pipSize" DECIMAL(18,8) NOT NULL,
    "contractSize" DECIMAL(18,4) NOT NULL,
    "minLot" DECIMAL(10,2) NOT NULL,
    "maxLot" DECIMAL(10,2) NOT NULL,
    "lotStep" DECIMAL(10,2) NOT NULL,
    "maxLeverage" INTEGER NOT NULL,
    "minStopDistance" DECIMAL(18,8) NOT NULL,
    "maxJumpPct" DECIMAL(6,3) NOT NULL,
    "maxSpreadPct" DECIMAL(6,3) NOT NULL,
    "commissionPerLot" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sessions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("symbol")
);
-- CreateTable
CREATE TABLE "PriceTick" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "bid" DECIMAL(18,8) NOT NULL,
    "ask" DECIMAL(18,8) NOT NULL,
    "quoteTs" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "status" "PriceTickStatus" NOT NULL,
    "reason" TEXT,
    "confirmsTickId" TEXT,
    CONSTRAINT "PriceTick_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "TradePosition" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "lots" DECIMAL(10,2) NOT NULL,
    "openPrice" DECIMAL(18,8) NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openTickId" TEXT NOT NULL,
    "stopLoss" DECIMAL(18,8),
    "takeProfit" DECIMAL(18,8),
    "marginUsed" DECIMAL(14,2) NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'open',
    "closePrice" DECIMAL(18,8),
    "closedAt" TIMESTAMP(3),
    "closeTickId" TEXT,
    "closeReason" "TradeCloseReason",
    "grossPnl" DECIMAL(14,2),
    "commission" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "closeFxRate" DECIMAL(18,8),
    CONSTRAINT "TradePosition_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "PriceTick_symbol_status_receivedAt_idx" ON "PriceTick"("symbol", "status", "receivedAt");
-- CreateIndex
CREATE UNIQUE INDEX "PriceTick_symbol_source_quoteTs_bid_ask_key" ON "PriceTick"("symbol", "source", "quoteTs", "bid", "ask");
-- CreateIndex
CREATE INDEX "TradePosition_accountId_status_idx" ON "TradePosition"("accountId", "status");
-- CreateIndex
CREATE INDEX "TradePosition_status_idx" ON "TradePosition"("status");
-- AddForeignKey
ALTER TABLE "TradePosition" ADD CONSTRAINT "TradePosition_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TradePosition" ADD CONSTRAINT "TradePosition_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Instrument"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PriceTick is the evidence behind every fill, so it is append-only: a stored price
-- can never be edited or removed after the fact, by application code, by a bug, or by
-- a superuser role. (Same approach as the audit log.) If storage ever needs trimming,
-- that is a deliberate, separate decision, not something code can do by accident.
CREATE OR REPLACE FUNCTION price_tick_reject_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'PriceTick is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER price_tick_no_update
BEFORE UPDATE ON "PriceTick"
FOR EACH ROW EXECUTE FUNCTION price_tick_reject_mutation();

CREATE TRIGGER price_tick_no_delete
BEFORE DELETE ON "PriceTick"
FOR EACH ROW EXECUTE FUNCTION price_tick_reject_mutation();
