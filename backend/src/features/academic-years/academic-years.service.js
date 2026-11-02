const prisma = require('../../config/database');
const repository = require('./academic-years.repository');
const { ConflictError, NotFoundError } = require('../../shared/errors');
const { recordAuditEvent } = require('../../shared/audit');

async function getAcademicYearOrThrow(schoolId, id, tx = prisma) {
  const academicYear = await repository.findById(id, tx);
  if (!academicYear || academicYear.schoolId !== schoolId) {
    throw new NotFoundError('Academic Year not found');
  }
  return academicYear;
}

// Business Rule #4: derived from the start/end dates' years only, never
// stored (Technical Design Requirement #5) — computed wherever it's needed.
function deriveLabel(startDate, endDate) {
  return `${new Date(startDate).getUTCFullYear()}/${new Date(endDate).getUTCFullYear()}`;
}

// Two ranges overlap (inclusive of shared boundary dates) if each one
// starts on or before the other ends — the more conservative reading,
// since the Business Specification didn't pin down the exact boundary case.
function rangesOverlap(startA, endA, startB, endB) {
  return new Date(startA) <= new Date(endB) && new Date(startB) <= new Date(endA);
}

// Business Rules #3, #4: both checks load every Academic Year in the
// school — Active AND Archived — since archiving never frees a date range
// or a label for reuse (Business Review decision). Accepted Technical Debt
// (Technical Design's own Risks section): no database-level backstop for
// either check exists here; a genuine concurrent-write race could, in the
// worst case, let two overlapping/duplicate-labeled records both persist.
// This is a deliberate, Product-Owner-accepted trade-off, not an oversight.
async function assertNoOverlapOrDuplicateLabel(schoolId, { startDate, endDate }, excludeId, tx = prisma) {
  const existing = await repository.listAllBySchool(schoolId, tx);
  const candidateLabel = deriveLabel(startDate, endDate);

  for (const year of existing) {
    if (year.id === excludeId) continue;

    if (rangesOverlap(startDate, endDate, year.startDate, year.endDate)) {
      throw new ConflictError('This date range overlaps an existing Academic Year at this school');
    }
    if (deriveLabel(year.startDate, year.endDate) === candidateLabel) {
      throw new ConflictError(`An Academic Year labeled ${candidateLabel} already exists at this school`);
    }
  }
}

// Business Rule #9: if this is the school's first-ever Academic Year, it
// automatically becomes Current — in the same transaction as the insert,
// never a separate follow-up write (Implementation Plan's Risk Assessment).
//
// Phase 9 code review finding (Critical, live-reproduced): the "is this the
// school's first Academic Year" check and the resulting isCurrent write are
// a check-then-act sequence. Two concurrent creates for a school with zero
// years could both see "first ever" and both try to become Current; the
// partial unique index correctly allows only one, but the loser's write
// previously threw an uncaught Prisma P2002, surfacing as a raw 500 (4 of 8
// concurrent requests failed this way in live testing). Fixed by acquiring
// a Postgres advisory lock scoped to this schoolId for the duration of the
// transaction — a concurrent request for the SAME school now waits here
// until the first one commits, so the race window is closed at its root
// rather than papered over with error recovery after the fact.
async function createAcademicYear(schoolId, { startDate, endDate }, actingUser) {
  // Prisma's DateTime scalar requires a full ISO-8601 datetime, not a
  // date-only string like "2024-09-01" (the shape both the frontend's date
  // picker and this feature's own validation layer accept) — normalize to a
  // real Date object once, here, rather than at every call site.
  const normalizedStart = new Date(startDate);
  const normalizedEnd = new Date(endDate);

  await assertNoOverlapOrDuplicateLabel(schoolId, { startDate: normalizedStart, endDate: normalizedEnd }, null);

  const academicYear = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);

    const isFirstEver = (await repository.countBySchool(schoolId, tx)) === 0;
    const created = await repository.create(
      { schoolId, startDate: normalizedStart, endDate: normalizedEnd },
      tx
    );
    return isFirstEver ? repository.setCurrent(created.id, tx) : created;
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'ACADEMIC_YEAR_CREATED' });
  return academicYear;
}

// Business Rule #6: both dates are always required and re-validated
// together, regardless of the target's Active/Archived lifecycle status.
async function updateAcademicYear(schoolId, id, { startDate, endDate }, actingUser) {
  await getAcademicYearOrThrow(schoolId, id);

  const normalizedStart = new Date(startDate);
  const normalizedEnd = new Date(endDate);

  await assertNoOverlapOrDuplicateLabel(schoolId, { startDate: normalizedStart, endDate: normalizedEnd }, id);

  const updated = await repository.update(id, { startDate: normalizedStart, endDate: normalizedEnd });
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'ACADEMIC_YEAR_UPDATED' });
  return updated;
}

function listAcademicYears(schoolId, { status } = {}) {
  return repository.listBySchool(schoolId, { status });
}

// --- Lifecycle & Current designation ----------------------------------

// The single dedicated transition function (Technical Design Requirement
// #7) — the ONLY code in this module that writes isCurrent. Accepts an
// optional tx so archiveAcademicYear can call it inside its own outer
// transaction when archive-and-swap must be atomic together, rather than
// nesting two separate transactions.
async function setCurrentAcademicYear(schoolId, academicYearId, tx = prisma) {
  await repository.unsetCurrent(schoolId, tx);
  return repository.setCurrent(academicYearId, tx);
}

