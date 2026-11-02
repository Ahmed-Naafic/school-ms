const prisma = require('../../config/database');
const repository = require('./teacher-subject-assignments.repository');
const { ConflictError, NotFoundError, ValidationError } = require('../../shared/errors');
const { recordAuditEvent } = require('../../shared/audit');

// Cross-feature calls through single, narrow, public interfaces only, per
// Decision-Making-Principles' Feature Ownership / Loose Coupling and the
// Technical Design's Architecture section. This module never queries
// Teacher Management's, Subject Management's, Class Management's, or
// Academic Year Management's tables directly.
const teachersService = require('../teachers/teachers.service');
const subjectsService = require('../subjects/subjects.service');
const classesService = require('../classes/classes.service');
const academicYearsService = require('../academic-years/academic-years.service');
const schoolScheduleService = require('../school-schedule/school-schedule.service');

// --- Dependency-validation registration (Business Rule #19) -----------------
// Registered at this module's own load time — app.js requires every feature
// module before the server starts listening, the same require-order
// guarantee every other consumer of this registry already relies on. Subject
// Management's own code never changes as a result.
subjectsService.registerRemovalDependencyCheck('teacher-subject-assignments', async (schoolId, subjectId) => {
  const active = await repository.findActiveBySubject(schoolId, subjectId);
  return active ? 'an active Teacher Subject Assignment references this Subject' : null;
});

// --- Downstream-record-check extension point (Business Rule #17) -----------
// Mirrors Subject Management's own dependency-validation registry exactly.
// The registry starts empty — Attendance, Exam Management, Grade Book, and
// Report Cards, the only features that could ever register a checker, don't
// exist yet. This is expected, not a defect (Technical Design's Risks
// section) — a past-Academic-Year assignment requiring an explicit reason is
// simply not reachable in practice today.
const downstreamRecordCheckers = [];

function registerDownstreamRecordCheck(name, checkFn) {
  downstreamRecordCheckers.push({ name, check: checkFn });
}

// --- Derived status (Architecture: never stored) ----------------------------

function deriveAssignmentStatus(assignment) {
  return assignment.effectiveEndDate === null ? 'ACTIVE' : 'ENDED';
}

function withDerivedStatus(assignment) {
  return { ...assignment, status: deriveAssignmentStatus(assignment) };
}

async function getAssignmentOrThrow(schoolId, id) {
  const assignment = await repository.findById(id);
  if (!assignment || assignment.schoolId !== schoolId) {
    throw new NotFoundError('Teacher Subject Assignment not found');
  }
  return assignment;
}

// --- Shared assertion helpers ------------------------------------------------
// Called from every write path that needs them (creation, Replace Teacher,
// and each copy candidate) — mirroring Student Management's own
// assertClassEnrollable/assertSectionEnrollable/assertAcademicYearEnrollable
// shared-helper pattern exactly, per the Technical Design's Backend Design.

// Business Rule #7: Teacher exists, belongs to this school, and is ACTIVE.
async function assertTeacherAssignable(schoolId, teacherId) {
  const teacher = await teachersService.getTeacherById(schoolId, teacherId);
  if (!teacher) {
    throw new ValidationError('Invalid Teacher', { teacherId: 'This Teacher does not exist for your school.' });
  }
  if (teacher.employmentStatus !== 'ACTIVE') {
    throw new ValidationError('Invalid Teacher', {
      teacherId: 'Only a Teacher whose employment status is ACTIVE may receive a new assignment.',
    });
  }
}

// Business Rule #14: Subject is ACTIVE and currently assigned to this school.
async function assertSubjectAssignable(schoolId, subjectId) {
  const subject = await subjectsService.getSubjectById(subjectId);
  if (!subject || subject.status !== 'ACTIVE') {
    throw new ValidationError('Invalid Subject', { subjectId: 'This Subject does not exist or is not ACTIVE.' });
  }
  const assigned = await subjectsService.isSubjectAssignedToSchool(schoolId, subjectId);
  if (!assigned) {
    throw new ValidationError('Invalid Subject', {
      subjectId: 'This Subject is not currently assigned to your school.',
    });
  }
}

