-- Checkout sessions: the pending order for a challenge bought in the trader portal.
-- The price is fixed on the server when checkout starts; a successful payment then
-- runs the same order-intake path the website uses, which creates the account.

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('pending', 'paid', 'expired');

-- CreateTable
CREATE TABLE "CheckoutSession" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "challengeTypeId" TEXT NOT NULL,
    "orderRef" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "normalFee" DECIMAL(14,2) NOT NULL,
    "amountDue" DECIMAL(14,2) NOT NULL,
    "offerCode" TEXT,
    "affiliateCode" TEXT,
    "termsVersion" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'pending',
    "paymentProvider" TEXT,
    "providerReference" TEXT,
    "accountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "CheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_orderRef_key" ON "CheckoutSession"("orderRef");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_accountId_key" ON "CheckoutSession"("accountId");

-- CreateIndex
CREATE INDEX "CheckoutSession_personId_status_idx" ON "CheckoutSession"("personId", "status");

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_challengeTypeId_fkey" FOREIGN KEY ("challengeTypeId") REFERENCES "ChallengeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
