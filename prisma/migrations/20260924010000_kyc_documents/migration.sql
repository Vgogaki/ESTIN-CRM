-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('identity_front', 'identity_back', 'proof_of_address', 'selfie');

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "kycRejectionReason" TEXT;

-- CreateTable
CREATE TABLE "KycDocument" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "KycDocumentType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KycDocument_storageKey_key" ON "KycDocument"("storageKey");

-- CreateIndex
CREATE INDEX "KycDocument_personId_idx" ON "KycDocument"("personId");

-- AddForeignKey
ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

