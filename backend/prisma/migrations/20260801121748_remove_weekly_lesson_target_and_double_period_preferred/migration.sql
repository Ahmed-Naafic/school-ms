-- AlterTable
-- (ACR-006 superseded) Weekly Subject Allocation is now the sole,
-- authoritative source for a Teacher Subject Assignment's own required
-- weekly period count — see docs/03-business/Weekly-Subject-Allocation.md's
-- own Business Review, which explicitly resolved this as a formal removal
-- via migration, with no automatic value migration into an initial
-- allocation (a per-Assignment target and a per-Grade/Form-per-Subject
-- allocation are not guaranteed to reconcile to the same total). Existing
-- non-null values (132 rows at the time of this migration) are dropped, not
-- carried forward.
ALTER TABLE "teacher_subject_assignments" DROP COLUMN "weeklyLessonTarget";

-- AlterTable
-- Double Period preference now lives entirely in Weekly Subject Allocation
-- (WeeklySubjectAllocationSubject.doublePeriodRequired) — same resolution
-- as above, same "formal removal, no value migration" reasoning. Existing
-- non-null values (33 rows at the time of this migration) are dropped, not
-- carried forward.
ALTER TABLE "subject_schedule_preferences" DROP COLUMN "doublePeriodPreferred";
