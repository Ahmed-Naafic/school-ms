-- Rename Student's guardian fields to parent fields (terminology change only,
-- no shape change). Uses RENAME COLUMN rather than drop/add to preserve
-- existing data.
ALTER TABLE "students" RENAME COLUMN "guardianName" TO "parentName";
ALTER TABLE "students" RENAME COLUMN "guardianContact" TO "parentContact";