// Business Rules #15, #23: Class exists, belongs to this school, and is
// ACTIVE; if the Class has one or more active Sections, sectionId is
// required and must resolve to one of them; if it has none, sectionId must
// be absent — the same "one shared helper both requires and validates"
// design Student Management's assertSectionEnrollable already established.
async function assertClassSectionAssignable(schoolId, classId, sectionId) {
  const cls = await classesService.getClassById(classId);
  if (!cls || cls.schoolId !== schoolId || cls.status !== 'ACTIVE') {
    throw new ValidationError('Invalid Class', { classId: 'This Class does not exist or is not ACTIVE for your school.' });
  }

  const activeSections = await classesService.listActiveSectionsForClass(schoolId, classId);
  if (sectionId) {
    const match = activeSections.find((section) => section.id === sectionId);
    if (!match) {
      throw new ValidationError('Invalid Section', {
        sectionId: 'This Section is not a valid, active Section of the selected Class.',
      });
    }
  } else if (activeSections.length > 0) {
    throw new ValidationError('A Section is required', {
      sectionId: 'Required — the selected Class has active Sections; choose one.',
    });
  }
}

// Business Rule #16: Academic Year exists, belongs to this school, and is
// not Archived. Returns the record — a pure implementation-mechanism choice
// so callers needing its startDate/endDate (date-range validation, copy's
// default effectiveStartDate) don't have to re-fetch it themselves.
async function assertAcademicYearAssignable(schoolId, academicYearId) {
  if (!academicYearId) {
    throw new ValidationError('An Academic Year is required', {
      academicYearId: 'Required — create an Academic Year for your school first if none exists yet.',
    });
  }

  const academicYear = await academicYearsService.getAcademicYearById(schoolId, academicYearId);
  if (!academicYear) {
    throw new ValidationError('Invalid Academic Year', {
      academicYearId: 'This Academic Year does not exist for your school.',
    });
  }
  if (academicYear.status === 'ARCHIVED') {
    throw new ValidationError('Invalid Academic Year', {
      academicYearId: 'This Academic Year is archived and cannot accept a new assignment.',
    });
  }
  return academicYear;
}

// Validation Rule #7: both dates must fall within the selected Academic
// Year's own start/end dates (inclusive of the boundary, mirroring Academic
// Year Management's own rangesOverlap boundary treatment).
function assertDatesWithinAcademicYear(academicYear, effectiveStartDate, effectiveEndDate) {
  const yearStart = new Date(academicYear.startDate);
  const yearEnd = new Date(academicYear.endDate);
  const start = new Date(effectiveStartDate);

  if (start < yearStart || start > yearEnd) {
    throw new ValidationError('Invalid effective start date', {
      effectiveStartDate: "This date must fall within the selected Academic Year's own date range.",
    });
  }

  if (effectiveEndDate) {
    const end = new Date(effectiveEndDate);
    if (end < yearStart || end > yearEnd) {
      throw new ValidationError('Invalid effective end date', {
        effectiveEndDate: "This date must fall within the selected Academic Year's own date range.",
      });
    }
  }
}

// Business Rule #4 — always called last, after every other assertion has
// already passed, and always inside the same locked transaction as the
// eventual insert.
async function assertNoActiveDuplicate(schoolId, { academicYearId, classId, sectionId, subjectId }, tx) {
  const duplicate = await repository.findActiveByScope({ schoolId, academicYearId, classId, sectionId, subjectId }, tx);
  if (duplicate) {
    throw new ConflictError(
      'An Active Teacher Subject Assignment already exists for this School, Academic Year, Class, Section, and Subject combination'
    );
  }
}

