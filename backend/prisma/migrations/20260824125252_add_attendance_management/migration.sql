-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('TEACHER', 'MANAGER_BEFORE_BREAK', 'MANAGER_AFTER_BREAK', 'MANAGER_STAFF_ATTENDANCE', 'ADMIN_MANAGER_ATTENDANCE');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'MANAGER';

-- CreateTable
CREATE TABLE "student_attendance" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "lessonId" TEXT,
    "date" DATE NOT NULL,
    "source" "AttendanceSource" NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "recordedByAccountId" TEXT NOT NULL,
    "recordedByRole" "UserRole" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correctedByAccountId" TEXT,
    "correctedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffAccountId" TEXT NOT NULL,
    "staffRole" "UserRole" NOT NULL,
    "date" DATE NOT NULL,
    "source" "AttendanceSource" NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "recordedByAccountId" TEXT NOT NULL,
    "recordedByRole" "UserRole" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correctedByAccountId" TEXT,
    "correctedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_non_working_days" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_non_working_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_settings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherEditWindowMinutes" INTEGER,
    "teacherGracePeriodMinutes" INTEGER,
    "managerCorrectionWindowHours" INTEGER,
    "adminCorrectionWindowHours" INTEGER,
    "staffAttendanceOpeningOffsetMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_attendance_schoolId_idx" ON "student_attendance"("schoolId");

-- CreateIndex
CREATE INDEX "student_attendance_studentId_date_idx" ON "student_attendance"("studentId", "date");

-- CreateIndex
CREATE INDEX "student_attendance_lessonId_date_idx" ON "student_attendance"("lessonId", "date");

-- CreateIndex
CREATE INDEX "student_attendance_classId_date_idx" ON "student_attendance"("classId", "date");

-- CreateIndex
CREATE INDEX "staff_attendance_schoolId_idx" ON "staff_attendance"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_staffAccountId_date_key" ON "staff_attendance"("staffAccountId", "date");

-- CreateIndex
CREATE INDEX "school_non_working_days_schoolId_idx" ON "school_non_working_days"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "school_non_working_days_schoolId_date_key" ON "school_non_working_days"("schoolId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_settings_schoolId_key" ON "attendance_settings"("schoolId");

-- CreateIndex
-- Two partial unique indexes enforce StudentAttendance's two different
-- uniqueness shapes, per Attendance-Management.md Business Lifecycle §1/§2
-- and Technical Design Section U. Prisma's schema DSL cannot express a
-- partial unique index directly, so these are hand-written raw SQL within an
-- otherwise generated migration — the same justified exception
-- Shift.isDefault's, Class.isFinal's, AcademicYear.isCurrent's, and
-- TeacherSubjectAssignment's own composite index already established.
-- Requires Postgres 15+ (this project's Postgres 16, confirmed running).
--
-- One Teacher-recorded row per Student per Lesson occurrence (a specific
-- calendar date, since Lesson.dayOfWeek is a recurring weekday, never a
-- date itself).
CREATE UNIQUE INDEX "student_attendance_teacher_unique"
  ON "student_attendance" ("studentId", "lessonId", "date")
  WHERE "source" = 'TEACHER';

-- One Manager-recorded row per Student per checkpoint per day — "source" is
-- included in the index columns because a Student legitimately has up to
-- two Manager rows per day (one per checkpoint: Before Break, After Break),
-- not one.
CREATE UNIQUE INDEX "student_attendance_manager_checkpoint_unique"
  ON "student_attendance" ("studentId", "classId", "date", "source")
  WHERE "source" IN ('MANAGER_BEFORE_BREAK', 'MANAGER_AFTER_BREAK');

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_recordedByAccountId_fkey" FOREIGN KEY ("recordedByAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_correctedByAccountId_fkey" FOREIGN KEY ("correctedByAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_staffAccountId_fkey" FOREIGN KEY ("staffAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_recordedByAccountId_fkey" FOREIGN KEY ("recordedByAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_correctedByAccountId_fkey" FOREIGN KEY ("correctedByAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_non_working_days" ADD CONSTRAINT "school_non_working_days_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_settings" ADD CONSTRAINT "attendance_settings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
