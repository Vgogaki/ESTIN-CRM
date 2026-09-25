-- CreateEnum
CREATE TYPE "OfferDiscountType" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "OfferAudience" AS ENUM ('all_traders', 'breached_traders', 'specific_trader');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('sent', 'redeemed', 'withdrawn');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'offer_received';

-- CreateTable
CREATE TABLE "OfferCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "OfferDiscountType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "audience" "OfferAudience" NOT NULL,
    "challengeTypeFamilyId" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "OfferCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuedOffer" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "challengeTypeId" TEXT NOT NULL,
    "normalFee" DECIMAL(14,2) NOT NULL,
    "offerFee" DECIMAL(14,2) NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'sent',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedOrderRef" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "withdrawnReason" TEXT,

    CONSTRAINT "IssuedOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfferCampaign_code_key" ON "OfferCampaign"("code");

-- CreateIndex
CREATE INDEX "OfferCampaign_code_idx" ON "OfferCampaign"("code");

-- CreateIndex
CREATE INDEX "IssuedOffer_personId_idx" ON "IssuedOffer"("personId");

-- CreateIndex
CREATE INDEX "IssuedOffer_campaignId_idx" ON "IssuedOffer"("campaignId");

-- AddForeignKey
ALTER TABLE "OfferCampaign" ADD CONSTRAINT "OfferCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedOffer" ADD CONSTRAINT "IssuedOffer_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "OfferCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedOffer" ADD CONSTRAINT "IssuedOffer_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedOffer" ADD CONSTRAINT "IssuedOffer_challengeTypeId_fkey" FOREIGN KEY ("challengeTypeId") REFERENCES "ChallengeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedOffer" ADD CONSTRAINT "IssuedOffer_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