// Business Rule #17 — requires a non-empty reason only if the target
// Academic Year's endDate is in the past and at least one registered
// checker reports a downstream record. The fast path below (registry empty)
// is what actually runs today, per the Risks section's own note.
async function assertReasonIfDownstreamRecordsExist(schoolId, { academicYearId, classId, subjectId }, reason) {
  if (downstreamRecordCheckers.length === 0) {
    return;
  }

  const academicYear = await academicYearsService.getAcademicYearById(schoolId, academicYearId);
  const isPastYear = academicYear && new Date(academicYear.endDate) < new Date();
  if (!isPastYear) {
    return;
  }

  for (const { check } of downstreamRecordCheckers) {
    const hasDownstreamRecords = await check(schoolId, academicYearId, classId, subjectId);
    if (hasDownstreamRecords) {
      if (!reason || !reason.trim()) {
        throw new ValidationError('A reason is required', {
          reason: 'This Academic Year already has downstream academic records for this Class/Subject — provide a reason.',
        });
      }
      return;
    }
  }
}

// --- The one shared internal creation path ----------------------------------
// createAssignment, replaceTeacher, and each copyAssignments candidate all
// call this exact same function — never a hand-rolled partial
// re-implementation of it — per the Technical Design's Risks section and
// Technical Design Review's own finding on a first replaceTeacher draft.
// Assumes the caller has already acquired the per-school advisory lock as
// the first statement of its own transaction; this function does not
// acquire it again.
async function runCreateAssignment(
  tx,
  schoolId,
  { teacherId, subjectId, classId, sectionId, academicYearId, effectiveStartDate, effectiveEndDate, reason }
) {
  await assertTeacherAssignable(schoolId, teacherId);
  await assertSubjectAssignable(schoolId, subjectId);
  await assertClassSectionAssignable(schoolId, classId, sectionId);
  const academicYear = await assertAcademicYearAssignable(schoolId, academicYearId);
  assertDatesWithinAcademicYear(academicYear, effectiveStartDate, effectiveEndDate);
  await assertReasonIfDownstreamRecordsExist(schoolId, { academicYearId, classId, subjectId }, reason);
  await assertNoActiveDuplicate(schoolId, { academicYearId, classId, sectionId, subjectId }, tx);

  return repository.create(
    {
      schoolId,
      academicYearId,
      teacherId,
      subjectId,
      classId,
      sectionId: sectionId || null,
      effectiveStartDate: new Date(effectiveStartDate),
      effectiveEndDate: effectiveEndDate ? new Date(effectiveEndDate) : null,
      endReason: null,
    },
    tx
  );
}

// --- Creation ----------------------------------------------------------------

async function createAssignment(schoolId, payload, actingUser) {
  const { teacherId, subjectId, classId, sectionId, effectiveStartDate, effectiveEndDate, reason } = payload;

  // Business Rule #16: defaults to the school's Current Academic Year when
  // omitted — the defaulted value still passes through the exact same
  // assertAcademicYearAssignable check an explicit choice would, mirroring
  // Student Management's own Promotion-default pattern (post-ACR-004). It
  // can never bypass validation.
  let academicYearId = payload.academicYearId;
  if (!academicYearId) {
    const current = await academicYearsService.getCurrentAcademicYear(schoolId);
    academicYearId = current ? current.id : null;
  }

  const assignment = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    return runCreateAssignment(tx, schoolId, {
      teacherId,
      subjectId,
      classId,
      sectionId,
      academicYearId,
      effectiveStartDate,
      effectiveEndDate,
      reason,
    });
  });

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'TEACHER_SUBJECT_ASSIGNMENT_CREATED',
    metadata: { assignmentId: assignment.id },
  });

  return withDerivedStatus(assignment);
}

// --- Listing / detail ---------------------------------------------------------

