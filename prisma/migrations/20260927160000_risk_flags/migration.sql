-- CreateEnum
CREATE TYPE "RiskFlagSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "RiskFlagStatus" AS ENUM ('open', 'reviewed', 'dismissed');

-- CreateEnum
CREATE TYPE "RiskFlagSource" AS ENUM ('system', 'admin');

-- CreateTable
CREATE TABLE "RiskFlag" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" "RiskFlagSource" NOT NULL,
    "severity" "RiskFlagSeverity" NOT NULL,
    "status" "RiskFlagStatus" NOT NULL DEFAULT 'open',
    "summary" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,

    CONSTRAINT "RiskFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskFlag_status_severity_idx" ON "RiskFlag"("status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "RiskFlag_personId_dedupeKey_key" ON "RiskFlag"("personId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "RiskFlag" ADD CONSTRAINT "RiskFlag_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

