const prisma = require('../../config/database');
const repository = require('./school-schedule.repository');
const { ConflictError, NotFoundError, ValidationError } = require('../../shared/errors');
const { recordAuditEvent } = require('../../shared/audit');

const ALL_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// Business Rule #3: the Somalia Default — Working: Saturday–Wednesday,
// Weekend: Thursday–Friday. A fixed, built-in default the application
// initializes every new school with; not a Super-Admin-configurable
// platform template in this version (Business Rule #19).
const SOMALIA_DEFAULT_WORKING_DAYS = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY'];

// The auto-created default Shift's own fixed initial values (Business Rule
// #3). "Morning" is only its *initial* name — never reserved or protected,
// freely renamable afterward like any other Shift (Business Rule #7). The
// exact time values are a configuration detail, not a business rule.
const DEFAULT_SHIFT_NAME = 'Morning';
const DEFAULT_SHIFT_START_TIME = '07:30';
const DEFAULT_SHIFT_END_TIME = '12:30';

// --- Time-of-day <-> Date helpers --------------------------------------------
// startTime/endTime are stored as native Postgres TIME columns, surfaced by
// Prisma as DateTime values sharing a fixed 1970-01-01 reference date — see
// the Technical Design's Database Impact section. The wire format is a
// plain "HH:mm" string (matching an HTML <input type="time"> value exactly);
// conversion to/from the stored Date happens here, at the service boundary,
// the same way academic-years.service.js normalizes date-only strings to
// real Date objects before persistence.

