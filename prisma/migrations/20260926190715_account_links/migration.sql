-- CreateEnum
CREATE TYPE "AccountLinkStatus" AS ENUM ('open', 'dismissed', 'confirmed');

-- CreateEnum
CREATE TYPE "AccountLinkStrength" AS ENUM ('weak', 'strong');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "paymentFingerprint" TEXT;

-- CreateTable
CREATE TABLE "AccountLink" (
    "id" TEXT NOT NULL,
    "personAId" TEXT NOT NULL,
    "personBId" TEXT NOT NULL,
    "signals" JSONB NOT NULL,
    "strength" "AccountLinkStrength" NOT NULL,
    "status" "AccountLinkStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "AccountLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountLink_status_idx" ON "AccountLink"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountLink_personAId_personBId_key" ON "AccountLink"("personAId", "personBId");

-- CreateIndex
CREATE INDEX "Payment_paymentFingerprint_idx" ON "Payment"("paymentFingerprint");

-- AddForeignKey
ALTER TABLE "AccountLink" ADD CONSTRAINT "AccountLink_personAId_fkey" FOREIGN KEY ("personAId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountLink" ADD CONSTRAINT "AccountLink_personBId_fkey" FOREIGN KEY ("personBId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

