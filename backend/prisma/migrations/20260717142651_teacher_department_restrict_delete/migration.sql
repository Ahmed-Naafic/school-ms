-- DropForeignKey
ALTER TABLE "teachers" DROP CONSTRAINT "teachers_departmentId_fkey";

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
