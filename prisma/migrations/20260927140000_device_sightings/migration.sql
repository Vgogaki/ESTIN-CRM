-- CreateTable
CREATE TABLE "DeviceSighting" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DeviceSighting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceSighting_deviceHash_idx" ON "DeviceSighting"("deviceHash");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSighting_personId_deviceHash_key" ON "DeviceSighting"("personId", "deviceHash");

-- AddForeignKey
ALTER TABLE "DeviceSighting" ADD CONSTRAINT "DeviceSighting_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

