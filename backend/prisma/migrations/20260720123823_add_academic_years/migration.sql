-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "AcademicYearStatus" NOT NULL DEFAULT 'ACTIVE',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_years_schoolId_idx" ON "academic_years"("schoolId");

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
-- Partial unique index: exactly one Academic Year per school may have
-- isCurrent = true (Business Rule #9). Prisma's schema DSL cannot express a
-- partial unique constraint, so this one index is hand-written raw SQL
-- within an otherwise generated migration — the same justified exception
-- Class Management's own isFinal migration already established, a narrow
-- exception to "only Prisma accesses the database" (Database-Standards.md).
CREATE UNIQUE INDEX "academic_years_school_current_unique" ON "academic_years"("schoolId") WHERE "isCurrent" = true;
