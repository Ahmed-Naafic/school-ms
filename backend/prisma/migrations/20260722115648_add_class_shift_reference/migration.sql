-- AlterTable
-- Added nullable first, backfilled below, then made required — Prisma
-- cannot add a required column with no default to a non-empty table in one
-- step, and the backfill value here differs per row (each Class's own
-- school's Default Shift), so no single constant default would be correct
-- even if Prisma's own interactive flow could supply one. The same
-- "generated migration, hand-edited with one additional raw-SQL step"
-- pattern already established for partial-unique-index additions, here used
-- for a data backfill instead. This migration must run after
-- add_school_schedule's own backfill has fully committed — see this
-- project's Implementation Plan for School Schedule Management.
ALTER TABLE "classes" ADD COLUMN     "shiftId" TEXT;

-- Data backfill: every existing Class is assigned to its own school's
-- Default Shift (the row add_school_schedule's own migration created for
-- every pre-existing school).
UPDATE "classes"
SET "shiftId" = (
  SELECT "id" FROM "shifts"
  WHERE "shifts"."schoolId" = "classes"."schoolId" AND "shifts"."isDefault" = true
)
WHERE "shiftId" IS NULL;

-- If any Class was somehow left without a Default Shift to backfill from
-- (should never happen if add_school_schedule's own backfill correctly
-- covered every school), this NOT NULL constraint fails the migration
-- loudly here rather than silently allowing bad data through — a safe
-- failure, per Decision-Making-Principles' Fail Safely.
ALTER TABLE "classes" ALTER COLUMN "shiftId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "classes_schoolId_shiftId_idx" ON "classes"("schoolId", "shiftId");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