function timeStringToDate(hhmm) {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

function dateToTimeString(date) {
  return new Date(date).toISOString().slice(11, 16);
}

function withFormattedTimes(shift) {
  return { ...shift, startTime: dateToTimeString(shift.startTime), endTime: dateToTimeString(shift.endTime) };
}

// Period's startTime/endTime are nullable (unconfigured until the School
// Admin sets them) — a genuinely new record shape for this project, so
// these helpers tolerate null rather than reusing timeStringToDate/
// dateToTimeString/withFormattedTimes directly.
function timeStringToDateOrNull(hhmm) {
  return hhmm ? timeStringToDate(hhmm) : null;
}

function dateToTimeStringOrNull(date) {
  return date ? dateToTimeString(date) : null;
}

function withFormattedPeriodTimes(period) {
  return { ...period, startTime: dateToTimeStringOrNull(period.startTime), endTime: dateToTimeStringOrNull(period.endTime) };
}

// --- School Calendar -----------------------------------------------------------

async function getSchoolCalendarOrThrow(schoolId) {
  const calendar = await repository.findCalendarBySchool(schoolId);
  if (!calendar) {
    throw new NotFoundError('School Calendar not found');
  }
  return calendar;
}

// Business Rule #5: at least one Working Day and at least one Weekend Day.
// Business Rule #4 ("never both, never neither") needs no separate runtime
// check — it is structurally guaranteed by storing only workingDays and
// deriving the complement (see getWeekendDays below).
function assertOneWorkingAndOneWeekendDay(workingDays) {
  if (workingDays.length === 0) {
    throw new ValidationError('Invalid School Calendar', {
      workingDays: 'At least one Working Day is required.',
    });
  }
  if (workingDays.length === ALL_DAYS.length) {
    throw new ValidationError('Invalid School Calendar', {
      workingDays: 'At least one Weekend Day is required — every weekday cannot be a Working Day.',
    });
  }
}

// Business Rule #6: the Calendar is a current configuration only, never
// historical/versioned — this updates the school's single row in place; no
// transaction/lock needed, since there is no uniqueness or sequencing
// invariant across other rows the way every Shift write below has.
async function updateSchoolCalendar(schoolId, { workingDays }, actingUser) {
  await getSchoolCalendarOrThrow(schoolId);
  assertOneWorkingAndOneWeekendDay(workingDays);

  const updated = await repository.updateCalendar(schoolId, workingDays);
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SCHOOL_CALENDAR_UPDATED' });
  return updated;
}

// --- Shared internal helpers ---------------------------------------------------

async function getShiftOrThrow(schoolId, shiftId, tx = prisma) {
  const shift = await repository.findShiftById(shiftId, tx);
  if (!shift || shift.schoolId !== schoolId) {
    throw new NotFoundError('Shift not found');
  }
  return shift;
}

// Business Rule #12: inclusive-boundary overlap check, the same reading
// academic-years.service.js's own rangesOverlap already established for its
// date ranges — Business Rule #12 doesn't pin down the exact touching-
// boundary case, so the already-established conservative reading is reused
// rather than inventing a second convention.
async function assertNoOverlap(schoolId, { startTime, endTime }, excludeShiftId, tx) {
  const activeShifts = await repository.listActiveShiftsBySchool(schoolId, tx);
  const start = new Date(startTime);
  const end = new Date(endTime);

  for (const shift of activeShifts) {
    if (shift.id === excludeShiftId) continue;
    if (start <= new Date(shift.endTime) && new Date(shift.startTime) <= end) {
      throw new ConflictError(`This Shift's time range overlaps the existing "${shift.name}" Shift`);
    }
  }
}

// Scoped to active Shifts only — archived Shifts hold no displayOrder at
// all here (Business Rule #14), unlike Class Management's own function of
// the same name, which also considers archived Classes.
async function nextEndOfSequencePosition(schoolId, tx) {
  const activeShifts = await repository.listActiveShiftsBySchool(schoolId, tx);
  return activeShifts.reduce((max, s) => Math.max(max, s.displayOrder || 0), 0) + 1;
}

// --- Shift: Create / Correct / List / Detail -----------------------------------

// The setup wizard's own defaults (Business Specification): 6 Teaching
// Periods, a Break included, after the 3rd Teaching Period.
const DEFAULT_WIZARD_TEACHING_PERIOD_COUNT = 6;
const DEFAULT_WIZARD_INCLUDE_BREAK = true;
const DEFAULT_WIZARD_BREAK_AFTER_PERIOD = 3;

async function createShift(
  schoolId,
  {
    name,
    startTime,
    endTime,
    teachingPeriodCount = DEFAULT_WIZARD_TEACHING_PERIOD_COUNT,
    includeBreak = DEFAULT_WIZARD_INCLUDE_BREAK,
    breakAfterPeriod = DEFAULT_WIZARD_BREAK_AFTER_PERIOD,
  },
  actingUser
) {
  const shift = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    await assertNoOverlap(schoolId, { startTime: timeStringToDate(startTime), endTime: timeStringToDate(endTime) }, null, tx);

    const created = await repository.createShift(
      {
        schoolId,
        name,
        startTime: timeStringToDate(startTime),
        endTime: timeStringToDate(endTime),
        displayOrder: await nextEndOfSequencePosition(schoolId, tx),
        isDefault: false,
        status: 'ACTIVE',
      },
      tx
    );

    // The wizard: this new Shift does not exist anywhere else yet, so
    // nothing else can be racing to write Periods for it — no separate
    // shiftId lock is needed or even meaningfully acquirable here (see
    // Technical Design's Architecture Update).
    await generatePeriodStructure(created.id, { teachingPeriodCount, includeBreak, breakAfterPeriod }, tx);

    return created;
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SHIFT_CREATED', metadata: { shiftId: shift.id } });
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'PERIOD_STRUCTURE_CREATED', metadata: { shiftId: shift.id } });
  return withFormattedTimes(shift);
}

// Rejects a narrowed Shift range that would leave one or more of that
// Shift's own configured Periods outside the new operating hours (Technical
// Design Review finding, Architecture Update). Only ever called from inside
// updateShift's own transaction, after acquireShiftLock is already held.
async function assertNoPeriodOutOfBounds(shiftId, { startTime, endTime }, tx) {
  const activePeriods = await repository.listActivePeriodsByShift(shiftId, tx);
  const start = new Date(startTime);
  const end = new Date(endTime);

  for (const period of activePeriods) {
    if (!period.startTime || !period.endTime) continue; // unconfigured — cannot be out of bounds
    if (new Date(period.startTime) < start || new Date(period.endTime) > end) {
      throw new ConflictError(
        `Cannot narrow this Shift's operating hours — the Period "${period.name}" would no longer fit inside the new range`
      );
    }
  }
}

