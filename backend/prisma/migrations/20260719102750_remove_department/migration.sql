-- DropForeignKey
ALTER TABLE "departments" DROP CONSTRAINT "departments_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "teachers" DROP CONSTRAINT "teachers_departmentId_fkey";

-- AlterTable
ALTER TABLE "teachers" DROP COLUMN "departmentId";

-- DropTable
DROP TABLE "departments";

-- DropEnum
DROP TYPE "DepartmentStatus";