async function listAssignments(schoolId, { academicYearId, teacherId, subjectId, classId, sectionId, page = 1, pageSize = 20 } = {}) {
  const { assignments, total } = await repository.listBySchool({
    schoolId,
    academicYearId,
    teacherId,
    subjectId,
    classId,
    sectionId,
    page,
    pageSize,
  });
  return { assignments: assignments.map(withDerivedStatus), total, page, pageSize };
}

async function getAssignmentDetail(schoolId, id) {
  const assignment = await getAssignmentOrThrow(schoolId, id);
  return withDerivedStatus(assignment);
}

// (Timetable Management) A narrow-interface getter, returning null on a miss
// or cross-school id rather than throwing — the same "never throw, let the
// caller convert a miss into its own validation error" contract every other
// narrow-interface getter in this project already uses (e.g. Teacher
// Management's own getTeacherById, added for this same feature's own first
// consumption). Added for Timetable Management's own assertAssignmentSchedulable,
// which needs to render an invalid teacherSubjectAssignmentId as a 422
// ValidationError, not a raw 404 from a throwing lookup.
async function getAssignmentById(schoolId, id) {
  const assignment = await repository.findById(id);
  if (!assignment || assignment.schoolId !== schoolId) {
    return null;
  }
  return withDerivedStatus(assignment);
}

// (Weekly Subject Allocation) A new, additive narrow-interface function —
// a genuine new cross-feature dependency in the *other* direction from
// this feature's own planned future consumption of Weekly Subject
// Allocation's data. Returns distinct Teacher ids currently teaching
// subjectId in any of the given Classes, for one Academic Year — Weekly
// Subject Allocation resolves each id to a display name itself, via
// Teacher Management's own getTeacherById, never reading Teacher rows
// directly.
async function getActiveTeacherIdsForSubjectAcrossClasses(schoolId, subjectId, classIds, academicYearId) {
  if (!classIds || classIds.length === 0) {
    return [];
  }
  const assignments = await repository.listActiveAssignmentsForSubjectAndClasses(
    schoolId,
    subjectId,
    classIds,
    academicYearId
  );
  return [...new Set(assignments.map((a) => a.teacherId))];
}

// (Timetable Management — generation pre-flight, Product Owner-approved
// Hard Constraint) A plain read-only getter, reusable outside generation —
// deliberately not itself a blocking gate here (see its own callers'
// comments for why enforcement belongs at generation time, not at this
// feature's own write paths: a Teacher's total commitment can go invalid
// purely from a Weekly Subject Allocation edit, with no Teacher Subject
// Assignment write happening at all, so no write-time check here could
// ever be reliable on its own).
//
// committed — the sum of weeklyPeriods (via Weekly Subject Allocation's own
// getWeeklyPeriodsForAssignment) across every one of this Teacher's Active
// Assignments for the given Academic Year.
//
// capacity — Working Days x Teaching Periods, summed across every distinct
// Shift referenced by those same Assignments' own Classes (Shifts never
// overlap in time within a school, per School Schedule Management's own
// Business Rules, so this sum is always valid, never double-counted).
// Deliberately NOT reduced by the Teacher's own unavailableSlots (their
// part-time/before-or-after-break pattern, which lives in Timetable
// Management's own TeacherSchedulePreference) — that finer-grained
// exclusion is already correctly handled by generation's own existing
// per-slot Hard Constraint at actual placement time. This function only
// catches the unambiguous case: committed periods exceeding the full week,
// regardless of any one Teacher's own specific availability pattern.
async function getTeacherWeeklyCommitmentAndCapacity(schoolId, teacherId, academicYearId) {
  // Lazy require — weekly-subject-allocations.service.js itself requires
  // this module (for getActiveTeacherIdsForSubjectAcrossClasses above), so
  // a top-level require here would create a genuine load-time cycle.
  const weeklySubjectAllocationsService = require('../weekly-subject-allocations/weekly-subject-allocations.service');

  const { assignments } = await listAssignments(schoolId, { teacherId, academicYearId, pageSize: 1000 });
  const activeAssignments = assignments.filter((a) => a.status === 'ACTIVE');

  let committed = 0;
  const shiftIds = new Set();
  for (const assignment of activeAssignments) {
    const line = await weeklySubjectAllocationsService.getWeeklyPeriodsForAssignment(
      schoolId,
      assignment.classId,
      academicYearId,
      assignment.subjectId
    );
    if (line) committed += line.weeklyPeriods;

    const cls = await classesService.getClassById(assignment.classId);
    if (cls) shiftIds.add(cls.shiftId);
  }

  const workingDays = await schoolScheduleService.getWorkingDays(schoolId);
  let capacity = 0;
  for (const shiftId of shiftIds) {
    const periods = await schoolScheduleService.getShiftPeriods(schoolId, shiftId, { status: 'ACTIVE' });
    capacity += workingDays.length * periods.filter((p) => p.type === 'TEACHING').length;
  }

  return { committed, capacity };
}