// The edited time range is exactly as capable of introducing an overlap as
// a newly created one — locked and overlap-checked identically to
// createShift, excluding the Shift's own prior range from the comparison.
async function updateShift(schoolId, shiftId, { name, startTime, endTime }, actingUser) {
  const shift = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    // (Architecture Update — Periods, Technical Design Review finding) This
    // fixed order — schoolId lock, then shiftId lock — must never be
    // reversed anywhere in this codebase, or a deadlock becomes possible.
    // Narrowing this Shift's own range can invalidate its Periods'
    // containment, and Period writes hold this same shiftId lock, so
    // acquiring it here serializes this edit against any concurrent Period
    // write for this Shift.
    await repository.acquireShiftLock(shiftId, tx);
    await getShiftOrThrow(schoolId, shiftId, tx);
    const start = timeStringToDate(startTime);
    const end = timeStringToDate(endTime);
    await assertNoOverlap(schoolId, { startTime: start, endTime: end }, shiftId, tx);
    await assertNoPeriodOutOfBounds(shiftId, { startTime: start, endTime: end }, tx);

    return repository.updateShift(shiftId, { name, startTime: start, endTime: end }, tx);
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SHIFT_UPDATED', metadata: { shiftId } });
  return withFormattedTimes(shift);
}

async function listShifts(schoolId, { status } = {}) {
  const shifts = await repository.listShiftsBySchool(schoolId, { status });
  return shifts.map(withFormattedTimes);
}

async function getShiftDetail(schoolId, shiftId) {
  const shift = await getShiftOrThrow(schoolId, shiftId);
  return withFormattedTimes(shift);
}

// --- Shift Lifecycle: Reorder / Designate-Default / Archive / Reactivate ------

// Business Rule #13: renumbers every active Shift to a contiguous 1..N
// sequence, the same algorithm as Class Management's own reorderClass.
async function reorderShift(schoolId, shiftId, targetPosition, actingUser) {
  await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    const target = await getShiftOrThrow(schoolId, shiftId, tx);

    // (Phase 9 finding) An Archived Shift holds no displayOrder and is
    // excluded from listActiveShiftsBySchool below — proceeding without this
    // guard leaves `moved` undefined, which the renumbering step then
    // crashes on rather than rejecting cleanly. reorderClass and this
    // feature's own reorderPeriod already guard the identical case.
    if (target.status !== 'ACTIVE') {
      throw new ConflictError('An archived Shift cannot be reordered');
    }

    const activeShifts = await repository.listActiveShiftsBySchool(schoolId, tx);
    const withoutMoved = activeShifts.filter((s) => s.id !== shiftId);
    const moved = activeShifts.find((s) => s.id === shiftId);

    const clampedPosition = Math.max(1, Math.min(targetPosition, activeShifts.length));
    withoutMoved.splice(clampedPosition - 1, 0, moved);

    await repository.renumberActiveShifts(withoutMoved, tx);
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SHIFT_SEQUENCE_CHANGED', metadata: { shiftId } });
  return listShifts(schoolId, { status: 'ACTIVE' });
}

// Business Rules #8, #10, #11: mirrors academicYearsService.setCurrentAcademicYear's
// own unset-then-set pattern for an analogous "exactly one" invariant.
async function designateDefaultShift(schoolId, shiftId, actingUser) {
  const shift = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    const target = await getShiftOrThrow(schoolId, shiftId, tx);

    if (target.status !== 'ACTIVE') {
      throw new ConflictError('Only an active Shift may be designated as the Default Shift');
    }
    if (target.isDefault) {
      return target;
    }

    return repository.setDefaultShift(schoolId, shiftId, tx);
  });

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'SHIFT_DEFAULT_DESIGNATED',
    metadata: { newDefaultShiftId: shiftId },
  });
  return withFormattedTimes(shift);
}

