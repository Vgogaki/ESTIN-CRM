-- Staff tasks: a status (pending / in review / completed) for each piece of work
-- waiting on the team. The work itself is still derived from account, KYC and
-- payout state; this table records who has picked it up and when it was resolved.

-- CreateEnum
CREATE TYPE "StaffTaskStatus" AS ENUM ('pending', 'in_review', 'completed');

-- CreateTable
CREATE TABLE "StaffTask" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'accent',
    "status" "StaffTaskStatus" NOT NULL DEFAULT 'pending',
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffTask_status_createdAt_idx" ON "StaffTask"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StaffTask_kind_subjectId_idx" ON "StaffTask"("kind", "subjectId");

-- At most one OPEN (pending or in review) task per subject, enforced by the
-- database so two requests at the same moment can't create duplicates. A
-- completed task doesn't count, so the same situation can raise a fresh task
-- later. Prisma's schema file cannot express a partial index; it lives only here.
CREATE UNIQUE INDEX "StaffTask_one_open_per_subject"
  ON "StaffTask" ("kind", "subjectId")
  WHERE "status" <> 'completed';

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
