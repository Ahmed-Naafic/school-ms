-- CreateEnum
CREATE TYPE "TimetableVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TimetableGenerationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
-- timetableVersionId is added nullable here, backfilled below, then set
-- NOT NULL once every pre-existing Lesson has a version to point at (the
-- same "generated migration, hand-edited with one additional raw-SQL step"
-- pattern already established for Class.shiftId's own backfill).
ALTER TABLE "lessons" ADD COLUMN     "lessonGroupId" TEXT,
ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sequenceInGroup" INTEGER,
ADD COLUMN     "timetableVersionId" TEXT;

-- AlterTable
ALTER TABLE "teacher_schedule_preferences" ADD COLUMN     "unavailableSlots" JSONB;

-- CreateTable
CREATE TABLE "timetable_versions" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "status" "TimetableVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_groups" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_generation_jobs" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "timetableVersionId" TEXT,
    "status" "TimetableGenerationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "scope" JSONB NOT NULL,
    "totalUnits" INTEGER NOT NULL DEFAULT 0,
    "placedUnits" INTEGER NOT NULL DEFAULT 0,
    "currentPhase" TEXT,
    "result" JSONB,
    "errorMessage" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "timetable_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_versions_schoolId_academicYearId_idx" ON "timetable_versions"("schoolId", "academicYearId");

-- CreateIndex
CREATE INDEX "lesson_groups_schoolId_idx" ON "lesson_groups"("schoolId");

-- CreateIndex
CREATE INDEX "timetable_generation_jobs_schoolId_idx" ON "timetable_generation_jobs"("schoolId");

-- CreateIndex
CREATE INDEX "lessons_lessonGroupId_idx" ON "lessons"("lessonGroupId");

-- Data backfill: every pre-existing Lesson predates the Draft/Published
-- concept entirely — it was simply "the truth" with no versioning axis.
-- One PUBLISHED TimetableVersion is created per distinct (schoolId,
-- academicYearId) pair that currently has Lessons, and every Lesson in
-- that pair is attached to it. No DRAFT version is created here — the
-- first write against a school (a manual edit or a Generate run) is
-- responsible for creating its own Draft lazily, per Timetable.md's own
-- Architecture Update.
WITH new_versions AS (
  INSERT INTO "timetable_versions" ("id", "schoolId", "academicYearId", "status", "createdAt", "updatedAt")
  SELECT gen_random_uuid(), "schoolId", "academicYearId", 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "lessons"
  GROUP BY "schoolId", "academicYearId"
  RETURNING "id", "schoolId", "academicYearId"
)
UPDATE "lessons" l
SET "timetableVersionId" = nv."id"
FROM new_versions nv
WHERE l."schoolId" = nv."schoolId" AND l."academicYearId" = nv."academicYearId";

-- AlterTable
ALTER TABLE "lessons" ALTER COLUMN "timetableVersionId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_generation_jobs" ADD CONSTRAINT "timetable_generation_jobs_timetableVersionId_fkey" FOREIGN KEY ("timetableVersionId") REFERENCES "timetable_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_timetableVersionId_fkey" FOREIGN KEY ("timetableVersionId") REFERENCES "timetable_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_lessonGroupId_fkey" FOREIGN KEY ("lessonGroupId") REFERENCES "lesson_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Architecture Update (Generation-First): the two pre-existing Teacher/Class
-- conflict partial unique indexes (from add_timetable_lessons) were scoped
-- to academicYearId. They are now re-scoped to timetableVersionId instead —
-- the same Teacher/Class/Day/Period slot legitimately exists as independent
-- Lesson rows across a school's DRAFT and PUBLISHED versions at once (two
-- different working copies), which is not a conflict; timetableVersionId is
-- the true partition key now, and already implies a single Academic Year.
DROP INDEX IF EXISTS "lessons_teacher_slot_unique";
DROP INDEX IF EXISTS "lessons_class_slot_unique";

CREATE UNIQUE INDEX "lessons_teacher_slot_unique" ON "lessons"("timetableVersionId", "teacherId", "dayOfWeek", "periodId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "lessons_class_slot_unique" ON "lessons"("timetableVersionId", "classId", "dayOfWeek", "periodId") WHERE "status" = 'ACTIVE';

-- Exactly one DRAFT and exactly one PUBLISHED TimetableVersion per
-- (schoolId, academicYearId) at a time — the same partial-unique-index
-- pattern already established for Shift.isDefault/AcademicYear.isCurrent.
CREATE UNIQUE INDEX "timetable_versions_school_year_draft_unique" ON "timetable_versions"("schoolId", "academicYearId") WHERE "status" = 'DRAFT';
CREATE UNIQUE INDEX "timetable_versions_school_year_published_unique" ON "timetable_versions"("schoolId", "academicYearId") WHERE "status" = 'PUBLISHED';
