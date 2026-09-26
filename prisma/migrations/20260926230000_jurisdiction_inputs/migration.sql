-- CreateEnum
CREATE TYPE "JurisdictionInputKey" AS ENUM ('sanctions', 'payment_provider', 'data_vendor', 'marketing_legal');

-- CreateEnum
CREATE TYPE "JurisdictionInputStatus" AS ENUM ('pending', 'in_progress', 'done');

-- CreateTable
CREATE TABLE "JurisdictionInput" (
    "key" "JurisdictionInputKey" NOT NULL,
    "status" "JurisdictionInputStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JurisdictionInput_pkey" PRIMARY KEY ("key")
);

