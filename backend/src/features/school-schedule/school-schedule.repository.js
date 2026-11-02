const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.

// Serializes any check-then-act write for a given school's Shifts
// (Business Rules #8, #10, #12, #13, #14), so two concurrent creates,
// edits, reorders, default-designations, archives, or reactivations for the
// same school can never race past each other's stale read — the same
// pg_advisory_xact_lock pattern this project has now applied proactively
// since Teacher Subject Assignment, extended here to cover a combined
// uniqueness + sequencing invariant for the first time.
function acquireSchoolLock(schoolId, tx) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}))`;
}

// Serializes Period writes for a given Shift (Business Rules #25, #26) — a
// different key from acquireSchoolLock's, since every Period invariant is
// scoped to its own Shift, not the school (Technical Design's Architecture
// Update). updateShift also acquires this lock (always after acquireSchoolLock,
// never before — a fixed order required to avoid deadlock) since narrowing a
// Shift's own time range can invalidate its Periods' containment.
function acquireShiftLock(shiftId, tx) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${shiftId}))`;
}

// --- SchoolCalendar ----------------------------------------------------------

function findCalendarBySchool(schoolId, tx = prisma) {
  return tx.schoolCalendar.findUnique({ where: { schoolId } });
}

function createCalendar(schoolId, workingDays, tx = prisma) {
  return tx.schoolCalendar.create({ data: { schoolId, workingDays } });
}

function updateCalendar(schoolId, workingDays) {
  return prisma.schoolCalendar.update({ where: { schoolId }, data: { workingDays } });
}

// --- Shift --------------------------------------------------------------------

function findShiftById(id, tx = prisma) {
  return tx.shift.findUnique({ where: { id } });
}

function listShiftsBySchool(schoolId, { status } = {}) {
  return prisma.shift.findMany({
    where: { schoolId, ...(status ? { status } : {}) },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

function listActiveShiftsBySchool(schoolId, tx = prisma) {
  return tx.shift.findMany({ where: { schoolId, status: 'ACTIVE' }, orderBy: { displayOrder: 'asc' } });
}

function findDefaultShift(schoolId, tx = prisma) {
  return tx.shift.findFirst({ where: { schoolId, isDefault: true } });
}

function createShift(data, tx = prisma) {
  return tx.shift.create({ data });
}

function updateShift(id, data, tx = prisma) {
  return tx.shift.update({ where: { id }, data });
}

// Reassigns a contiguous 1..N displayOrder to every provided (active) Shift,
// in the order given, inside the caller's own already-open transaction —
// the same two-phase negative-placeholder trick Class Management's own
// `reorder` already established, adapted to run sequentially against a
// transaction client rather than as its own standalone prisma.$transaction
// batch (this function is always called from inside a transaction that has
// already acquired the per-school lock). Two-phase because the
// (schoolId, displayOrder) unique index is checked per statement, not
// deferred to commit, so writing final positions directly can collide
// mid-transaction whenever two Shifts swap positions.
async function renumberActiveShifts(shiftsInOrder, tx) {
  for (let i = 0; i < shiftsInOrder.length; i += 1) {
    await tx.shift.update({ where: { id: shiftsInOrder[i].id }, data: { displayOrder: -(i + 1) } });
  }
  for (let i = 0; i < shiftsInOrder.length; i += 1) {
    await tx.shift.update({ where: { id: shiftsInOrder[i].id }, data: { displayOrder: i + 1 } });
  }
}

// Unsets any current Default Shift and sets the new one, inside the
// caller's own already-open transaction — the same unset-then-set pattern
// academicYearsService.setCurrentAcademicYear already established for its
// own analogous "exactly one" invariant.
async function setDefaultShift(schoolId, shiftId, tx) {
  await tx.shift.updateMany({ where: { schoolId, isDefault: true }, data: { isDefault: false } });
  return tx.shift.update({ where: { id: shiftId }, data: { isDefault: true } });
}

// --- Period ---------------------------------------------------------------

function findPeriodById(id, tx = prisma) {
  return tx.period.findUnique({ where: { id } });
}

function listPeriodsByShift(shiftId, { status } = {}, tx = prisma) {
  return tx.period.findMany({
    where: { shiftId, ...(status ? { status } : {}) },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

function listActivePeriodsByShift(shiftId, tx = prisma) {
  return tx.period.findMany({ where: { shiftId, status: 'ACTIVE' }, orderBy: { displayOrder: 'asc' } });
}

function createPeriod(data, tx = prisma) {
  return tx.period.create({ data });
}

function createManyPeriods(data, tx = prisma) {
  return tx.period.createMany({ data });
}

function updatePeriod(id, data, tx = prisma) {
  return tx.period.update({ where: { id }, data });
}

// Same two-phase negative-placeholder trick as renumberActiveShifts, scoped
// to one Shift's own active Periods instead of a school's active Shifts.
async function renumberActivePeriods(periodsInOrder, tx) {
  for (let i = 0; i < periodsInOrder.length; i += 1) {
    await tx.period.update({ where: { id: periodsInOrder[i].id }, data: { displayOrder: -(i + 1) } });
  }
  for (let i = 0; i < periodsInOrder.length; i += 1) {
    await tx.period.update({ where: { id: periodsInOrder[i].id }, data: { displayOrder: i + 1 } });
  }
}

module.exports = {
  acquireSchoolLock,
  acquireShiftLock,
  findCalendarBySchool,
  createCalendar,
  updateCalendar,
  findShiftById,
  listShiftsBySchool,
  listActiveShiftsBySchool,
  findDefaultShift,
  createShift,
  updateShift,
  renumberActiveShifts,
  setDefaultShift,
  findPeriodById,
  listPeriodsByShift,
  listActivePeriodsByShift,
  createPeriod,
  createManyPeriods,
  updatePeriod,
  renumberActivePeriods,
};
