const repository = require('./weekly-subject-allocations.repository');
const { ConflictError, NotFoundError, ValidationError } = require('../../shared/errors');
const { recordAuditEvent } = require('../../shared/audit');

// Cross-feature calls through single, narrow, public interfaces only, per
// Decision-Making-Principles' Feature Ownership / Loose Coupling and the
// Technical Design's Architecture section. This feature never queries
// Class Management's, School Schedule Management's, Subject Management's,
// or Academic Year Management's own tables directly.
const classesService = require('../classes/classes.service');
const schoolScheduleService = require('../school-schedule/school-schedule.service');
const subjectsService = require('../subjects/subjects.service');
const academicYearsService = require('../academic-years/academic-years.service');
// A new, additive cross-feature dependency in the *other* direction from
// this feature's own planned future consumption of Weekly Subject
// Allocation's data — this feature reads Teacher Subject Assignment and
// Teacher Management, read-only, to show which Teachers already teach each
// eligible Subject in a Grade/Form. Approved directly by the Product Owner
// as part of the "auto-populate eligible Subjects and their Teachers" UX
// improvement.
const teacherSubjectAssignmentsService = require('../teacher-subject-assignments/teacher-subject-assignments.service');
const teachersService = require('../teachers/teachers.service');

// A Grade/Form with zero member Classes has no Shift to derive an
// available-periods figure from — a genuinely reachable state (a
// newly-created, empty GradeLevel; or an already-allocated one that later
// lost every member Class). Thrown by calculateAvailablePeriods and
// handled differently by its two call sites: create/correct surface it as
// a clear 422, while isAllocationCurrent (Technical Design Review's own
// second finding) catches it and reports an unconditional Needs-Review
// state instead of letting it crash the caller.
class NoGradeLevelShiftError extends Error {}

// The one shared helper every other piece of this design calls, never
// re-implemented — Business Rules #3-#5. Never stored as a live,
// continuously-synced value; recomputed fresh every time it is needed.
async function calculateAvailablePeriods(schoolId, gradeLevelId) {
  const shiftId = await classesService.getGradeLevelShift(schoolId, gradeLevelId);
  if (!shiftId) {
    throw new NoGradeLevelShiftError('This Grade/Form has no Classes yet, so no Shift can be derived for it');
  }
  const workingDays = await schoolScheduleService.getWorkingDays(schoolId);
  const teachingPeriods = await schoolScheduleService.getShiftPeriods(schoolId, shiftId, { status: 'ACTIVE' });
  const teachingPeriodCount = teachingPeriods.filter((p) => p.type === 'TEACHING').length;
  return workingDays.length * teachingPeriodCount;
}

// The single comparison every read path and the generation pre-check both
// call, per Architecture's "derived, never stored" decision. Returns the
// freshly-computed figure alongside the boolean, so callers needing to
// *display* the current figure never call calculateAvailablePeriods twice.
async function isAllocationCurrent(allocation) {
  try {
    const availablePeriodsNow = await calculateAvailablePeriods(allocation.schoolId, allocation.gradeLevelId);
    return { current: availablePeriodsNow === allocation.availablePeriodsAtSave, availablePeriodsNow };
  } catch (error) {
    if (error instanceof NoGradeLevelShiftError) {
      return { current: false, availablePeriodsNow: null };
    }
    throw error;
  }
}

