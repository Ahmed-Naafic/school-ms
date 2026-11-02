-- CreateEnum
CREATE TYPE "GradeLevelStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "grade_levels" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "status" "GradeLevelStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_levels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grade_levels_schoolId_idx" ON "grade_levels"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "grade_levels_schoolId_name_key" ON "grade_levels"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "grade_levels_schoolId_sequenceOrder_key" ON "grade_levels"("schoolId", "sequenceOrder");

-- AddForeignKey
ALTER TABLE "grade_levels" ADD CONSTRAINT "grade_levels_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data backfill (ACR-009): one placeholder "Ungrouped" GradeLevel per
-- existing school. This is an honestly-imperfect backfill, not a real
-- Grade/Form mapping — no reliable automatic mapping from an existing Class
-- to a real Grade/Form exists (unlike Class.shiftId's own backfill, where
-- every school already had exactly one well-defined Default Shift). A
-- School Admin is expected to do the real, one-time manual work of
-- reassigning existing Classes to genuine Grade/Form groups afterward — see
-- the Web UI's own distinct "Ungrouped" badge, added alongside this.
INSERT INTO "grade_levels" ("id", "schoolId", "name", "sequenceOrder", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", 'Ungrouped', 1, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "schools";

-- AlterTable
-- Added nullable first, backfilled below, then made required — the same
-- "generated migration, hand-edited with one additional raw-SQL step"
-- pattern already established for Class.shiftId (add_class_shift_reference),
-- here fully self-contained within this same migration (no cross-feature
-- migration-ordering constraint, since the placeholder GradeLevel rows
-- above are created by, and within, this same migration).
ALTER TABLE "classes" ADD COLUMN     "gradeLevelId" TEXT;

-- Data backfill: every existing Class is assigned to its own school's new
-- placeholder "Ungrouped" GradeLevel.
UPDATE "classes"
SET "gradeLevelId" = (
  SELECT "id" FROM "grade_levels"
  WHERE "grade_levels"."schoolId" = "classes"."schoolId" AND "grade_levels"."name" = 'Ungrouped'
)
WHERE "gradeLevelId" IS NULL;

-- If any Class was somehow left without a placeholder GradeLevel to backfill
-- from (should never happen — every school gets exactly one from the insert
-- above), this NOT NULL constraint fails the migration loudly here rather
-- than silently allowing bad data through, per Decision-Making-Principles'
-- Fail Safely.
ALTER TABLE "classes" ALTER COLUMN "gradeLevelId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "classes_gradeLevelId_idx" ON "classes"("gradeLevelId");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "weekly_subject_allocations" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    "availablePeriodsAtSave" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_subject_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_subject_allocation_subjects" (
    "id" TEXT NOT NULL,
    "weeklySubjectAllocationId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "weeklyPeriods" INTEGER NOT NULL,
    "doublePeriodRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_subject_allocation_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weekly_subject_allocations_schoolId_academicYearId_idx" ON "weekly_subject_allocations"("schoolId", "academicYearId");

-- CreateIndex
CREATE INDEX "weekly_subject_allocations_gradeLevelId_idx" ON "weekly_subject_allocations"("gradeLevelId");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_subject_allocations_schoolId_academicYearId_gradeLev_key" ON "weekly_subject_allocations"("schoolId", "academicYearId", "gradeLevelId");

-- CreateIndex
CREATE INDEX "weekly_subject_allocation_subjects_weeklySubjectAllocationI_idx" ON "weekly_subject_allocation_subjects"("weeklySubjectAllocationId");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_subject_allocation_subjects_weeklySubjectAllocationI_key" ON "weekly_subject_allocation_subjects"("weeklySubjectAllocationId", "subjectId");

-- AddForeignKey
ALTER TABLE "weekly_subject_allocations" ADD CONSTRAINT "weekly_subject_allocations_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_subject_allocations" ADD CONSTRAINT "weekly_subject_allocations_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_subject_allocations" ADD CONSTRAINT "weekly_subject_allocations_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_subject_allocation_subjects" ADD CONSTRAINT "weekly_subject_allocation_subjects_weeklySubjectAllocation_fkey" FOREIGN KEY ("weeklySubjectAllocationId") REFERENCES "weekly_subject_allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_subject_allocation_subjects" ADD CONSTRAINT "weekly_subject_allocation_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