// Business Rules #9, #10, #14, #16: rejects if it would leave zero active
// Shifts, if it is the current Default Shift (caller must designate a new
// Default first), or if an active Class still references it. On success,
// removes it from the active displayOrder sequence and renumbers the
// remainder to close the gap — the same renumbering step reorderShift uses.
async function archiveShift(schoolId, shiftId, actingUser) {
  // Required lazily, inside the function body rather than at module top
  // level: classes.service.js has its own top-level require of *this*
  // module (for validateShift/getActiveShift, per its own createClass/
  // updateClass), making this the one deliberate two-way dependency between
  // these two feature modules — Class Management's countActiveClassesByShift
  // is the narrow interface Technical Design/Implementation Planning chose
  // over a Subject-Management-style registry, since only this one call site
  // will ever need it. Requiring lazily here avoids any Node.js module-load
  // ordering fragility between the two circular top-level requires.
  const classesService = require('../classes/classes.service');

  const shift = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    const target = await getShiftOrThrow(schoolId, shiftId, tx);

    if (target.status === 'ARCHIVED') {
      return target;
    }

    const referencingClasses = await classesService.countActiveClassesByShift(schoolId, shiftId);
    if (referencingClasses > 0) {
      throw new ConflictError('Cannot archive a Shift while one or more active Classes reference it');
    }

    const activeShifts = await repository.listActiveShiftsBySchool(schoolId, tx);
    if (activeShifts.length <= 1) {
      throw new ConflictError('A school must always have at least one active Shift');
    }

    if (target.isDefault) {
      throw new ConflictError('Cannot archive the current Default Shift — designate a different Default Shift first');
    }

    const archived = await repository.updateShift(shiftId, { status: 'ARCHIVED', displayOrder: null }, tx);
    const remaining = activeShifts.filter((s) => s.id !== shiftId);
    await repository.renumberActiveShifts(remaining, tx);

    return archived;
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SHIFT_ARCHIVED', metadata: { shiftId } });
  return withFormattedTimes(shift);
}

// Re-checks overlap before restoring — a Shift archived at one point cannot
// assume its own old time range is still conflict-free against whatever is
// active now, since a different Shift may since have been created or
// edited into a range that now overlaps it. On success, appended to the
// end of the active displayOrder sequence (Business Rule #14) — never
// automatically made the Default.
async function reactivateShift(schoolId, shiftId, actingUser) {
  const shift = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    const target = await getShiftOrThrow(schoolId, shiftId, tx);

    if (target.status === 'ACTIVE') {
      return target;
    }

    await assertNoOverlap(schoolId, { startTime: target.startTime, endTime: target.endTime }, shiftId, tx);

    return repository.updateShift(
      shiftId,
      { status: 'ACTIVE', displayOrder: await nextEndOfSequencePosition(schoolId, tx) },
      tx
    );
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SHIFT_REACTIVATED', metadata: { shiftId } });
  return withFormattedTimes(shift);
}

// --- Period: shared internal helpers -------------------------------------------
// Architecture Update (Periods). Period is shift-scoped, not school-scoped —
// its own lock, overlap check, and sequence position are all keyed by
// shiftId, mirroring Shift's own shape one level down.

async function getPeriodOrThrow(shiftId, periodId, tx = prisma) {
  const period = await repository.findPeriodById(periodId, tx);
  if (!period || period.shiftId !== shiftId) {
    throw new NotFoundError('Period not found');
  }
  return period;
}

// Business Rule #25: scoped to the Period's own Shift, not the school.
// Skipped when either time is null — an unconfigured Period neither
// overlaps anything nor can be overlapped.
async function assertPeriodNoOverlap(shiftId, { startTime, endTime }, excludePeriodId, tx) {
  if (!startTime || !endTime) return;
  const activePeriods = await repository.listActivePeriodsByShift(shiftId, tx);
  const start = new Date(startTime);
  const end = new Date(endTime);

  for (const period of activePeriods) {
    if (period.id === excludePeriodId) continue;
    if (!period.startTime || !period.endTime) continue;
    if (start <= new Date(period.endTime) && new Date(period.startTime) <= end) {
      throw new ConflictError(`This Period's time range overlaps the existing "${period.name}" Period`);
    }
  }
}

