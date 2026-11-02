-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "academicYearId" TEXT,
ALTER COLUMN "academicYear" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;