// --- Correction / Ending (Business Rules #11, #24) ---------------------------
// PATCH's partial-update semantics: a field absent from the body is left
// unchanged; a field explicitly present with value null is treated as an
// attempt to clear it — this distinction is what makes Business Rule #24's
// "cannot un-end" check well-defined. teacher-subject-assignments.validation.js
// already rejects any field other than effectiveStartDate/effectiveEndDate/
// endReason before this is ever reached (Guard by Construction).
async function correctAssignment(schoolId, id, body, actingUser) {
  const assignment = await getAssignmentOrThrow(schoolId, id);

  const data = {};
  const wasActive = assignment.effectiveEndDate === null;
  let isEndingNow = false;

  if (Object.prototype.hasOwnProperty.call(body, 'effectiveStartDate')) {
    data.effectiveStartDate = new Date(body.effectiveStartDate);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'effectiveEndDate')) {
    if (body.effectiveEndDate === null) {
      if (!wasActive) {
        throw new ConflictError('Cannot clear an already-set effectiveEndDate — ending an assignment is one-way');
      }
      // Explicitly present but null on an Active assignment is simply "no
      // change" (it was already unset) — never reached as an error case,
      // and never treated as ending, since nothing is actually changing.
    } else {
      data.effectiveEndDate = new Date(body.effectiveEndDate);
      isEndingNow = wasActive;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'endReason')) {
    data.endReason = body.endReason;
  }

  const updated = await repository.update(id, data);

  // Setting a previously-unset effectiveEndDate for the first time IS ending
  // the assignment; any other change is a correction — per the Technical
  // Design's API Design section, both share this one endpoint and audit
  // action set.
  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: isEndingNow ? 'TEACHER_SUBJECT_ASSIGNMENT_ENDED' : 'TEACHER_SUBJECT_ASSIGNMENT_CORRECTED',
    metadata: { assignmentId: id },
  });

  return withDerivedStatus(updated);
}

// --- Replace Teacher (Business Rule #9) ---------------------------------------
// Ends the existing assignment and creates a new one through the exact same
// internal creation path createAssignment itself uses — Technical Design
// Review's own finding: archiving only prevents a Class/Section/Academic
// Year/Subject from being selected for a new assignment *or replacement*
// afterward (Business Rule #18), so the replacement row must clear every
// eligibility gate a direct creation would, not merely re-check the new
// Teacher. By the time the replacement's own assertNoActiveDuplicate runs,
// the old row is already Ended within this same transaction, so no
// artificial "exclude this id" parameter is needed.
async function replaceTeacher(schoolId, id, { newTeacherId, effectiveEndDate, endReason }, actingUser) {
  const result = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);

    const existing = await repository.findById(id, tx);
    if (!existing || existing.schoolId !== schoolId) {
      throw new NotFoundError('Teacher Subject Assignment not found');
    }
    if (existing.effectiveEndDate !== null) {
      throw new ConflictError('Only an Active assignment may be replaced');
    }

    const endedAt = effectiveEndDate ? new Date(effectiveEndDate) : new Date();
    const ended = await repository.update(id, { effectiveEndDate: endedAt, endReason: endReason || null }, tx);

    const replacement = await runCreateAssignment(tx, schoolId, {
      teacherId: newTeacherId,
      subjectId: existing.subjectId,
      classId: existing.classId,
      sectionId: existing.sectionId,
      academicYearId: existing.academicYearId,
      effectiveStartDate: endedAt,
      effectiveEndDate: null,
      reason: null,
    });

    return { ended, replacement };
  });

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'TEACHER_SUBJECT_ASSIGNMENT_TEACHER_REPLACED',
    metadata: {
      endedAssignmentId: result.ended.id,
      previousTeacherId: result.ended.teacherId,
      newTeacherId,
      replacementAssignmentId: result.replacement.id,
    },
  });

  return withDerivedStatus(result.replacement);
}

