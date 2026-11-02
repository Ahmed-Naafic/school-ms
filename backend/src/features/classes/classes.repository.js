const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.

// (School Schedule Management, ACR-005) Serializes createClass/updateClass's
// own shiftId validation-then-write against that feature's own archiveShift,
// which acquires this exact same key (hashtext(schoolId)) around its own
// "cannot archive a Shift an active Class references" check. Its own copy,
// not an import of school-schedule.repository.js's version — an advisory
// lock is a Postgres-level primitive keyed only by schoolId, not something
// either feature owns, so each feature holds its own copy of the one-liner
// per this project's existing pattern (academic-years and school-schedule
// each already do the same).
function acquireSchoolLock(schoolId, tx) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}))`;
}

function findById(id) {
  return prisma.class.findUnique({ where: { id }, include: { sections: true } });
}

function findByName(schoolId, name, tx = prisma) {
  return tx.class.findUnique({ where: { schoolId_name: { schoolId, name } } });
}

function findBySequenceOrder(schoolId, sequenceOrder) {
  return prisma.class.findUnique({ where: { schoolId_sequenceOrder: { schoolId, sequenceOrder } } });
}

function listBySchool(schoolId, tx = prisma) {
  return tx.class.findMany({
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

// (School Schedule Management) Backs classes.service.js's own
// countActiveClassesByShift — the one narrow interface function that
// feature needs to enforce its own Business Rule #16 ("a Shift cannot be
// archived while active Classes reference it"), a single known consumer
// rather than a Subject-Management-style extensibility registry.
function countActiveByShift(schoolId, shiftId) {
  return prisma.class.count({ where: { schoolId, shiftId, status: 'ACTIVE' } });
}

function create(data, tx = prisma) {
  return tx.class.create({ data });
}

function update(id, data, tx = prisma) {
  return tx.class.update({ where: { id }, data });
}

function archive(id) {
  return prisma.class.update({ where: { id }, data: { status: 'ARCHIVED' } });
}

// Reactivation always assigns a fresh end-of-sequence position rather than
// restoring the Class's pre-archival one, per Business Rule #11 — the caller
// computes that position from every Class in the school (not the active
// subset), for the same reason `create`'s caller does (see classes.service.js).
function reactivate(id, sequenceOrder, tx = prisma) {
  return tx.class.update({ where: { id }, data: { status: 'ACTIVE', sequenceOrder } });
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

// --- GradeLevel (ACR-009, Architecture Update — Grade/Form) ----------------
// A new, fourth entity owned by this same module. Same repository file, per
// the Technical Design's "one module owns Class, Section, and now
// GradeLevel" decision.

function findGradeLevelById(id, tx = prisma) {
  return tx.gradeLevel.findUnique({ where: { id } });
}

function findGradeLevelByName(schoolId, name, tx = prisma) {
  return tx.gradeLevel.findUnique({ where: { schoolId_name: { schoolId, name } } });
}

function listGradeLevelsBySchool(schoolId, { status } = {}, tx = prisma) {
  return tx.gradeLevel.findMany({
    where: { schoolId, ...(status ? { status } : {}) },
    orderBy: { sequenceOrder: 'asc' },
  });
}

function listActiveGradeLevelsBySchoolOrdered(schoolId, tx = prisma) {
  return tx.gradeLevel.findMany({
    where: { schoolId, status: 'ACTIVE' },
    orderBy: { sequenceOrder: 'asc' },
  });
}

// The same "next position must account for every GradeLevel regardless of
// status" reasoning as nextEndOfSequencePosition for Class — the
// (schoolId, sequenceOrder) uniqueness constraint applies to archived rows
// too, per the Technical Design Review's own third finding for this
// addition (a real, maintained contiguous sequence, mirroring
// Class.sequenceOrder's exact convention).
function listAllGradeLevelsBySchool(schoolId, tx = prisma) {
  return tx.gradeLevel.findMany({ where: { schoolId } });
}

function createGradeLevel(data, tx = prisma) {
  return tx.gradeLevel.create({ data });
}

function updateGradeLevel(id, data, tx = prisma) {
  return tx.gradeLevel.update({ where: { id }, data });
}

function archiveGradeLevel(id, tx = prisma) {
  return tx.gradeLevel.update({ where: { id }, data: { status: 'ARCHIVED' } });
}

function reactivateGradeLevel(id, sequenceOrder, tx = prisma) {
  return tx.gradeLevel.update({ where: { id }, data: { status: 'ACTIVE', sequenceOrder } });
}

// Same two-phase placeholder-then-final renumbering as reorder() above, for
// the identical mid-transaction unique-index-collision reason.
function reorderGradeLevels(gradeLevelsInNewOrder, tx = prisma) {
  return tx.$transaction([
    ...gradeLevelsInNewOrder.map((gl, index) =>
      tx.gradeLevel.update({ where: { id: gl.id }, data: { sequenceOrder: -(index + 1) } })
    ),
    ...gradeLevelsInNewOrder.map((gl, index) =>
      tx.gradeLevel.update({ where: { id: gl.id }, data: { sequenceOrder: index + 1 } })
    ),
  ]);
}

// Backs classes.service.js's own countActiveClassesByGradeLevel —
// archiveGradeLevel's "referenced by an active Class" guard, the same
// shape as countActiveByShift above.
function countActiveClassesByGradeLevel(schoolId, gradeLevelId, tx = prisma) {
  return tx.class.count({ where: { schoolId, gradeLevelId, status: 'ACTIVE' } });
}

// Backs classes.service.js's own createClass default: when no gradeLevelId
// is supplied, the school's own oldest Active GradeLevel (by sequenceOrder)
// is used as a sensible default — the same "suggest, still validate" shape
// shiftId's own default-to-Default-Shift already uses, adapted since
// GradeLevel has no isDefault flag of its own (deliberately, per the
// Technical Design — any number of Active GradeLevels are equally valid).
function findFirstActiveGradeLevel(schoolId, tx = prisma) {
  return tx.gradeLevel.findFirst({
    where: { schoolId, status: 'ACTIVE' },
    orderBy: { sequenceOrder: 'asc' },
  });
}

// (Weekly Subject Allocation) The one narrow-interface query that feature
// needs to resolve which Classes' own Teacher Subject Assignments to check
// for teacher names, per Grade/Form.
function listActiveClassesByGradeLevel(gradeLevelId, tx = prisma) {
  return tx.class.findMany({ where: { gradeLevelId, status: 'ACTIVE' } });
}

// Backs assertSameShiftWithinGradeLevel — every other Active Class
// currently in the target gradeLevelId, excluding the Class being updated.
function listOtherActiveClassesInGradeLevel(gradeLevelId, excludeClassId, tx = prisma) {
  return tx.class.findMany({
    where: {
      gradeLevelId,
      status: 'ACTIVE',
      ...(excludeClassId ? { id: { not: excludeClassId } } : {}),
    },
  });
}

module.exports = {
  acquireSchoolLock,
  findById,
  findByName,
  findBySequenceOrder,
  listBySchool,
  listActiveBySchoolOrdered,
  findFinalClass,
  countActiveByShift,
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
  findGradeLevelById,
  findGradeLevelByName,
  listGradeLevelsBySchool,
  listActiveGradeLevelsBySchoolOrdered,
  listAllGradeLevelsBySchool,
  createGradeLevel,
  updateGradeLevel,
  archiveGradeLevel,
  reactivateGradeLevel,
  reorderGradeLevels,
  countActiveClassesByGradeLevel,
  findFirstActiveGradeLevel,
  listOtherActiveClassesInGradeLevel,
  listActiveClassesByGradeLevel,
};
