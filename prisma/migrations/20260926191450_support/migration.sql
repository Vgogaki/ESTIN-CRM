-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('account', 'payout', 'kyc', 'technical', 'other');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('open', 'awaiting_trader', 'resolved');

-- CreateEnum
CREATE TYPE "SupportAuthor" AS ENUM ('trader', 'admin');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'support_reply';

-- CreateTable
CREATE TABLE "SupportThread" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" "SupportCategory" NOT NULL DEFAULT 'other',
    "status" "SupportStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SupportThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorType" "SupportAuthor" NOT NULL,
    "authorAdminId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,

    CONSTRAINT "SupportAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportThread_personId_idx" ON "SupportThread"("personId");

-- CreateIndex
CREATE INDEX "SupportThread_status_lastMessageAt_idx" ON "SupportThread"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SupportMessage_threadId_createdAt_idx" ON "SupportMessage"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportAttachment_storageKey_key" ON "SupportAttachment"("storageKey");

-- AddForeignKey
ALTER TABLE "SupportThread" ADD CONSTRAINT "SupportThread_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "SupportThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorAdminId_fkey" FOREIGN KEY ("authorAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