// Business Rule #25/Validation Rule #15: a configured Period must fit
// completely inside its parent Shift's own operating hours. Skipped when
// either Period time is null.
function assertPeriodFitsWithinShift(shift, { startTime, endTime }) {
  if (!startTime || !endTime) return;
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (start < new Date(shift.startTime) || end > new Date(shift.endTime)) {
    throw new ValidationError('Invalid Period', {
      startTime: "Must fit completely inside the parent Shift's own operating hours.",
    });
  }
}

// Scoped to active Periods within one Shift only — archived Periods hold no
// displayOrder at all, the same convention Shift's own function of this name
// already established.
async function nextPeriodSequencePosition(shiftId, tx) {
  const activePeriods = await repository.listActivePeriodsByShift(shiftId, tx);
  return activePeriods.reduce((max, p) => Math.max(max, p.displayOrder || 0), 0) + 1;
}

// A Period's own shiftId never changes (Business Rule #23: "a Period may
// never be moved across Shifts"), so resolving it via an unlocked read
// before acquiring the shiftId lock is safe — there is no value that could
// go stale between this read and the lock acquisition. Used by every
// flat /periods/{id}... write path (update/reorder/archive/reactivate),
// which — unlike create/list — has no shiftId in its own URL, mirroring
// Technical Design's API Design (PATCH /periods/{id} etc., not nested).
// Tenant isolation is still fully enforced inside the transaction via
// getShiftOrThrow; this lookup itself never returns data to the caller.
async function resolvePeriodShiftId(periodId) {
  const period = await repository.findPeriodById(periodId);
  if (!period) {
    throw new NotFoundError('Period not found');
  }
  return period.shiftId;
}

// --- Period: Create / Correct / List / Detail ----------------------------------

async function createPeriod(schoolId, shiftId, { name, type, startTime, endTime }, actingUser) {
  const period = await prisma.$transaction(async (tx) => {
    await repository.acquireShiftLock(shiftId, tx);
    const shift = await getShiftOrThrow(schoolId, shiftId, tx);

    const start = timeStringToDateOrNull(startTime);
    const end = timeStringToDateOrNull(endTime);
    assertPeriodFitsWithinShift(shift, { startTime: start, endTime: end });
    await assertPeriodNoOverlap(shiftId, { startTime: start, endTime: end }, null, tx);

    return repository.createPeriod(
      {
        shiftId,
        name,
        type,
        startTime: start,
        endTime: end,
        displayOrder: await nextPeriodSequencePosition(shiftId, tx),
        status: 'ACTIVE',
      },
      tx
    );
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'PERIOD_CREATED', metadata: { periodId: period.id, shiftId } });
  return withFormattedPeriodTimes(period);
}

// Same shape as updateShift, one level down: re-validates containment +
// overlap against the *other* active Periods in the same Shift, only when
// both times are present after the edit. No shiftId parameter — this is a
// flat PATCH /periods/{id} route (Technical Design's API Design), so the
// parent Shift is resolved server-side via resolvePeriodShiftId.
async function updatePeriod(schoolId, periodId, { name, type, startTime, endTime }, actingUser) {
  const shiftId = await resolvePeriodShiftId(periodId);
  const period = await prisma.$transaction(async (tx) => {
    await repository.acquireShiftLock(shiftId, tx);
    const shift = await getShiftOrThrow(schoolId, shiftId, tx);
    await getPeriodOrThrow(shiftId, periodId, tx);

    const start = timeStringToDateOrNull(startTime);
    const end = timeStringToDateOrNull(endTime);
    assertPeriodFitsWithinShift(shift, { startTime: start, endTime: end });
    await assertPeriodNoOverlap(shiftId, { startTime: start, endTime: end }, periodId, tx);

    return repository.updatePeriod(periodId, { name, type, startTime: start, endTime: end }, tx);
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'PERIOD_UPDATED', metadata: { periodId, shiftId } });
  return withFormattedPeriodTimes(period);
}

async function listPeriods(schoolId, shiftId, { status } = {}) {
  await getShiftOrThrow(schoolId, shiftId);
  const periods = await repository.listPeriodsByShift(shiftId, { status });
  return periods.map(withFormattedPeriodTimes);
}

