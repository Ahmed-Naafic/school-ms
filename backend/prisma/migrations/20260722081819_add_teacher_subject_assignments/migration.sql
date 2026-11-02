-- CreateTable
CREATE TABLE "teacher_subject_assignments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sectionId" TEXT,
    "effectiveStartDate" TIMESTAMP(3) NOT NULL,
    "effectiveEndDate" TIMESTAMP(3),
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_subject_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_subject_assignments_schoolId_idx" ON "teacher_subject_assignments"("schoolId");

-- CreateIndex
CREATE INDEX "teacher_subject_assignments_schoolId_academicYearId_idx" ON "teacher_subject_assignments"("schoolId", "academicYearId");

-- CreateIndex
CREATE INDEX "teacher_subject_assignments_teacherId_idx" ON "teacher_subject_assignments"("teacherId");

-- AddForeignKey
ALTER TABLE "teacher_subject_assignments" ADD CONSTRAINT "teacher_subject_assignments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_assignments" ADD CONSTRAINT "teacher_subject_assignments_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_assignments" ADD CONSTRAINT "teacher_subject_assignments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_assignments" ADD CONSTRAINT "teacher_subject_assignments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_assignments" ADD CONSTRAINT "teacher_subject_assignments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subject_assignments" ADD CONSTRAINT "teacher_subject_assignments_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
-- Partial, NULLS NOT DISTINCT unique index: the database-level backstop for
-- Business Rule #4 ("exactly one Active assignment per School + Academic
-- Year + Class + Section (or its absence) + Subject combination"). Prisma's
-- schema DSL cannot express a partial unique index, nor NULLS NOT DISTINCT,
-- so this one index is hand-written raw SQL within an otherwise generated
-- migration — the same justified exception Class.isFinal's and
-- AcademicYear.isCurrent's own migrations already established, a narrow
-- exception to "only Prisma accesses the database" (Database-Standards.md).
-- Requires Postgres 15+ (this project's Postgres 16, confirmed running).
-- NULLS NOT DISTINCT treats sectionId = NULL as equal to itself for
-- uniqueness purposes — otherwise two whole-Class assignments (both with
-- sectionId = NULL) for the same Subject/Academic Year would never collide,
-- silently defeating the invariant for the Class-with-no-Sections case
-- Business Rule #23 relies on. The application-level advisory-lock-guarded
-- check inside each write transaction (assertNoActiveDuplicate) is the
-- primary mechanism; this index is the backstop.
CREATE UNIQUE INDEX "teacher_subject_assignments_active_scope_unique"
  ON "teacher_subject_assignments" ("schoolId", "academicYearId", "classId", "subjectId", "sectionId")
  NULLS NOT DISTINCT
  WHERE "effectiveEndDate" IS NULL;
