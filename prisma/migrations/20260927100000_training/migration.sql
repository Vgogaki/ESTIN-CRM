-- CreateEnum
CREATE TYPE "TrainingSection" AS ENUM ('platform_how_to', 'challenge_rules', 'risk_management', 'trading_education');

-- CreateTable
CREATE TABLE "TrainingArticle" (
    "id" TEXT NOT NULL,
    "section" "TrainingSection" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "videoUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archiveReason" TEXT,

    CONSTRAINT "TrainingArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingArticle_slug_key" ON "TrainingArticle"("slug");

-- CreateIndex
CREATE INDEX "TrainingArticle_section_published_idx" ON "TrainingArticle"("section", "published");

