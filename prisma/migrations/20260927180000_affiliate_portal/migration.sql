-- AlterEnum
ALTER TYPE "ActorType" ADD VALUE 'affiliate';

-- AlterTable
ALTER TABLE "Affiliate" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "AffiliateSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateSession_tokenHash_key" ON "AffiliateSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AffiliateSession_affiliateId_idx" ON "AffiliateSession"("affiliateId");

-- AddForeignKey
ALTER TABLE "AffiliateSession" ADD CONSTRAINT "AffiliateSession_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

