-- DropForeignKey
ALTER TABLE "grade_levels" DROP CONSTRAINT "grade_levels_schoolId_fkey";

-- AddForeignKey
ALTER TABLE "grade_levels" ADD CONSTRAINT "grade_levels_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