// --- Selective copy between Academic Years (Business Rules #12, #13) --------
// Best-effort: each candidate is validated independently using the exact
// same shared creation path; one candidate's failure never aborts another's
// attempt, and each candidate's own creation is its own complete
// transaction, so no partial/corrupted row is ever left behind.
async function copyAssignments(schoolId, { fromAcademicYearId, toAcademicYearId, assignmentIds }, actingUser) {
  const copied = [];
  const skipped = [];

  // Resolved once per operation, not per candidate — every candidate copies
  // into the same target Academic Year's own startDate (Technical Design's
  // Backend Design mechanism choice: a source assignment's own dates belong
  // to a different Academic Year and are never directly reusable). If the
  // target itself turns out to be invalid, runCreateAssignment's own
  // assertAcademicYearAssignable rejects every candidate individually below
  // — this fetch is purely for the default start date, not a duplicate
  // validation of its own.
  const targetAcademicYear = await academicYearsService.getAcademicYearById(schoolId, toAcademicYearId);
  const targetStartDate = targetAcademicYear ? targetAcademicYear.startDate : null;

  for (const assignmentId of assignmentIds) {
    try {
      const source = await repository.findById(assignmentId);
      if (!source || source.schoolId !== schoolId || source.academicYearId !== fromAcademicYearId) {
        throw new NotFoundError('Source Teacher Subject Assignment not found');
      }

      const candidate = await prisma.$transaction(async (tx) => {
        await repository.acquireSchoolLock(schoolId, tx);
        return runCreateAssignment(tx, schoolId, {
          teacherId: source.teacherId,
          subjectId: source.subjectId,
          classId: source.classId,
          sectionId: source.sectionId,
          academicYearId: toAcademicYearId,
          effectiveStartDate: targetStartDate,
          effectiveEndDate: null,
          reason: null,
        });
      });

      copied.push(withDerivedStatus(candidate));
    } catch (err) {
      skipped.push({ assignmentId, reason: err.message });
    }
  }

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'TEACHER_SUBJECT_ASSIGNMENTS_COPIED',
    metadata: {
      fromAcademicYearId,
      toAcademicYearId,
      copiedAssignmentIds: copied.map((a) => a.id),
      skipped,
    },
  });

  return { copied, skipped };
}

