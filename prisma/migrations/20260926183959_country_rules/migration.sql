-- CreateEnum
CREATE TYPE "CountryAction" AS ENUM ('allowed', 'review', 'blocked');

-- CreateEnum
CREATE TYPE "CountryStage" AS ENUM ('registration', 'purchase', 'trading', 'payout');

-- CreateEnum
CREATE TYPE "CountryReviewStatus" AS ENUM ('open', 'cleared');

-- CreateTable
CREATE TABLE "CountryRule" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "registration" "CountryAction" NOT NULL DEFAULT 'allowed',
    "purchase" "CountryAction" NOT NULL DEFAULT 'allowed',
    "trading" "CountryAction" NOT NULL DEFAULT 'allowed',
    "payout" "CountryAction" NOT NULL DEFAULT 'allowed',
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "CountryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryReview" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "stage" "CountryStage" NOT NULL,
    "countryCode" TEXT NOT NULL,
    "status" "CountryReviewStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "CountryReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CountryRule_countryCode_key" ON "CountryRule"("countryCode");

-- CreateIndex
CREATE INDEX "CountryReview_personId_idx" ON "CountryReview"("personId");

-- CreateIndex
CREATE INDEX "CountryReview_status_idx" ON "CountryReview"("status");

-- AddForeignKey
ALTER TABLE "CountryReview" ADD CONSTRAINT "CountryReview_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