// Business Rule #8: no-op if already Current; rejects an Archived target.
//
// Phase 9 code review finding (Critical, live-reproduced): status/isCurrent
// were previously read once, outside any transaction, then acted on — a
// concurrent archiveAcademicYear on the same record could archive it in
// between the read and this function's own write, leaving the record
// simultaneously Archived and Current. Fixed by moving the entire read-then-
// decide-then-write sequence inside one locked transaction (see
// createAcademicYear's own comment for why a per-schoolId advisory lock,
// not a savepoint or error-recovery, is the right fix here).
async function designateCurrentAcademicYear(schoolId, id, actingUser) {
  const result = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);

    const academicYear = await getAcademicYearOrThrow(schoolId, id, tx);
    if (academicYear.status === 'ARCHIVED') {
      throw new ConflictError('Cannot designate an Archived Academic Year as Current');
    }
    if (academicYear.isCurrent) {
      return { updated: academicYear, changed: false, previousCurrentId: null };
    }

    const previousCurrent = await repository.findCurrentBySchool(schoolId, tx);
    const updated = await setCurrentAcademicYear(schoolId, id, tx);
    return { updated, changed: true, previousCurrentId: previousCurrent ? previousCurrent.id : null };
  });

  if (result.changed) {
    await recordAuditEvent({
      schoolId,
      userId: actingUser.id,
      action: 'ACADEMIC_YEAR_CURRENT_CHANGED',
      metadata: { previousCurrentId: result.previousCurrentId, newCurrentId: id },
    });
  }
  return result.updated;
}

// Business Rule #9: archiving the Current Academic Year requires another
// Active Academic Year to take over Current, atomically, in the same
// transaction — the Current designation may never become empty.
//
// Phase 9 code review finding (Critical, live-reproduced): the "is this
// record Current" check was a stale read taken before any write — a
// concurrent designateCurrentAcademicYear promoting this exact record to
// Current in between the read and this function's own archive write left a
// record simultaneously Archived and Current (reproduced live: both calls
// returned 200, final state was `status: ARCHIVED, isCurrent: true`). Fixed
// the same way as designateCurrentAcademicYear: the whole decision and
// every write it leads to now happen inside one locked transaction.
async function archiveAcademicYear(schoolId, id, newCurrentAcademicYearId, actingUser) {
  const result = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);

    const academicYear = await getAcademicYearOrThrow(schoolId, id, tx);

    if (academicYear.status === 'ARCHIVED') {
      return { updated: academicYear, action: 'noop' };
    }

    if (!academicYear.isCurrent) {
      const archived = await repository.archive(id, tx);
      return { updated: archived, action: 'archived' };
    }

    if (!newCurrentAcademicYearId) {
      throw new ConflictError(
        'Cannot archive the Current Academic Year without designating a replacement — provide newCurrentAcademicYearId'
      );
    }

    const replacement = await getAcademicYearOrThrow(schoolId, newCurrentAcademicYearId, tx);
    if (replacement.id === id) {
      throw new ConflictError('The replacement Academic Year must be different from the one being archived');
    }
    if (replacement.status !== 'ACTIVE') {
      throw new ConflictError('The replacement Academic Year must be Active');
    }

    await setCurrentAcademicYear(schoolId, newCurrentAcademicYearId, tx);
    const archived = await repository.archive(id, tx);
    return { updated: archived, action: 'archived-with-handoff' };
  });

  if (result.action === 'archived' || result.action === 'archived-with-handoff') {
    await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'ACADEMIC_YEAR_ARCHIVED' });
  }
  if (result.action === 'archived-with-handoff') {
    await recordAuditEvent({
      schoolId,
      userId: actingUser.id,
      action: 'ACADEMIC_YEAR_CURRENT_CHANGED',
      metadata: { previousCurrentId: id, newCurrentId: newCurrentAcademicYearId },
    });
  }
  return result.updated;
}

async function reactivateAcademicYear(schoolId, id, actingUser) {
  const academicYear = await getAcademicYearOrThrow(schoolId, id);
  if (academicYear.status === 'ACTIVE') {
    return academicYear;
  }

  const updated = await repository.reactivate(id);
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'ACADEMIC_YEAR_REACTIVATED' });
  return updated;
}

// --- Stable public service interface for future feature integration -------
// Per the Implementation Plan's "Stable Public Service Interface" section —
// the only functions another feature module may call directly, in-process.
// Everything else in this file, and all of academic-years.repository.js, is
// module-private. No consumer exists yet (Student Management's own ACR is
// future work) — built now per this project's Future Integration Readiness
// precedent (School Management's hasEducationLevel, Class Management's
// getClassById/getSuggestedNextClass/getFinalClass, Subject Management's
// getSubjectById/isSubjectAssignedToSchool).

async function getAcademicYearById(schoolId, id) {
  const year = await repository.findById(id);
  return year && year.schoolId === schoolId ? year : null;
}

function getCurrentAcademicYear(schoolId) {
  return repository.findCurrentBySchool(schoolId);
}

function listActiveAcademicYears(schoolId) {
  return repository.listBySchool(schoolId, { status: 'ACTIVE' });
}

module.exports = {
  createAcademicYear,
  updateAcademicYear,
  listAcademicYears,
  designateCurrentAcademicYear,
  archiveAcademicYear,
  reactivateAcademicYear,
  setCurrentAcademicYear,
  getAcademicYearOrThrow,
  getAcademicYearById,
  getCurrentAcademicYear,
  listActiveAcademicYears,
};
