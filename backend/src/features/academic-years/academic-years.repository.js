const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.

// Phase 9 code review finding: serializes any check-then-act state
// transition for a given school's Academic Years (first-year-becomes-
// Current, Current designation, archiving) so two concurrent requests can
// never race past each other's stale read of isCurrent/status — Postgres
// releases this lock automatically at the end of the transaction it's
// acquired within (pg_advisory_xact_lock), never held beyond that.
function acquireSchoolLock(schoolId, tx) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}))`;
}

function findById(id, tx = prisma) {
  return tx.academicYear.findUnique({ where: { id } });
}

function listBySchool(schoolId, { status } = {}) {
  const where = { schoolId };
  if (status) where.status = status;
  return prisma.academicYear.findMany({ where, orderBy: { startDate: 'asc' } });
}

// Every Academic Year in the school, Active and Archived — backs the
// overlap check (Business Rule #3) and the duplicate-derived-label check
// (Business Rule #4), both of which must consider Archived records too,
// per the Business Review's "archiving never frees a date range" decision.
function listAllBySchool(schoolId, tx = prisma) {
  return tx.academicYear.findMany({ where: { schoolId } });
}

function countBySchool(schoolId, tx = prisma) {
  return tx.academicYear.count({ where: { schoolId } });
}

function findCurrentBySchool(schoolId, tx = prisma) {
  return tx.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
}

function create(data, tx = prisma) {
  return tx.academicYear.create({ data });
}

function update(id, data) {
  return prisma.academicYear.update({ where: { id }, data });
}

function archive(id, tx = prisma) {
  return tx.academicYear.update({ where: { id }, data: { status: 'ARCHIVED' } });
}

function reactivate(id) {
  return prisma.academicYear.update({ where: { id }, data: { status: 'ACTIVE' } });
}

// The only two functions that ever write isCurrent — always called
// together by academic-years.service.js's setCurrentAcademicYear, the
// module's sole transition function (Technical Design Requirement #7).
function unsetCurrent(schoolId, tx = prisma) {
  return tx.academicYear.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
}

function setCurrent(id, tx = prisma) {
  return tx.academicYear.update({ where: { id }, data: { isCurrent: true } });
}

module.exports = {
  acquireSchoolLock,
  findById,
  listBySchool,
  listAllBySchool,
  countBySchool,
  findCurrentBySchool,
  create,
  update,
  archive,
  reactivate,
  unsetCurrent,
  setCurrent,
};
