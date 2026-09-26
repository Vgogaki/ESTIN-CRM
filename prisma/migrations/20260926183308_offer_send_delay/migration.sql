-- AlterEnum
ALTER TYPE "OfferAudience" ADD VALUE 'competition_entrants';

-- AlterTable
ALTER TABLE "OfferCampaign" ADD COLUMN     "sendDelayDays" INTEGER NOT NULL DEFAULT 3;

