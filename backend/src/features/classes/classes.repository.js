const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.

function findById(id) {
  return prisma.class.findUnique({ where: { id }, include: { sections: true } });
}

function findByName(schoolId, name) {
  return prisma.class.findUnique({ where: { schoolId_name: { schoolId, name } } });
}

function findBySequenceOrder(schoolId, sequenceOrder) {
  return prisma.class.findUnique({ where: { schoolId_sequenceOrder: { schoolId, sequenceOrder } } });
}

function listBySchool(schoolId) {
  return prisma.class.findMany({
    where: { schoolId },
    include: { sections: true },
    orderBy: { sequenceOrder: 'asc' },
  });
}

// Active-only Classes in sequence order — used both to assign a new Class's
// default position (append at the end) and to suggest "the next Class" for
// Promotion (Business Rule #6). Archived Classes are excluded from the
// sequence a suggestion is drawn from, but their own position is left
// untouched, per the Technical Design's Architecture section.
function listActiveBySchoolOrdered(schoolId) {
  return prisma.class.findMany({
    where: { schoolId, status: 'ACTIVE' },
    orderBy: { sequenceOrder: 'asc' },
  });
}

// Defense in depth: the final Class must also be ACTIVE. archiveClass already
// refuses to archive the currently-final Class (Business Rule #7), so this
// should never actually matter in practice — but Student Management's
// Graduation-eligibility check must never treat an archived Class as final,
// even against a historical or manually-edited row.
function findFinalClass(schoolId) {
  return prisma.class.findFirst({ where: { schoolId, isFinal: true, status: 'ACTIVE' } });
}

function create(data) {
  return prisma.class.create({ data });
}

function update(id, data) {
  return prisma.class.update({ where: { id }, data });
}

function archive(id) {
  return prisma.class.update({ where: { id }, data: { status: 'ARCHIVED' } });
}

// Reactivation always assigns a fresh end-of-sequence position rather than
// restoring the Class's pre-archival one, per Business Rule #11 — the caller
// computes that position from every Class in the school (not the active
// subset), for the same reason `create`'s caller does (see classes.service.js).
function reactivate(id, sequenceOrder) {
  return prisma.class.update({ where: { id }, data: { status: 'ACTIVE', sequenceOrder } });
}

// Reassigns a contiguous 1..N sequence to every provided Class, in the order
// given, inside a single transaction — per the Technical Design's Risks
// section, this is the only way sequence positions are ever written, so two
// Classes can never end up sharing a position.
//
// Two-phase: the (schoolId, sequenceOrder) unique index is checked per
// statement, not deferred to commit, so writing final positions directly can
// collide mid-transaction whenever two Classes swap positions (e.g. moving
// #3 to #1 requires #1 and #2 to shift, briefly wanting #3's old value).
// Moving every row to a distinct negative placeholder first guarantees no
// intermediate collision, since placeholders never overlap with any real
// (positive) position.
function reorder(classesInNewOrder) {
  return prisma.$transaction([
    ...classesInNewOrder.map((cls, index) =>
      prisma.class.update({ where: { id: cls.id }, data: { sequenceOrder: -(index + 1) } })
    ),
    ...classesInNewOrder.map((cls, index) =>
      prisma.class.update({ where: { id: cls.id }, data: { sequenceOrder: index + 1 } })
    ),
  ]);
}

// Unsets any current final Class and sets the new one, in a single
// transaction, so a school is never left with zero or two final Classes
// (Business Rule #7) — the partial unique index on the Class model is the
// database-level backstop for this same invariant.
function designateFinalClass(schoolId, classId) {
  return prisma.$transaction([
    prisma.class.updateMany({ where: { schoolId, isFinal: true }, data: { isFinal: false } }),
    prisma.class.update({ where: { id: classId }, data: { isFinal: true } }),
  ]);
}

function findSectionById(id) {
  return prisma.section.findUnique({ where: { id } });
}

function findSectionByName(classId, name) {
  return prisma.section.findUnique({ where: { classId_name: { classId, name } } });
}

function createSection(data) {
  return prisma.section.create({ data });
}

function updateSection(id, data) {
  return prisma.section.update({ where: { id }, data });
}

function archiveSection(id) {
  return prisma.section.update({ where: { id }, data: { status: 'ARCHIVED' } });
}

// Sections have no sequence concept, so reactivation is a plain status flip.
function reactivateSection(id) {
  return prisma.section.update({ where: { id }, data: { status: 'ACTIVE' } });
}

// (ACR-002) Backs classes.service.js's listActiveSectionsForClass — the one
// query Student Management needs, via that narrow interface function, to
// validate and suggest a Section.
function listActiveSectionsForClass(classId) {
  return prisma.section.findMany({ where: { classId, status: 'ACTIVE' } });
}

module.exports = {
  findById,
  findByName,
  findBySequenceOrder,
  listBySchool,
  listActiveBySchoolOrdered,
  findFinalClass,
  create,
  update,
  archive,
  reactivate,
  reorder,
  designateFinalClass,
  findSectionById,
  findSectionByName,
  createSection,
  updateSection,
  archiveSection,
  reactivateSection,
  listActiveSectionsForClass,
};
