-- Affiliate referral codes become their own register, and "who introduced whom"
-- becomes a record.
--
-- Before: a staff member typed an affiliate's code (Affiliate.code).
-- Now: the affiliate generates their own code; the system creates it, records
-- who/when, and nobody can type one. Codes are never deleted or reused.

-- CreateEnum
CREATE TYPE "AffiliateCodeOrigin" AS ENUM ('generated', 'legacy_staff');

-- CreateEnum
CREATE TYPE "ReferralSource" AS ENUM ('recorded_by_affiliate', 'registration_code', 'order_code');

-- CreateTable
CREATE TABLE "AffiliateCode" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "origin" "AffiliateCodeOrigin" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" TEXT,

    CONSTRAINT "AffiliateCode_pkey" PRIMARY KEY ("id")
);

-- Carry every existing affiliate's code across BEFORE the old column is dropped,
-- so codes already given out (and already on orders) keep working. They are
-- marked 'legacy_staff' so the back office can tell them from generated ones.
INSERT INTO "AffiliateCode" ("id", "affiliateId", "code", "origin", "createdAt")
SELECT 'legacy_' || "id", "id", "code", 'legacy_staff', "createdAt"
FROM "Affiliate"
WHERE "code" IS NOT NULL;

-- DropIndex
DROP INDEX "Affiliate_code_key";

-- AlterTable
ALTER TABLE "Affiliate" DROP COLUMN "code";

-- CreateTable
CREATE TABLE "AffiliateReferral" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nameGiven" TEXT,
    "source" "ReferralSource" NOT NULL,
    "codeId" TEXT,
    "personId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedAt" TIMESTAMP(3),

    CONSTRAINT "AffiliateReferral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCode_code_key" ON "AffiliateCode"("code");

-- CreateIndex
CREATE INDEX "AffiliateCode_affiliateId_idx" ON "AffiliateCode"("affiliateId");

-- At most ONE ACTIVE code per affiliate, enforced by the database itself (the
-- application also checks, under a lock). A deactivated code (revokedAt set)
-- does not count, so a replacement can be generated. Prisma's schema file
-- cannot express a partial index; it lives only here.
CREATE UNIQUE INDEX "AffiliateCode_one_active_per_affiliate"
  ON "AffiliateCode" ("affiliateId")
  WHERE "revokedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateReferral_personId_key" ON "AffiliateReferral"("personId");

-- CreateIndex
CREATE INDEX "AffiliateReferral_email_idx" ON "AffiliateReferral"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateReferral_affiliateId_email_key" ON "AffiliateReferral"("affiliateId", "email");

-- AddForeignKey
ALTER TABLE "AffiliateCode" ADD CONSTRAINT "AffiliateCode_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "AffiliateCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
