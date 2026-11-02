/*
  Warnings:

  - You are about to drop the column `staffAttendanceOpeningOffsetMinutes` on the `attendance_settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "attendance_settings" DROP COLUMN "staffAttendanceOpeningOffsetMinutes",
ADD COLUMN     "staffAttendanceAbsenceCutoff" TIME,
ADD COLUMN     "staffAttendanceLateThreshold" TIME,
ADD COLUMN     "staffAttendanceStartTime" TIME;