// Not nested under shiftId in the route, mirroring GET /shifts/{id}'s own
// flat-detail-route precedent — tenant isolation resolved via the parent
// Shift, since Period itself has no schoolId column.
async function getPeriodDetail(schoolId, periodId) {
  const period = await repository.findPeriodById(periodId);
  if (!period) {
    throw new NotFoundError('Period not found');
  }
  await getShiftOrThrow(schoolId, period.shiftId);
  return withFormattedPeriodTimes(period);
}

// --- Period Lifecycle: Reorder / Archive / Reactivate --------------------------

// Business Rule #26: renumbers every active Period within the same Shift to
// a contiguous 1..N sequence, the same algorithm as reorderShift, scoped one
// level down. Mirrors Class Management's own reorderClass in explicitly
// rejecting an Archived target, rather than reorderShift's own latent gap
// (reorderShift never guards this — out of scope for this pass, since it
// predates Period and is already-Accepted, unchanged code).
async function reorderPeriod(schoolId, periodId, targetPosition, actingUser) {
  const shiftId = await resolvePeriodShiftId(periodId);
  await prisma.$transaction(async (tx) => {
    await repository.acquireShiftLock(shiftId, tx);
    await getShiftOrThrow(schoolId, shiftId, tx);
    const target = await getPeriodOrThrow(shiftId, periodId, tx);

    if (target.status === 'ARCHIVED') {
      throw new ConflictError('An archived Period cannot be reordered');
    }

    const activePeriods = await repository.listActivePeriodsByShift(shiftId, tx);
    const withoutMoved = activePeriods.filter((p) => p.id !== periodId);
    const moved = activePeriods.find((p) => p.id === periodId);

    const clampedPosition = Math.max(1, Math.min(targetPosition, activePeriods.length));
    withoutMoved.splice(clampedPosition - 1, 0, moved);

    await repository.renumberActivePeriods(withoutMoved, tx);
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'PERIOD_SEQUENCE_CHANGED', metadata: { periodId, shiftId } });
  return listPeriods(schoolId, shiftId, { status: 'ACTIVE' });
}

// No downstream-reference check exists yet (unlike archiveShift's check
// against Class.shiftId) — no consuming feature (Timetable, Attendance, Exam
// Management) exists yet to reference a specific Period. A future feature
// that needs to block Period archival while referenced adds that check
// itself, the same way archiveShift's own check was added once Class
// Management's dependency became concrete, not before.
async function archivePeriod(schoolId, periodId, actingUser) {
  const shiftId = await resolvePeriodShiftId(periodId);
  const period = await prisma.$transaction(async (tx) => {
    await repository.acquireShiftLock(shiftId, tx);
    await getShiftOrThrow(schoolId, shiftId, tx);
    const target = await getPeriodOrThrow(shiftId, periodId, tx);

    if (target.status === 'ARCHIVED') {
      return target;
    }

    const archived = await repository.updatePeriod(periodId, { status: 'ARCHIVED', displayOrder: null }, tx);
    const remaining = (await repository.listActivePeriodsByShift(shiftId, tx)).filter((p) => p.id !== periodId);
    await repository.renumberActivePeriods(remaining, tx);

    return archived;
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'PERIOD_ARCHIVED', metadata: { periodId, shiftId } });
  return withFormattedPeriodTimes(period);
}

// An archived Period cannot assume its own old time range is still
// conflict-free against whatever is active now — re-checks containment +
// overlap before restoring, only if both stored times are non-null (an
// unconfigured, never-timed Period can always be restored with no conflict
// possible). Appended to the end of the Shift's active sequence on success
// (Business Rule #27).
async function reactivatePeriod(schoolId, periodId, actingUser) {
  const shiftId = await resolvePeriodShiftId(periodId);
  const period = await prisma.$transaction(async (tx) => {
    await repository.acquireShiftLock(shiftId, tx);
    const shift = await getShiftOrThrow(schoolId, shiftId, tx);
    const target = await getPeriodOrThrow(shiftId, periodId, tx);

    if (target.status === 'ACTIVE') {
      return target;
    }

    assertPeriodFitsWithinShift(shift, { startTime: target.startTime, endTime: target.endTime });
    await assertPeriodNoOverlap(shiftId, { startTime: target.startTime, endTime: target.endTime }, periodId, tx);

    return repository.updatePeriod(
      periodId,
      { status: 'ACTIVE', displayOrder: await nextPeriodSequencePosition(shiftId, tx) },
      tx
    );
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'PERIOD_REACTIVATED', metadata: { periodId, shiftId } });
  return withFormattedPeriodTimes(period);
}

