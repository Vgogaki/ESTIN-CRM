-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('draft', 'active', 'closed');

-- CreateEnum
CREATE TYPE "RankingMetric" AS ENUM ('return_pct', 'absolute_pnl');

-- CreateEnum
CREATE TYPE "CompetitionEntryStatus" AS ENUM ('active', 'disqualified');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'competition_results';

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "entryFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "entrantCap" INTEGER,
    "demoAccountSize" DECIMAL(14,2) NOT NULL,
    "minTradesToQualify" INTEGER NOT NULL DEFAULT 0,
    "rankingMetric" "RankingMetric" NOT NULL DEFAULT 'return_pct',
    "tieBreakerRule" TEXT NOT NULL,
    "prizeLadder" JSONB NOT NULL,
    "status" "CompetitionStatus" NOT NULL DEFAULT 'draft',
    "legalSignOffConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "legalSignOffNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionEntry" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "entryPaidAmount" DECIMAL(14,2) NOT NULL,
    "equity" DECIMAL(14,2) NOT NULL,
    "tradesCount" INTEGER NOT NULL DEFAULT 0,
    "status" "CompetitionEntryStatus" NOT NULL DEFAULT 'active',
    "disqualifiedReason" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionEntry_competitionId_idx" ON "CompetitionEntry"("competitionId");

-- CreateIndex
CREATE INDEX "CompetitionEntry_personId_idx" ON "CompetitionEntry"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionEntry_competitionId_personId_key" ON "CompetitionEntry"("competitionId", "personId");

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

