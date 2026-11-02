-- DropForeignKey
ALTER TABLE "periods" DROP CONSTRAINT "periods_shiftId_fkey";

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
