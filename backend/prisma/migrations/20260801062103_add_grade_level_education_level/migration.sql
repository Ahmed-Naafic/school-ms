-- AlterTable
-- Added nullable first, backfilled below, then made required — the same
-- "generated migration, hand-edited with one additional raw-SQL step"
-- pattern already established elsewhere in this project.
ALTER TABLE "grade_levels" ADD COLUMN     "educationLevel" "EducationLevel";

-- Data backfill: every existing GradeLevel is assigned its own school's
-- first configured Education Level (schools.educationLevels is a Postgres
-- array; index [1] is that array's first element, 1-indexed). This is an
-- honest, imperfect backfill — like ACR-009's own "Ungrouped" placeholder
-- backfill — not a guaranteed-correct mapping: a school offering both
-- Primary and Secondary, whose existing GradeLevel is actually a Secondary
-- one, will be backfilled to Primary here and needs a School Admin
-- correction afterward (educationLevel is correctable via updateGradeLevel,
-- unlike the Grade/Form grouping itself).
UPDATE "grade_levels"
SET "educationLevel" = (
  SELECT "educationLevels"[1] FROM "schools"
  WHERE "schools"."id" = "grade_levels"."schoolId"
)
WHERE "educationLevel" IS NULL;

-- If any GradeLevel was somehow left without a value (should never happen —
-- every school has at least one configured Education Level), this NOT NULL
-- constraint fails the migration loudly here rather than silently allowing
-- bad data through, per Decision-Making-Principles' Fail Safely.
ALTER TABLE "grade_levels" ALTER COLUMN "educationLevel" SET NOT NULL;