// Business Rules #6-#8, #10: the proposed line-item set must sum exactly to
// the calculated available figure, contain no duplicate Subject, and every
// weeklyPeriods value must be a positive whole number.
function assertAllocationComplete(subjects, availablePeriods) {
  const errors = {};

  const subjectIds = subjects.map((s) => s.subjectId);
  const hasDuplicate = new Set(subjectIds).size !== subjectIds.length;
  if (hasDuplicate) {
    errors.subjects = 'A Subject may appear at most once within a single allocation.';
  }

  const hasInvalidPeriods = subjects.some((s) => !Number.isInteger(s.weeklyPeriods) || s.weeklyPeriods <= 0);
  if (hasInvalidPeriods) {
    errors.weeklyPeriods = 'Every weekly period value must be a positive whole number.';
  }

  if (!errors.subjects && !errors.weeklyPeriods) {
    const total = subjects.reduce((sum, s) => sum + s.weeklyPeriods, 0);
    if (total !== availablePeriods) {
      errors.total = `The total (${total}) must exactly equal the calculated available weekly teaching periods (${availablePeriods}).`;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Weekly Subject Allocation', errors);
  }
}

// Business Rule #9: each Subject must exist, be Active, and be currently
// assigned to the school.
async function assertSubjectsAssignable(schoolId, subjects) {
  for (const { subjectId } of subjects) {
    const subject = await subjectsService.getSubjectById(subjectId);
    const assigned = await subjectsService.isSubjectAssignedToSchool(schoolId, subjectId);
    if (!subject || subject.status !== 'ACTIVE' || !assigned) {
      throw new ValidationError('Invalid Subject in allocation', {
        subjectId: `Subject ${subjectId} does not exist, is not Active, or is not assigned to your school.`,
      });
    }
  }
}

async function assertGradeLevelValid(schoolId, gradeLevelId) {
  const isValid = await classesService.validateGradeLevel(schoolId, gradeLevelId);
  if (!isValid) {
    throw new ValidationError('Invalid Grade/Form', {
      gradeLevelId: 'This Grade/Form does not exist, does not belong to your school, or is not Active.',
    });
  }
}

async function resolveAcademicYearId(schoolId, academicYearId) {
  let targetAcademicYearId = academicYearId;
  if (!targetAcademicYearId) {
    const current = await academicYearsService.getCurrentAcademicYear(schoolId);
    targetAcademicYearId = current ? current.id : null;
  }
  const year = targetAcademicYearId ? await academicYearsService.getAcademicYearById(schoolId, targetAcademicYearId) : null;
  if (!year || year.status === 'ARCHIVED') {
    throw new ValidationError('Invalid Academic Year', {
      academicYearId: 'This Academic Year does not exist, does not belong to your school, or is Archived.',
    });
  }
  return year.id;
}

async function getAllocationOrThrow(schoolId, allocationId) {
  const allocation = await repository.findById(allocationId);
  if (!allocation || allocation.schoolId !== schoolId) {
    throw new NotFoundError('Weekly Subject Allocation not found');
  }
  return allocation;
}

async function decorateWithCurrency(allocation) {
  const { current, availablePeriodsNow } = await isAllocationCurrent(allocation);
  return { ...allocation, availablePeriodsNow, needsReview: !current };
}

// A School Admin's UX starting point: every Subject assigned to the school
// that matches this Grade/Form's own Education Level (Primary Grade/Forms
// only ever see Primary Subjects, and vice versa — never inferred from the
// Grade/Form's own name), each annotated with the distinct Teachers
// currently teaching it anywhere in this Grade/Form's own Classes (a
// Subject can have different Teachers in different Classes of the same
// Grade/Form, since Teacher Subject Assignment is Class-scoped, not
// Grade/Form-scoped — every distinct Teacher is listed, not just one).
// Read-only, has no effect on any saved allocation — the frontend overlays
// this onto whatever the School Admin already saved (if anything) to build
// its own editable row list.
async function listEligibleSubjectsWithTeachers(schoolId, gradeLevelId, academicYearId) {
  const gradeLevel = await classesService.getGradeLevelById(schoolId, gradeLevelId);
  if (!gradeLevel) {
    return [];
  }

  const schoolSubjects = await subjectsService.listSchoolSubjects(schoolId);
  const eligibleSubjects = schoolSubjects.filter(
    (row) => row.subject.status === 'ACTIVE' && row.subject.educationLevel === gradeLevel.educationLevel
  );

  const classes = await classesService.listActiveClassesByGradeLevel(schoolId, gradeLevelId);
  const classIds = classes.map((cls) => cls.id);

  const teacherNameCache = new Map();
  async function resolveTeacherName(teacherId) {
    if (!teacherNameCache.has(teacherId)) {
      const teacher = await teachersService.getTeacherById(schoolId, teacherId);
      teacherNameCache.set(teacherId, teacher ? teacher.fullName : null);
    }
    return teacherNameCache.get(teacherId);
  }

  const result = [];
  for (const row of eligibleSubjects) {
    const teacherIds = await teacherSubjectAssignmentsService.getActiveTeacherIdsForSubjectAcrossClasses(
      schoolId,
      row.subjectId,
      classIds,
      academicYearId
    );
    const teacherNames = (await Promise.all(teacherIds.map(resolveTeacherName))).filter(Boolean);
    result.push({ subjectId: row.subjectId, subjectName: row.subject.name, teacherNames });
  }
  return result;
}

// A read-only preview of calculateAvailablePeriods for the Web frontend's
// own Create flow — before any allocation exists to derive an
// availablePeriodsNow from via decorateWithCurrency above. Returns null
// (never throws) when the Grade/Form has no member Classes yet, so the
// frontend can render "not available yet" rather than an error.
async function getAvailablePeriodsPreview(schoolId, gradeLevelId) {
  try {
    return await calculateAvailablePeriods(schoolId, gradeLevelId);
  } catch (error) {
    if (error instanceof NoGradeLevelShiftError) {
      return null;
    }
    throw error;
  }
}

async function listAllocations(schoolId, { academicYearId, gradeLevelId } = {}) {
  const allocations = await repository.listBySchool(schoolId, { academicYearId, gradeLevelId });
  return Promise.all(allocations.map(decorateWithCurrency));
}

async function getAllocationDetail(schoolId, allocationId) {
  const allocation = await getAllocationOrThrow(schoolId, allocationId);
  return decorateWithCurrency(allocation);
}

async function createAllocation({ academicYearId, gradeLevelId, subjects }, actingUser) {
  const schoolId = actingUser.schoolId;

  await assertGradeLevelValid(schoolId, gradeLevelId);
  const targetAcademicYearId = await resolveAcademicYearId(schoolId, academicYearId);

  let availablePeriods;
  try {
    availablePeriods = await calculateAvailablePeriods(schoolId, gradeLevelId);
  } catch (error) {
    if (error instanceof NoGradeLevelShiftError) {
      throw new ValidationError('Cannot calculate available periods', { gradeLevelId: error.message });
    }
    throw error;
  }

  assertAllocationComplete(subjects, availablePeriods);
  await assertSubjectsAssignable(schoolId, subjects);

  const existing = await repository.findByNaturalKey(schoolId, targetAcademicYearId, gradeLevelId);
  if (existing) {
    throw new ConflictError('A Weekly Subject Allocation already exists for this Grade/Form and Academic Year');
  }

  const allocation = await repository.createWithSubjects({
    schoolId,
    academicYearId: targetAcademicYearId,
    gradeLevelId,
    availablePeriodsAtSave: availablePeriods,
    subjects,
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'WEEKLY_SUBJECT_ALLOCATION_CREATED' });
  return decorateWithCurrency(allocation);
}

// This single function *is* what resolves a Needs-Review allocation back to
// current, per Business Lifecycle Step 6 — there is no separate
// "acknowledge Needs Review" action; saving a valid, complete allocation
// against today's real figure is the only way out of Needs Review, by
// construction. Always re-runs calculateAvailablePeriods fresh, never the
// stored snapshot.
async function correctAllocation(allocationId, { subjects }, actingUser) {
  const schoolId = actingUser.schoolId;
  const allocation = await getAllocationOrThrow(schoolId, allocationId);

  let availablePeriods;
  try {
    availablePeriods = await calculateAvailablePeriods(schoolId, allocation.gradeLevelId);
  } catch (error) {
    if (error instanceof NoGradeLevelShiftError) {
      throw new ValidationError('Cannot calculate available periods', { gradeLevelId: error.message });
    }
    throw error;
  }

  assertAllocationComplete(subjects, availablePeriods);
  await assertSubjectsAssignable(schoolId, subjects);

  const updated = await repository.replaceSubjects(allocationId, subjects, availablePeriods);

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'WEEKLY_SUBJECT_ALLOCATION_CORRECTED' });
  return decorateWithCurrency(updated);
}

