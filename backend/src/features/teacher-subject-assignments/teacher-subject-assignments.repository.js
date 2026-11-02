const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.

// Serializes any check-then-act write for a given school's Teacher Subject
// Assignments (Business Rule #4's uniqueness invariant), so two concurrent
// creates/replacements/copy-candidates for the same school can never race
// past each other's stale read — the same pg_advisory_xact_lock pattern
// Academic Year Management's own code review converged on, applied here from
// the first Implementation pass per the Technical Design's Risks section.
// Postgres releases this lock automatically at the end of the transaction
// it's acquired within, never held beyond that.
function acquireSchoolLock(schoolId, tx) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}))`;
}

function findById(id, tx = prisma) {
  return tx.teacherSubjectAssignment.findUnique({ where: { id } });
}

// The primary mechanism backing Business Rule #4 — queries for an existing
// Active row (effectiveEndDate IS NULL) matching the full uniqueness scope.
// Always called last, inside the same locked transaction as the eventual
// insert (see the service layer's assertNoActiveDuplicate).
function findActiveByScope({ schoolId, academicYearId, classId, sectionId, subjectId }, tx = prisma) {
  return tx.teacherSubjectAssignment.findFirst({
    where: {
      schoolId,
      academicYearId,
      classId,
      subjectId,
      sectionId: sectionId || null,
      effectiveEndDate: null,
    },
  });
}

async function listBySchool({ schoolId, academicYearId, teacherId, subjectId, classId, sectionId, page, pageSize }) {
  const where = {
    schoolId,
    ...(academicYearId ? { academicYearId } : {}),
    ...(teacherId ? { teacherId } : {}),
    ...(subjectId ? { subjectId } : {}),
    ...(classId ? { classId } : {}),
    ...(sectionId ? { sectionId } : {}),
  };

  const [assignments, total] = await Promise.all([
    prisma.teacherSubjectAssignment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.teacherSubjectAssignment.count({ where }),
  ]);

  return { assignments, total };
}

// Teacher self-service (GET /teacher-subject-assignments/me) — teacherId is
// always resolved server-side from the authenticated Teacher's own account,
// never a client-supplied value, per Security-Standards.md.
function listByTeacher(teacherId, { academicYearId } = {}) {
  return prisma.teacherSubjectAssignment.findMany({
    where: { teacherId, ...(academicYearId ? { academicYearId } : {}) },
    orderBy: { createdAt: 'desc' },
  });
}

function create(data, tx = prisma) {
  return tx.teacherSubjectAssignment.create({ data });
}

function update(id, data, tx = prisma) {
  return tx.teacherSubjectAssignment.update({ where: { id }, data });
}

// Business Rule #19: any Active assignment referencing this (schoolId,
// subjectId) pair blocks Subject Management's own removal of the
// Subject-to-School assignment — see this feature's own registration of
// subjectsService.registerRemovalDependencyCheck at module-load time.
function findActiveBySubject(schoolId, subjectId) {
  return prisma.teacherSubjectAssignment.findFirst({
    where: { schoolId, subjectId, effectiveEndDate: null },
  });
}

// (Weekly Subject Allocation) Every current Active assignment for one
// Subject across a given set of Classes (a Grade/Form's own member
// Classes), for one Academic Year — backs that feature's own "which
// Teachers currently teach this Subject anywhere in this Grade/Form"
// narrow-interface query.
function listActiveAssignmentsForSubjectAndClasses(schoolId, subjectId, classIds, academicYearId, tx = prisma) {
  return tx.teacherSubjectAssignment.findMany({
    where: {
      schoolId,
      subjectId,
      academicYearId,
      classId: { in: classIds },
      effectiveEndDate: null,
    },
  });
}

module.exports = {
  acquireSchoolLock,
  findById,
  findActiveByScope,
  listBySchool,
  listByTeacher,
  create,
  update,
  findActiveBySubject,
  listActiveAssignmentsForSubjectAndClasses,
};
