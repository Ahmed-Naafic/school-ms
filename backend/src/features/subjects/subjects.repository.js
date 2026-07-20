const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.

function findById(id) {
  return prisma.subject.findUnique({ where: { id } });
}

function findByNameAndEducationLevel(name, educationLevel) {
  return prisma.subject.findUnique({ where: { name_educationLevel: { name, educationLevel } } });
}

// Includes each Subject's currently-assigned School count (a filtered
// relation count, not a raw list of assignments) so the Web catalog can
// disable the Education Level field client-side once it's non-zero — a UX
// convenience reflecting, not re-implementing, the service layer's own
// Business Rule #2 guard.
function list({ educationLevel, status } = {}) {
  const where = {};
  if (educationLevel) where.educationLevel = educationLevel;
  if (status) where.status = status;
  return prisma.subject.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { _count: { select: { schoolAssignments: { where: { removedAt: null } } } } },
  });
}

function create(data) {
  return prisma.subject.create({ data });
}

function update(id, data) {
  return prisma.subject.update({ where: { id }, data });
}

function archive(id) {
  return prisma.subject.update({ where: { id }, data: { status: 'ARCHIVED' } });
}

function reactivate(id) {
  return prisma.subject.update({ where: { id }, data: { status: 'ACTIVE' } });
}

// Counts only currently-assigned (non-removed) rows — backs Business Rule
// #2's "Education Level editable only while the Subject has zero School
// assignments" check.
function countActiveAssignments(subjectId) {
  return prisma.schoolSubject.count({ where: { subjectId, removedAt: null } });
}

function findAssignment(schoolId, subjectId) {
  return prisma.schoolSubject.findUnique({ where: { schoolId_subjectId: { schoolId, subjectId } } });
}

function createAssignment(data) {
  return prisma.schoolSubject.create({ data });
}

// Reactivates a previously soft-removed row for this (schoolId, subjectId)
// pair rather than inserting a second one, per the Technical Design's
// Database Impact reasoning — the unique constraint covers the row's entire
// lifetime, not just its currently-active state.
function reactivateAssignment(id, assignedById) {
  return prisma.schoolSubject.update({
    where: { id },
    data: { removedAt: null, removedById: null, assignedAt: new Date(), assignedById },
  });
}

function removeAssignment(id, removedById) {
  return prisma.schoolSubject.update({
    where: { id },
    data: { removedAt: new Date(), removedById },
  });
}

// "Currently assigned" == removedAt IS NULL, per the Technical Design —
// every read path for a school's assignments filters on this.
function listSchoolAssignments(schoolId) {
  return prisma.schoolSubject.findMany({
    where: { schoolId, removedAt: null },
    include: { subject: true },
    orderBy: { assignedAt: 'asc' },
  });
}

module.exports = {
  findById,
  findByNameAndEducationLevel,
  list,
  create,
  update,
  archive,
  reactivate,
  countActiveAssignments,
  findAssignment,
  createAssignment,
  reactivateAssignment,
  removeAssignment,
  listSchoolAssignments,
};
