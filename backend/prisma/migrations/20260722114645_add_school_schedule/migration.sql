-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "school_calendars" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "workingDays" "DayOfWeek"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TIME NOT NULL,
    "endTime" TIME NOT NULL,
    "displayOrder" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "ShiftStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_calendars_schoolId_key" ON "school_calendars"("schoolId");

-- CreateIndex
CREATE INDEX "shifts_schoolId_idx" ON "shifts"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_schoolId_displayOrder_key" ON "shifts"("schoolId", "displayOrder");

-- AddForeignKey
ALTER TABLE "school_calendars" ADD CONSTRAINT "school_calendars_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
-- Partial unique index: exactly one Shift per school may have isDefault =
-- true (Business Rules #8, #10). Prisma's schema DSL cannot express a
-- partial unique constraint, so this one index is hand-written raw SQL
-- within an otherwise generated migration — the same justified exception
-- Class.isFinal's and AcademicYear.isCurrent's own migrations already
-- established.
CREATE UNIQUE INDEX "shifts_school_default_shift_unique" ON "shifts"("schoolId") WHERE "isDefault" = true;

-- Data backfill: every school that already exists (created before this
-- feature existed) gets its own default Somalia Calendar and default
-- "Morning" Shift here, one time, so no pre-existing school is ever left
-- without one. Every school created from this point forward instead gets
-- both together inside schools.service.js's own createSchool (see
-- school-schedule.service.js's createDefaultScheduleForSchool). This step
-- must fully commit before the next migration (Class.shiftId's own
-- backfill) runs, since that backfill reads the Shift rows created here.
INSERT INTO "school_calendars" ("id", "schoolId", "workingDays", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", ARRAY['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY']::"DayOfWeek"[], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "schools";

INSERT INTO "shifts" ("id", "schoolId", "name", "startTime", "endTime", "displayOrder", "isDefault", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", 'Morning', '07:30:00'::time, '12:30:00'::time, 1, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "schools";
