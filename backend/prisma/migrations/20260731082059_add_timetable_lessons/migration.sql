-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GapPreference" AS ENUM ('MINIMIZE', 'ALLOW', 'NO_PREFERENCE');

-- AlterTable
ALTER TABLE "teacher_subject_assignments" ADD COLUMN     "weeklyLessonTarget" INTEGER;

-- CreateTable
CREATE TABLE "lessons" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "teacherSubjectAssignmentId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "periodId" TEXT NOT NULL,
    "status" "LessonStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_schedule_preferences" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "preferredPeriods" JSONB,
    "avoidPeriods" JSONB,
    "preferBeforeBreak" BOOLEAN,
    "preferAfterBreak" BOOLEAN,
    "preferredWorkingDays" "DayOfWeek"[],
    "preferredShiftId" TEXT,
    "maxLessonsPerDay" INTEGER,
    "maxConsecutiveLessons" INTEGER,
    "gapPreference" "GapPreference",
    "spreadFreePeriods" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_schedule_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_schedule_preferences" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherSubjectAssignmentId" TEXT NOT NULL,
    "preferredPeriods" JSONB,
    "avoidPeriods" JSONB,
    "preferredDays" "DayOfWeek"[],
    "avoidDays" "DayOfWeek"[],
    "consecutivePeriodsRequired" BOOLEAN,
    "doublePeriodPreferred" BOOLEAN,
    "spreadAcrossWeek" BOOLEAN,
    "maxLessonsPerDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subject_schedule_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_optimization_settings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "balanceTeacherWorkloads" BOOLEAN NOT NULL DEFAULT false,
    "balanceFirstLastPeriods" BOOLEAN NOT NULL DEFAULT false,
    "minimizeTeacherGaps" BOOLEAN NOT NULL DEFAULT false,
    "distributeSubjectsFairly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_optimization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lessons_schoolId_idx" ON "lessons"("schoolId");

-- CreateIndex
CREATE INDEX "lessons_schoolId_teacherId_idx" ON "lessons"("schoolId", "teacherId");

-- CreateIndex
CREATE INDEX "lessons_schoolId_classId_idx" ON "lessons"("schoolId", "classId");

-- Hand-written: two partial unique indexes backing Business Rules #6/#7
-- (Teacher conflict, Class conflict), scoped to Active Lessons only — the
-- same justified exception to "only Prisma accesses the database" every
-- other partial-unique-index addition in this project already establishes,
-- since Prisma's schema DSL cannot express a partial unique constraint.
CREATE UNIQUE INDEX "lessons_teacher_slot_unique" ON "lessons"("teacherId", "academicYearId", "dayOfWeek", "periodId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "lessons_class_slot_unique" ON "lessons"("classId", "academicYearId", "dayOfWeek", "periodId") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "teacher_schedule_preferences_teacherId_key" ON "teacher_schedule_preferences"("teacherId");

-- CreateIndex
CREATE INDEX "teacher_schedule_preferences_schoolId_idx" ON "teacher_schedule_preferences"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "subject_schedule_preferences_teacherSubjectAssignmentId_key" ON "subject_schedule_preferences"("teacherSubjectAssignmentId");

-- CreateIndex
CREATE INDEX "subject_schedule_preferences_schoolId_idx" ON "subject_schedule_preferences"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "school_optimization_settings_schoolId_key" ON "school_optimization_settings"("schoolId");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_teacherSubjectAssignmentId_fkey" FOREIGN KEY ("teacherSubjectAssignmentId") REFERENCES "teacher_subject_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_schedule_preferences" ADD CONSTRAINT "teacher_schedule_preferences_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_schedule_preferences" ADD CONSTRAINT "teacher_schedule_preferences_preferredShiftId_fkey" FOREIGN KEY ("preferredShiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_schedule_preferences" ADD CONSTRAINT "subject_schedule_preferences_teacherSubjectAssignmentId_fkey" FOREIGN KEY ("teacherSubjectAssignmentId") REFERENCES "teacher_subject_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_optimization_settings" ADD CONSTRAINT "school_optimization_settings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
