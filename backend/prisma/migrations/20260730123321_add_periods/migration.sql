-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('TEACHING', 'BREAK');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "periods" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PeriodType" NOT NULL,
    "startTime" TIME,
    "endTime" TIME,
    "displayOrder" INTEGER,
    "status" "PeriodStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "periods_shiftId_idx" ON "periods"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "periods_shiftId_displayOrder_key" ON "periods"("shiftId", "displayOrder");

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