// --- Stable Public Service Interface ----------------------------------------
// Per this project's established pattern — the only functions another
// feature module may call directly, in-process; everything else in this
// module is private. Built now even though Teacher Subject Assignment and
// Timetable Management are not yet wired to call them (their own
// amendments are separate, future work), per this project's established
// Future Integration Readiness precedent.

// Takes classId, never gradeLevelId directly — the real future caller
// (Timetable's generation engine, iterating Teacher Subject Assignment
// rows) only ever has classId on hand at that call site.
async function getWeeklyPeriodsForAssignment(schoolId, classId, academicYearId, subjectId) {
  const cls = await classesService.getClassById(classId);
  if (!cls || cls.schoolId !== schoolId) {
    return null;
  }
  const line = await repository.findLineByGradeLevelYearSubject(schoolId, cls.gradeLevelId, academicYearId, subjectId);
  if (!line) {
    return null;
  }
  return { weeklyPeriods: line.weeklyPeriods, doublePeriodRequired: line.doublePeriodRequired };
}

// true if any WeeklySubjectAllocation for that school + Academic Year
// currently fails isAllocationCurrent; false otherwise (including when zero
// allocations exist yet — an empty set cannot be "in conflict" with itself).
async function isSchoolNeedsReview(schoolId, academicYearId) {
  const allocations = await repository.listBySchoolAndYear(schoolId, academicYearId);
  for (const allocation of allocations) {
    const { current } = await isAllocationCurrent(allocation);
    if (!current) {
      return true;
    }
  }
  return false;
}

async function listAllocationsForGradeLevel(schoolId, gradeLevelId, academicYearId) {
  const allocation = await repository.findByNaturalKey(schoolId, academicYearId, gradeLevelId);
  return allocation ? allocation.subjects : [];
}

// (Technical Design Review finding — WP3) Registers this module's own
// checker against Subject Management's existing dependency-validation
// extension point, at module-load time — this project's app.js
// require-order guarantee, already relied upon by every prior consumer of
// this same registry (mirroring Teacher Subject Assignment's own
// registration exactly). Without this, Subject Management would allow
// archiving a Subject a current allocation line still references.
subjectsService.registerRemovalDependencyCheck('weekly-subject-allocations', async (schoolId, subjectId) => {
  const referencing = await repository.findLineReferencingSubject(schoolId, subjectId);
  return referencing ? 'a current Weekly Subject Allocation references this Subject' : null;
});

module.exports = {
  listAllocations,
  getAllocationDetail,
  getAllocationOrThrow,
  createAllocation,
  correctAllocation,
  getAvailablePeriodsPreview,
  listEligibleSubjectsWithTeachers,
  getWeeklyPeriodsForAssignment,
  isSchoolNeedsReview,
  listAllocationsForGradeLevel,
};
