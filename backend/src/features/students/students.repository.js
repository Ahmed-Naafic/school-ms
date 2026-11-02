const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.

function findById(id) {
  return prisma.student.findUnique({ where: { id } });
}

function findByAccountId(accountId) {
  return prisma.student.findUnique({ where: { accountId } });
}

// Paginated roster, per the Technical Design's Performance Considerations —
// a school-wide unfiltered Student list is not an acceptable query shape at
// scale, unlike Class Management's small, bounded Class list.
async function listBySchool({ schoolId, status, page, pageSize }) {
  const where = { schoolId, ...(status ? { status } : {}) };

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.student.count({ where }),
  ]);

  return { students, total };
}

// Unpaginated variant used only when filtering by current Class (see
// students.service.js's listStudents) — that filter must check each
// Student's most recent Enrollment specifically, which Prisma cannot express
// as a plain `where` on the Student model without matching "any Enrollment
// ever," including long-past ones. Correctness here takes priority over
// doing this filter as a single paginated DB query, per Decision-Making-
// Principles' "Protect Data" — a wrong result is worse than an extra query.
async function listAllBySchool({ schoolId, status }) {
  const where = { schoolId, ...(status ? { status } : {}) };
  return prisma.student.findMany({ where, orderBy: { createdAt: 'desc' } });
}

function create(data) {
  return prisma.student.create({ data });
}

function update(id, data) {
  return prisma.student.update({ where: { id }, data });
}

function updateStatus(id, status) {
  return prisma.student.update({ where: { id }, data: { status } });
}

// The Student's current Class is derived from the most recent Enrollment,
// never duplicated onto the Student record itself, per the Technical
// Design's Database Impact section.
function findLatestEnrollment(studentId) {
  return prisma.enrollment.findFirst({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  });
}

function listEnrollments(studentId) {
  return prisma.enrollment.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  });
}

function createEnrollment(data) {
  return prisma.enrollment.create({ data });
}

// Only ever used to write the transfer-summary fields onto the outgoing
// Enrollment record at the point of Transfer (Business Rule #9) — Enrollment
// records are otherwise immutable history.
function setTransferSummary(enrollmentId, transferSummary) {
  return prisma.enrollment.update({ where: { id: enrollmentId }, data: { transferSummary } });
}

// The one other exception to Enrollment's otherwise-immutable history:
// Class Correction mutates the current Enrollment's classId (and, per
// ACR-002, sectionId) in place, per Business Rule #16 — a data-entry fix,
// never a new Enrollment record. sectionId is always written explicitly
// (never omitted from the update), so correcting only the Class properly
// clears a stale Section that belonged to the old Class.
function correctEnrollmentClass(enrollmentId, classId, sectionId) {
  return prisma.enrollment.update({ where: { id: enrollmentId }, data: { classId, sectionId: sectionId || null } });
}

module.exports = {
  findById,
  findByAccountId,
  listBySchool,
  listAllBySchool,
  create,
  update,
  updateStatus,
  findLatestEnrollment,
  listEnrollments,
  createEnrollment,
  setTransferSummary,
  correctEnrollmentClass,
};