// --- Grouped presentation (UI Redesign — Teacher -> Subject -> Classes) ------
// This feature's own responsibility is only "which Teacher teaches which
// Subject to which Classes" — no new business logic, no new validation, no
// new stored data. A pure read-side transform over the exact same Active
// rows listAssignments already returns, grouped for the UI Redesign's own
// requested presentation, since the underlying data model already supports
// this grouping without any schema change. Weekly lesson targets, workload,
// or any other Timetable-Management-only concern is deliberately never
// touched or resolved here, per this feature's own narrowed scope.
async function getAssignmentsGroupedByTeacher(schoolId, { academicYearId } = {}) {
  let resolvedAcademicYearId = academicYearId;
  if (!resolvedAcademicYearId) {
    const current = await academicYearsService.getCurrentAcademicYear(schoolId);
    resolvedAcademicYearId = current ? current.id : null;
  }
  if (!resolvedAcademicYearId) {
    return [];
  }

  const { assignments } = await repository.listBySchool({
    schoolId,
    academicYearId: resolvedAcademicYearId,
    page: 1,
    // A whole-school grouped view has no meaningful "page" of its own — the
    // grouping itself is the pagination unit (by Teacher), not the flat row
    // count. A large, fixed pageSize is a pragmatic bound consistent with
    // this project's own "small, bounded lists" reasoning elsewhere,
    // without introducing a second pagination scheme for one read.
    pageSize: 5000,
  });
  const active = assignments.filter((a) => a.effectiveEndDate === null);

  const teacherIds = [...new Set(active.map((a) => a.teacherId))];
  const classIds = [...new Set(active.map((a) => a.classId))];
  const subjectIds = [...new Set(active.map((a) => a.subjectId))];

  const [teacherRows, classRows, subjectRows] = await Promise.all([
    Promise.all(teacherIds.map((id) => teachersService.getTeacherById(schoolId, id))),
    Promise.all(classIds.map((id) => classesService.getClassById(id))),
    Promise.all(subjectIds.map((id) => subjectsService.getSubjectById(id))),
  ]);
  const teacherNameById = new Map(teacherIds.map((id, i) => [id, teacherRows[i] ? teacherRows[i].fullName : id]));
  const classNameById = new Map(classIds.map((id, i) => [id, classRows[i] ? classRows[i].name : id]));
  const subjectNameById = new Map(subjectIds.map((id, i) => [id, subjectRows[i] ? subjectRows[i].name : id]));

  // teacherId -> subjectId -> { subjectId, subjectName, classes: [] }
  const byTeacher = new Map();
  for (const assignment of active) {
    if (!byTeacher.has(assignment.teacherId)) {
      byTeacher.set(assignment.teacherId, {
        teacherId: assignment.teacherId,
        teacherName: teacherNameById.get(assignment.teacherId),
        subjectsById: new Map(),
      });
    }
    const teacherEntry = byTeacher.get(assignment.teacherId);
    if (!teacherEntry.subjectsById.has(assignment.subjectId)) {
      teacherEntry.subjectsById.set(assignment.subjectId, {
        subjectId: assignment.subjectId,
        subjectName: subjectNameById.get(assignment.subjectId),
        classes: [],
      });
    }
    teacherEntry.subjectsById.get(assignment.subjectId).classes.push({
      assignmentId: assignment.id,
      classId: assignment.classId,
      className: classNameById.get(assignment.classId),
      sectionId: assignment.sectionId,
    });
  }

  return [...byTeacher.values()]
    .map((entry) => ({
      teacherId: entry.teacherId,
      teacherName: entry.teacherName,
      subjects: [...entry.subjectsById.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
    }))
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName));
}

// --- Teacher self-service (Business Rule #18) --------------------------------
// Resolved strictly from the authenticated Teacher's own token, never a
// client-supplied teacherId, per Security-Standards.md — the same IDOR
// protection GET /students/me and GET /teachers/me already use.
async function getOwnAssignments(accountId, { academicYearId } = {}) {
  const teacher = await teachersService.getOwnProfile(accountId);
  const assignments = await repository.listByTeacher(teacher.id, { academicYearId });
  return assignments.map(withDerivedStatus);
}

module.exports = {
  createAssignment,
  listAssignments,
  getAssignmentDetail,
  correctAssignment,
  replaceTeacher,
  copyAssignments,
  getOwnAssignments,
  registerDownstreamRecordCheck,
  getAssignmentById,
  getAssignmentsGroupedByTeacher,
  getActiveTeacherIdsForSubjectAcrossClasses,
  getTeacherWeeklyCommitmentAndCapacity,
};