// --- Period Structure Generation (Bootstrap + Setup Wizard) --------------------
// Business Rules #29-#30 (Business Specification numbering). Private — not
// part of the Stable Public Service Interface. Called by both createShift
// (wizard case, caller-supplied values) and createDefaultScheduleForSchool
// (bootstrap case, fixed default arguments), always from inside the
// caller's own already-open, already-locked transaction.

// Assembly: build teachingPeriodCount Teaching slots in order; if
// includeBreak, insert exactly one Break slot immediately after the
// breakAfterPeriod-th Teaching slot (1-based — breakAfterPeriod equal to
// teachingPeriodCount is a valid "Break at the end" case). Naming: a Break
// slot is always literally "Break"; a Teaching slot is "Period {k}" where k
// counts continuously through any Break — confirmed during this feature's
// own Phase 4 Technical Design Review, not an assumption.
function buildPeriodStructureSlots(teachingPeriodCount, includeBreak, breakAfterPeriod) {
  const slots = [];
  let teachingNumber = 0;

  for (let position = 1; position <= teachingPeriodCount; position += 1) {
    teachingNumber += 1;
    slots.push({ type: 'TEACHING', name: `Period ${teachingNumber}` });
    if (includeBreak && position === breakAfterPeriod) {
      slots.push({ type: 'BREAK', name: 'Break' });
    }
  }

  return slots;
}

async function generatePeriodStructure(shiftId, { teachingPeriodCount, includeBreak, breakAfterPeriod }, tx) {
  const slots = buildPeriodStructureSlots(teachingPeriodCount, includeBreak, breakAfterPeriod);
  const data = slots.map((slot, index) => ({
    shiftId,
    name: slot.name,
    type: slot.type,
    startTime: null,
    endTime: null,
    displayOrder: index + 1,
    status: 'ACTIVE',
  }));

  await repository.createManyPeriods(data, tx);
}

// --- Bootstrap: called by School & Platform Management's own createSchool ----
// Business Rule #3: the Somalia Default Calendar and a default "Morning"
// Shift (Active, Default) are created together, atomically with respect to
// each other, the moment a new school is created. Not wrapped in a shared
// cross-feature transaction with School & Platform Management's own school
// insert (Loose Coupling — a narrow-interface call, not a shared Prisma
// client) — see schools.service.js's createSchool for the compensating
// rollback this relies on if this call fails, and SchoolCalendar/Shift's own
// `onDelete: Cascade` relation to School for why that rollback stays safe.
async function createDefaultScheduleForSchool(schoolId, actingUser) {
  await repository.createCalendar(schoolId, SOMALIA_DEFAULT_WORKING_DAYS);

  // The default Shift and its default Period structure are created together,
  // inside one transaction — nothing else can reference a Shift that doesn't
  // exist outside this transaction yet, so no shiftId lock is needed here
  // either (Technical Design's Architecture Update).
  const shift = await prisma.$transaction(async (tx) => {
    const created = await repository.createShift(
      {
        schoolId,
        name: DEFAULT_SHIFT_NAME,
        startTime: timeStringToDate(DEFAULT_SHIFT_START_TIME),
        endTime: timeStringToDate(DEFAULT_SHIFT_END_TIME),
        displayOrder: 1,
        isDefault: true,
        status: 'ACTIVE',
      },
      tx
    );

    await generatePeriodStructure(
      created.id,
      {
        teachingPeriodCount: DEFAULT_WIZARD_TEACHING_PERIOD_COUNT,
        includeBreak: DEFAULT_WIZARD_INCLUDE_BREAK,
        breakAfterPeriod: DEFAULT_WIZARD_BREAK_AFTER_PERIOD,
      },
      tx
    );

    return created;
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SCHOOL_CALENDAR_CREATED' });
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'DEFAULT_SHIFT_CREATED', metadata: { shiftId: shift.id } });
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'PERIOD_STRUCTURE_CREATED', metadata: { shiftId: shift.id } });

  return shift;
}

