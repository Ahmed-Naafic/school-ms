const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.

function findById(id, tx = prisma) {
  return tx.weeklySubjectAllocation.findUnique({ where: { id }, include: { subjects: true } });
}

function findByNaturalKey(schoolId, academicYearId, gradeLevelId, tx = prisma) {
  return tx.weeklySubjectAllocation.findUnique({
    where: { schoolId_academicYearId_gradeLevelId: { schoolId, academicYearId, gradeLevelId } },
    include: { subjects: true },
  });
}

function listBySchool(schoolId, { academicYearId, gradeLevelId } = {}, tx = prisma) {
  return tx.weeklySubjectAllocation.findMany({
    where: {
      schoolId,
      ...(academicYearId ? { academicYearId } : {}),
      ...(gradeLevelId ? { gradeLevelId } : {}),
    },
    include: { subjects: true },
  });
}

// Backs isSchoolNeedsReview — every allocation for one school + Academic
// Year, so the caller can recompute isAllocationCurrent for each in turn.
function listBySchoolAndYear(schoolId, academicYearId, tx = prisma) {
  return tx.weeklySubjectAllocation.findMany({
    where: { schoolId, academicYearId },
    include: { subjects: true },
  });
}

// Header + line items created together, inside the caller's own
// transaction — a single Prisma nested write, per Database-Standards.md's
// Transactions section.
function createWithSubjects({ schoolId, academicYearId, gradeLevelId, availablePeriodsAtSave, subjects }, tx = prisma) {
  return tx.weeklySubjectAllocation.create({
    data: {
      schoolId,
      academicYearId,
      gradeLevelId,
      availablePeriodsAtSave,
      subjects: {
        create: subjects.map(({ subjectId, weeklyPeriods, doublePeriodRequired }) => ({
          subjectId,
          weeklyPeriods,
          doublePeriodRequired: Boolean(doublePeriodRequired),
        })),
      },
    },
    include: { subjects: true },
  });
}

// Replaces the entire line-item set (delete-then-recreate, per the
// Technical Design's own "simplest correct way to enforce the exact-total
// and no-duplicate-Subject rules without a diffing algorithm" reasoning)
// and updates the header's own availablePeriodsAtSave snapshot — all three
// statements inside one transaction, per Database-Standards.md's
// Transactions section, so a mid-sequence crash can never leave an
// allocation with zero line items.
function replaceSubjects(allocationId, subjects, availablePeriodsAtSave, tx = prisma) {
  return tx.$transaction(async (innerTx) => {
    await innerTx.weeklySubjectAllocationSubject.deleteMany({ where: { weeklySubjectAllocationId: allocationId } });
    await innerTx.weeklySubjectAllocationSubject.createMany({
      data: subjects.map(({ subjectId, weeklyPeriods, doublePeriodRequired }) => ({
        weeklySubjectAllocationId: allocationId,
        subjectId,
        weeklyPeriods,
        doublePeriodRequired: Boolean(doublePeriodRequired),
      })),
    });
    return innerTx.weeklySubjectAllocation.update({
      where: { id: allocationId },
      data: { availablePeriodsAtSave },
      include: { subjects: true },
    });
  });
}

// Backs getWeeklyPeriodsForAssignment — the one line item matching a
// Grade/Form + Academic Year + Subject, or null if no current allocation/
// line exists for that combination.
function findLineByGradeLevelYearSubject(schoolId, gradeLevelId, academicYearId, subjectId, tx = prisma) {
  return tx.weeklySubjectAllocationSubject.findFirst({
    where: {
      subjectId,
      weeklySubjectAllocation: { schoolId, gradeLevelId, academicYearId },
    },
  });
}

// Backs WP3's registered removal-dependency check — any current line
// referencing this Subject, scoped to the school via the owning header.
function findLineReferencingSubject(schoolId, subjectId, tx = prisma) {
  return tx.weeklySubjectAllocationSubject.findFirst({
    where: { subjectId, weeklySubjectAllocation: { schoolId } },
  });
}

module.exports = {
  findById,
  findByNaturalKey,
  listBySchool,
  listBySchoolAndYear,
  createWithSubjects,
  replaceSubjects,
  findLineByGradeLevelYearSubject,
  findLineReferencingSubject,
};