// --- Stable public service interface for future feature integration -------
// Per this project's established Stable Public Service Interface contract —
// the only functions another feature module may call directly, in-process.
// Everything else in this file, and all of school-schedule.repository.js,
// is module-private.

async function getSchoolCalendar(schoolId) {
  return repository.findCalendarBySchool(schoolId);
}

async function getWorkingDays(schoolId) {
  const calendar = await repository.findCalendarBySchool(schoolId);
  return calendar ? calendar.workingDays : [];
}

async function getWeekendDays(schoolId) {
  const workingDays = await getWorkingDays(schoolId);
  return ALL_DAYS.filter((day) => !workingDays.includes(day));
}

async function getSchoolShifts(schoolId, { status } = {}) {
  const shifts = await repository.listShiftsBySchool(schoolId, { status });
  return shifts.map(withFormattedTimes);
}

// tx is optional and defaults to the module-level client — a caller that
// already holds its own per-school advisory lock (same
// pg_advisory_xact_lock(hashtext(schoolId)) key this feature's own
// repository uses) may pass its transaction client through so this read
// participates in that same lock's serialization instead of racing a
// concurrent Shift write on a separate connection. See classes.service.js's
// createClass/updateClass for the one consumer that needs this.
async function getActiveShift(schoolId, tx = prisma) {
  const shift = await repository.findDefaultShift(schoolId, tx);
  return shift ? withFormattedTimes(shift) : null;
}

async function getShiftById(schoolId, shiftId) {
  const shift = await repository.findShiftById(shiftId);
  return shift && shift.schoolId === schoolId ? withFormattedTimes(shift) : null;
}

async function validateWorkingDay(schoolId, dayOfWeek) {
  const workingDays = await getWorkingDays(schoolId);
  return workingDays.includes(dayOfWeek);
}

async function validateShift(schoolId, shiftId, tx = prisma) {
  const shift = await repository.findShiftById(shiftId, tx);
  return Boolean(shift && shift.schoolId === schoolId && shift.status === 'ACTIVE');
}

// (Architecture Update — Periods) Matches the exact function names Business
// Rule #21 names, for Timetable/Attendance/Exam Management/Teacher Daily
// Schedule/Student Daily Schedule's future consumption.

async function getShiftPeriods(schoolId, shiftId, { status } = {}) {
  const shift = await repository.findShiftById(shiftId);
  if (!shift || shift.schoolId !== schoolId) {
    return [];
  }
  const periods = await repository.listPeriodsByShift(shiftId, { status });
  return periods.map(withFormattedPeriodTimes);
}

async function getPeriodById(schoolId, periodId) {
  const period = await repository.findPeriodById(periodId);
  if (!period) return null;
  const shift = await repository.findShiftById(period.shiftId);
  return shift && shift.schoolId === schoolId ? withFormattedPeriodTimes(period) : null;
}

async function validatePeriod(schoolId, periodId) {
  const period = await repository.findPeriodById(periodId);
  if (!period || period.status !== 'ACTIVE') return false;
  const shift = await repository.findShiftById(period.shiftId);
  return Boolean(shift && shift.schoolId === schoolId);
}

module.exports = {
  getSchoolCalendarOrThrow,
  updateSchoolCalendar,
  createShift,
  updateShift,
  listShifts,
  getShiftDetail,
  reorderShift,
  designateDefaultShift,
  archiveShift,
  reactivateShift,
  createDefaultScheduleForSchool,
  createPeriod,
  updatePeriod,
  listPeriods,
  getPeriodDetail,
  reorderPeriod,
  archivePeriod,
  reactivatePeriod,
  getSchoolCalendar,
  getWorkingDays,
  getWeekendDays,
  getSchoolShifts,
  getActiveShift,
  getShiftById,
  validateWorkingDay,
  validateShift,
  getShiftPeriods,
  getPeriodById,
  validatePeriod,
};
