const prisma = require('../../config/database');
const repository = require('./timetable.repository');
const { ConflictError, NotFoundError, ValidationError } = require('../../shared/errors');
const { recordAuditEvent } = require('../../shared/audit');

// Cross-feature calls through single, narrow, public interfaces only, per
// Decision-Making-Principles' Feature Ownership / Loose Coupling and the
// Technical Design's Architecture section. This module never queries Teacher
// Subject Assignment's, School Schedule Management's, Class Management's,
// Teacher Management's, or Academic Year Management's tables directly.
const teacherSubjectAssignmentsService = require('../teacher-subject-assignments/teacher-subject-assignments.service');
const schoolScheduleService = require('../school-schedule/school-schedule.service');
const classesService = require('../classes/classes.service');
const teachersService = require('../teachers/teachers.service');
const subjectsService = require('../subjects/subjects.service');
const academicYearsService = require('../academic-years/academic-years.service');
const weeklySubjectAllocationsService = require('../weekly-subject-allocations/weekly-subject-allocations.service');

const ALL_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// --- (ACR-006) Downstream-record-check registration --------------------------
// Registered at this module's own load time — app.js requires every feature
// module before the server starts listening, the same require-order
// guarantee every other consumer of this registry already relies on. Closes
// Teacher Subject Assignment's own previously-unused extension point.
teacherSubjectAssignmentsService.registerDownstreamRecordCheck(
  'timetable',
  async (schoolId, academicYearId, classId, subjectId) => {
    const published = await repository.findPublishedVersion(schoolId, academicYearId);
    const draft = await repository.findDraftVersion(schoolId, academicYearId);
    const versionIds = [published, draft].filter(Boolean).map((v) => v.id);
    for (const versionId of versionIds) {
      const lessons = await repository.listLessonsByClassAndVersion(classId, versionId);
      // subjectId isn't stored on Lesson directly (Business Rule #15, v2.0
      // numbering) — the check only needs to know whether *any* Lesson for
      // this Class in this Version exists at all, since every such Lesson
      // necessarily references some Teacher Subject Assignment for that
      // Class/Year.
      if (lessons.length > 0) {
        return 'an active Lesson references a Teacher Subject Assignment for this Class';
      }
    }
    return null;
  }
);

// --- Timetable Version resolution (Architecture Update — Generation-First) ---

async function resolveAcademicYearId(schoolId, explicitAcademicYearId) {
  if (explicitAcademicYearId) return explicitAcademicYearId;
  const current = await academicYearsService.getCurrentAcademicYear(schoolId);
  if (!current) {
    throw new ValidationError('No Academic Year', {
      academicYearId: 'This school has no current Academic Year configured yet.',
    });
  }
  return current.id;
}

// The single choke point every Lesson write (manual or generated) calls
// first — auto-creates a Draft the first time anything is written for a
// school + Academic Year, the same "auto-create a sensible default on first
// need" pattern this project has used repeatedly (Default Shift, Default
// Calendar, default Optimization Settings), applied here lazily rather than
// eagerly since a Draft's own existence is meaningless before there is
// anything to draft.
async function getOrCreateDraftVersion(schoolId, academicYearId, tx) {
  const existing = await repository.findDraftVersion(schoolId, academicYearId, tx);
  if (existing) return existing;
  return repository.createVersion({ schoolId, academicYearId, status: 'DRAFT' }, tx);
}

// Shared by every view-assembly function below — versionType: 'DRAFT'
// (School Admin's own review/adjust context) or 'PUBLISHED' (Teacher/
// Student/oversight context). Returns null on a miss (no Draft/Published
// version yet exists) rather than throwing — every view function below
// already treats "no Lessons yet" as a valid, empty state.
async function resolveVersionForRead(schoolId, academicYearId, versionType) {
  return versionType === 'PUBLISHED'
    ? repository.findPublishedVersion(schoolId, academicYearId)
    : repository.findDraftVersion(schoolId, academicYearId);
}

// --- Shared internal helpers ---------------------------------------------------

async function getLessonOrThrow(schoolId, lessonId, tx = prisma) {
  const lesson = await repository.findLessonById(lessonId, tx);
  if (!lesson || lesson.schoolId !== schoolId) {
    throw new NotFoundError('Lesson not found');
  }
  return lesson;
}

// Architecture Update — Hard Constraint (Business Rule #12, v2.0 numbering):
// a Locked Lesson (or every Lesson in a Locked Group) can never be moved,
// swapped, deleted, or restored. Checked first, before any other
// data-dependent validation, in every mutating path below.
function assertNotLocked(lesson) {
  if (lesson.locked) {
    throw new ConflictError('This Lesson is Locked — unlock it first before making this change');
  }
}

// Business Rules #3, #8 (v2.0 numbering): the Assignment must be Active, and
// — when Weekly Subject Allocation has a current allocation line for its
// own Class/Subject/Academic-Year combination — must have room for one more
// Active Lesson within this Timetable Version (excluding the Lesson being
// edited, if any). Replaces this feature's prior reliance on
// TeacherSubjectAssignment.weeklyLessonTarget (ACR-006, now removed) — a
// missing allocation line means no weekly target is known at all, the same
// "no target set" reading the removed field's own null/unset case used to
// have, so no capacity check runs in that case either.
async function assertAssignmentSchedulable(schoolId, teacherSubjectAssignmentId, timetableVersionId, excludeLessonId) {
  if (!teacherSubjectAssignmentId) {
    throw new ValidationError('A Teacher Subject Assignment is required', {
      teacherSubjectAssignmentId: 'Required.',
    });
  }
  const assignment = await teacherSubjectAssignmentsService.getAssignmentById(schoolId, teacherSubjectAssignmentId);
  if (!assignment) {
    throw new ValidationError('Invalid Teacher Subject Assignment', {
      teacherSubjectAssignmentId: 'This Teacher Subject Assignment does not exist for your school.',
    });
  }
  if (assignment.status !== 'ACTIVE') {
    throw new ValidationError('Invalid Teacher Subject Assignment', {
      teacherSubjectAssignmentId: 'Only an Active Teacher Subject Assignment may have a new Lesson scheduled against it.',
    });
  }
  const allocationLine = await weeklySubjectAllocationsService.getWeeklyPeriodsForAssignment(
    schoolId,
    assignment.classId,
    assignment.academicYearId,
    assignment.subjectId
  );
  if (allocationLine) {
    const currentCount = await repository.countActiveByAssignment(teacherSubjectAssignmentId, timetableVersionId, excludeLessonId);
    if (currentCount >= allocationLine.weeklyPeriods) {
      throw new ConflictError(
        `This Teacher Subject Assignment already has ${allocationLine.weeklyPeriods} Lesson(s) scheduled — its own weekly target from Weekly Subject Allocation`
      );
    }
  }
  return assignment;
}

// Business Rules #4, #5 (v2.0 numbering): the Period must exist, be Active,
// be a Teaching Period (never a Break — Break Period protection), and
// belong to the same Shift as the Assignment's own Class (Shift compatibility).
async function assertPeriodSchedulable(schoolId, periodId, classId) {
  if (!periodId) {
    throw new ValidationError('A Period is required', { periodId: 'Required.' });
  }
  const period = await schoolScheduleService.getPeriodById(schoolId, periodId);
  if (!period || period.status !== 'ACTIVE') {
    throw new ValidationError('Invalid Period', {
      periodId: 'This Period does not exist, does not belong to your school, or is not Active.',
    });
  }
  if (period.type !== 'TEACHING') {
    throw new ConflictError('A Lesson may never be scheduled into a Break Period');
  }

  const cls = await classesService.getClassById(classId);
  if (cls && cls.shiftId !== period.shiftId) {
    throw new ConflictError("This Period's Shift does not match the Lesson's own Class's assigned Shift");
  }
  return period;
}

// Business Rule #6 (v2.0 numbering) — a Teacher conflict, scoped to one
// Timetable Version.
async function assertNoTeacherConflict(schoolId, { teacherId, timetableVersionId, dayOfWeek, periodId }, excludeLessonId, tx) {
  const conflict = await repository.findActiveByTeacherSlot(
    { teacherId, timetableVersionId, dayOfWeek, periodId, excludeLessonId },
    tx
  );
  if (conflict) {
    throw new ConflictError('This Teacher already has an active Lesson at this Day and Period');
  }
}

// Business Rule #7 (v2.0 numbering) — a Class conflict, scoped to one
// Timetable Version.
async function assertNoClassConflict(schoolId, { classId, timetableVersionId, dayOfWeek, periodId }, excludeLessonId, tx) {
  const conflict = await repository.findActiveByClassSlot(
    { classId, timetableVersionId, dayOfWeek, periodId, excludeLessonId },
    tx
  );
  if (conflict) {
    throw new ConflictError('This Class already has an active Lesson at this Day and Period');
  }
}

// Business Rule #10 (v2.0 numbering) — Hard Constraint: a Teacher's own
// recorded unavailable slots must never be used for a Lesson involving that
// Teacher, distinct from (and never conflated with) their soft avoidPeriods
// preference.
async function assertTeacherAvailable(teacherId, dayOfWeek, periodId) {
  const preference = await repository.findTeacherPreference(teacherId);
  if (!preference || !preference.unavailableSlots) return;
  const slots = Array.isArray(preference.unavailableSlots) ? preference.unavailableSlots : [];
  const isUnavailable = slots.some((slot) => slot && slot.dayOfWeek === dayOfWeek && slot.periodId === periodId);
  if (isUnavailable) {
    throw new ConflictError('This Teacher has recorded themselves as unavailable at this Day and Period');
  }
}

function assertValidDayOfWeek(dayOfWeek) {
  if (!ALL_DAYS.includes(dayOfWeek)) {
    throw new ValidationError('Invalid Day', { dayOfWeek: `Must be one of: ${ALL_DAYS.join(', ')}.` });
  }
}

// The one shared validation pipeline createLesson, updateLesson, and
// reactivateLesson all call — never a hand-rolled partial re-implementation
// of it, per Business Rule #13 (v2.0 numbering) and this project's own
// established "Create/Replace/Copy must share the exact same pipeline"
// precedent. Returns { assignment, timetableVersionId } so callers can reuse
// both without re-deriving either.
async function runLessonValidation(schoolId, { teacherSubjectAssignmentId, dayOfWeek, periodId }, excludeLessonId, tx) {
  assertValidDayOfWeek(dayOfWeek);
  const assignment = await teacherSubjectAssignmentsService.getAssignmentById(schoolId, teacherSubjectAssignmentId);
  if (!assignment) {
    throw new ValidationError('Invalid Teacher Subject Assignment', {
      teacherSubjectAssignmentId: 'This Teacher Subject Assignment does not exist for your school.',
    });
  }
  const draftVersion = await getOrCreateDraftVersion(schoolId, assignment.academicYearId, tx);

  await assertAssignmentSchedulable(schoolId, teacherSubjectAssignmentId, draftVersion.id, excludeLessonId);
  await assertPeriodSchedulable(schoolId, periodId, assignment.classId);
  await assertTeacherAvailable(assignment.teacherId, dayOfWeek, periodId);
  await assertNoTeacherConflict(
    schoolId,
    { teacherId: assignment.teacherId, timetableVersionId: draftVersion.id, dayOfWeek, periodId },
    excludeLessonId,
    tx
  );
  await assertNoClassConflict(
    schoolId,
    { classId: assignment.classId, timetableVersionId: draftVersion.id, dayOfWeek, periodId },
    excludeLessonId,
    tx
  );
  return { assignment, timetableVersionId: draftVersion.id };
}

// --- Lesson: Create / Move-Swap / Cancel / Restore -----------------------------

async function createLesson(schoolId, { teacherSubjectAssignmentId, dayOfWeek, periodId }, actingUser) {
  const lesson = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    const { assignment, timetableVersionId } = await runLessonValidation(
      schoolId,
      { teacherSubjectAssignmentId, dayOfWeek, periodId },
      null,
      tx
    );

    return repository.createLesson(
      {
        schoolId,
        academicYearId: assignment.academicYearId,
        timetableVersionId,
        classId: assignment.classId,
        teacherId: assignment.teacherId,
        teacherSubjectAssignmentId,
        dayOfWeek,
        periodId,
        status: 'ACTIVE',
      },
      tx
    );
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'LESSON_CREATED', metadata: { lessonId: lesson.id } });
  return lesson;
}

// Move and/or swap share this one action — the full pipeline re-runs exactly
// as a fresh creation would (Business Rule #13, v2.0 numbering), excluding
// the Lesson's own prior slot from the conflict checks it would otherwise
// trip against itself. Rejected outright if the target Lesson (or its
// Group) is Locked.
async function updateLesson(schoolId, lessonId, { teacherSubjectAssignmentId, dayOfWeek, periodId }, actingUser) {
  const lesson = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    const target = await getLessonOrThrow(schoolId, lessonId, tx);
    assertNotLocked(target);

    if (target.lessonGroupId) {
      // Grouped Lessons move as a unit — delegate to the group-aware path,
      // which itself re-validates each member's own new slot.
      return moveLessonGroup(schoolId, target.lessonGroupId, { teacherSubjectAssignmentId, dayOfWeek, periodId }, tx);
    }

    const { assignment, timetableVersionId } = await runLessonValidation(
      schoolId,
      { teacherSubjectAssignmentId, dayOfWeek, periodId },
      lessonId,
      tx
    );

    return repository.updateLesson(
      lessonId,
      {
        academicYearId: assignment.academicYearId,
        timetableVersionId,
        classId: assignment.classId,
        teacherId: assignment.teacherId,
        teacherSubjectAssignmentId,
        dayOfWeek,
        periodId,
      },
      tx
    );
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'LESSON_UPDATED', metadata: { lessonId } });
  return lesson;
}

async function archiveLesson(schoolId, lessonId, actingUser) {
  const lesson = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    const target = await getLessonOrThrow(schoolId, lessonId, tx);
    assertNotLocked(target);

    if (target.status === 'ARCHIVED') {
      return target;
    }

    return repository.updateLesson(lessonId, { status: 'ARCHIVED' }, tx);
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'LESSON_ARCHIVED', metadata: { lessonId } });
  return lesson;
}

// Business Rule #13 (v2.0 numbering): an archived Lesson cannot assume its
// own old slot is still free — re-runs the entire validation pipeline
// against the Timetable's current state before restoring, scoped to the
// Lesson's own already-assigned Timetable Version (an existing Lesson never
// moves between Versions on its own).
async function reactivateLesson(schoolId, lessonId, actingUser) {
  const lesson = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    const target = await getLessonOrThrow(schoolId, lessonId, tx);
    assertNotLocked(target);

    if (target.status === 'ACTIVE') {
      return target;
    }

    const assignment = await teacherSubjectAssignmentsService.getAssignmentById(schoolId, target.teacherSubjectAssignmentId);
    if (!assignment) {
      throw new ValidationError('Invalid Teacher Subject Assignment', {
        teacherSubjectAssignmentId: 'This Teacher Subject Assignment no longer exists.',
      });
    }
    await assertAssignmentSchedulable(schoolId, target.teacherSubjectAssignmentId, target.timetableVersionId, lessonId);
    await assertPeriodSchedulable(schoolId, target.periodId, assignment.classId);
    await assertTeacherAvailable(assignment.teacherId, target.dayOfWeek, target.periodId);
    await assertNoTeacherConflict(
      schoolId,
      { teacherId: assignment.teacherId, timetableVersionId: target.timetableVersionId, dayOfWeek: target.dayOfWeek, periodId: target.periodId },
      lessonId,
      tx
    );
    await assertNoClassConflict(
      schoolId,
      { classId: assignment.classId, timetableVersionId: target.timetableVersionId, dayOfWeek: target.dayOfWeek, periodId: target.periodId },
      lessonId,
      tx
    );

    return repository.updateLesson(lessonId, { status: 'ACTIVE' }, tx);
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'LESSON_REACTIVATED', metadata: { lessonId } });
  return lesson;
}

// --- Locking (Architecture Update) ---------------------------------------------
// Guard by Construction: locked is set only through these two dedicated
// actions, never a side effect of any other write. Group-aware — locking or
// unlocking any member of a Lesson Group applies to the whole group.

async function lockLesson(schoolId, lessonId, actingUser) {
  const lesson = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    const target = await getLessonOrThrow(schoolId, lessonId, tx);

    if (target.lessonGroupId) {
      const group = await repository.findLessonGroupById(target.lessonGroupId, tx);
      for (const member of group.lessons) {
        await repository.updateLesson(member.id, { locked: true }, tx);
      }
      return repository.findLessonById(lessonId, tx);
    }

    return repository.updateLesson(lessonId, { locked: true }, tx);
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'LESSON_LOCKED', metadata: { lessonId } });
  return lesson;
}

async function unlockLesson(schoolId, lessonId, actingUser) {
  const lesson = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    const target = await getLessonOrThrow(schoolId, lessonId, tx);

    if (target.lessonGroupId) {
      const group = await repository.findLessonGroupById(target.lessonGroupId, tx);
      for (const member of group.lessons) {
        await repository.updateLesson(member.id, { locked: false }, tx);
      }
      return repository.findLessonById(lessonId, tx);
    }

    return repository.updateLesson(lessonId, { locked: false }, tx);
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'LESSON_UNLOCKED', metadata: { lessonId } });
  return lesson;
}

// --- Lesson Groups / double periods (Architecture Update) ---------------------

async function getLessonGroupOrThrow(schoolId, groupId, tx = prisma) {
  const group = await repository.findLessonGroupById(groupId, tx);
  if (!group || group.schoolId !== schoolId) {
    throw new NotFoundError('Lesson Group not found');
  }
  return group;
}

// Moves both members of a Group together — each member keeps its own
// sequenceInGroup's relative Period offset is not automatically preserved;
// this is Move/Swap applied identically to both Lessons in the group, per
// Business Rule #12 (v2.0 numbering, "Moving...applies to the whole group").
// Internal helper, always called from inside updateLesson's own transaction.
async function moveLessonGroup(schoolId, groupId, { teacherSubjectAssignmentId, dayOfWeek, periodId }, tx) {
  const group = await getLessonGroupOrThrow(schoolId, groupId, tx);
  let lastResult = null;
  for (const member of group.lessons) {
    const { assignment, timetableVersionId } = await runLessonValidation(
      schoolId,
      { teacherSubjectAssignmentId, dayOfWeek, periodId },
      member.id,
      tx
    );
    lastResult = await repository.updateLesson(
      member.id,
      {
        academicYearId: assignment.academicYearId,
        timetableVersionId,
        classId: assignment.classId,
        teacherId: assignment.teacherId,
        teacherSubjectAssignmentId,
        dayOfWeek,
        periodId,
      },
      tx
    );
  }
  return lastResult;
}

// Business Rule #25 (v2.0 numbering): a deliberate, confirmed, audited
// override — converts both member Lessons into ordinary independent
// Lessons, preserving all of their existing data. No Hard Constraint
// re-validation is needed: splitting changes no Lesson's own Day/Period/
// Teacher/Class, only removes the grouping link.
async function splitLessonGroup(schoolId, groupId, actingUser) {
  await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    const group = await getLessonGroupOrThrow(schoolId, groupId, tx);

    for (const member of group.lessons) {
      await repository.updateLesson(member.id, { lessonGroupId: null, sequenceInGroup: null }, tx);
    }
    await repository.deleteLessonGroup(groupId, tx);
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'LESSON_GROUP_SPLIT', metadata: { groupId } });
}

// --- Publish (Architecture Update) ---------------------------------------------
// Business Rule #26 (v2.0 numbering): a deliberate, explicit, audited
// transition — Archive-then-Promote, the same shape designateDefaultShift's
// own unset-then-set pattern uses one layer up, adapted to a three-state
// status with no "unset" analogue. The Draft that is promoted no longer
// exists as a Draft afterward — the next write auto-creates a fresh, empty
// one (see Technical Design's own Risks section for why this is a
// deliberate, literal reading, not an oversight).
async function publishTimetableVersion(schoolId, explicitAcademicYearId, actingUser) {
  const academicYearId = await resolveAcademicYearId(schoolId, explicitAcademicYearId);

  const published = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    const draft = await repository.findDraftVersion(schoolId, academicYearId, tx);
    if (!draft) {
      throw new ConflictError('There is no Draft Timetable to publish for this Academic Year');
    }

    const currentPublished = await repository.findPublishedVersion(schoolId, academicYearId, tx);
    if (currentPublished) {
      await repository.updateVersion(currentPublished.id, { status: 'ARCHIVED' }, tx);
    }

    return repository.updateVersion(draft.id, { status: 'PUBLISHED', publishedAt: new Date() }, tx);
  });

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'TIMETABLE_PUBLISHED',
    metadata: { academicYearId, timetableVersionId: published.id },
  });
  return published;
}

// --- View assembly (Master / Class / Teacher Timetable) ------------------------
// Each function resolves display-only Teacher/Subject/Class/Period names
// through the owning features' own narrow interfaces — never a direct query
// against another feature's table. Both the JSON view routes and PDF
// generation (timetable.pdf.js) call these same functions — the one place
// the "assemble this view's own rows" logic lives, per Business Rule #27
// (v2.0 numbering). versionType ('DRAFT' | 'PUBLISHED') resolves which
// Timetable Version to read, per Technical Design's own View resolution
// subsection — the controller layer decides which per role, never a
// client-suppliable override for Teacher/Student/oversight contexts.

async function enrichLesson(lesson) {
  const [assignment, period] = await Promise.all([
    teacherSubjectAssignmentsService.getAssignmentById(lesson.schoolId, lesson.teacherSubjectAssignmentId),
    schoolScheduleService.getPeriodById(lesson.schoolId, lesson.periodId),
  ]);

  const [teacher, subject, cls] = await Promise.all([
    teachersService.getTeacherById(lesson.schoolId, lesson.teacherId),
    assignment ? subjectsService.getSubjectById(assignment.subjectId) : null,
    classesService.getClassById(lesson.classId),
  ]);

  return {
    id: lesson.id,
    dayOfWeek: lesson.dayOfWeek,
    status: lesson.status,
    locked: lesson.locked,
    lessonGroupId: lesson.lessonGroupId,
    sequenceInGroup: lesson.sequenceInGroup,
    period: period ? { id: period.id, name: period.name, startTime: period.startTime, endTime: period.endTime } : null,
    class: cls ? { id: cls.id, name: cls.name } : null,
    teacher: teacher ? { id: teacher.id, fullName: teacher.fullName } : null,
    subject: subject ? { id: subject.id, name: subject.name } : null,
    teacherSubjectAssignmentId: lesson.teacherSubjectAssignmentId,
  };
}

// includeArchived defaults to false for the read-only Class/Teacher views;
// the Master Timetable's own management UI passes true so a cancelled
// Lesson (status ARCHIVED) is still visible, with a Restore action.
async function getMasterTimetable(schoolId, { includeArchived = false, academicYearId, versionType = 'DRAFT' } = {}) {
  const resolvedYearId = await resolveAcademicYearId(schoolId, academicYearId);
  const version = await resolveVersionForRead(schoolId, resolvedYearId, versionType);
  if (!version) return [];

  const lessons = await repository.listLessonsByVersion(version.id, { includeArchived });
  const enriched = await Promise.all(lessons.map(enrichLesson));

  const byClass = new Map();
  for (const lesson of enriched) {
    const key = lesson.class ? lesson.class.id : 'unknown';
    if (!byClass.has(key)) {
      byClass.set(key, { class: lesson.class, lessons: [] });
    }
    byClass.get(key).lessons.push(lesson);
  }

  return Array.from(byClass.values());
}

async function getClassTimetable(schoolId, classId, { includeArchived = false, academicYearId, versionType = 'DRAFT' } = {}) {
  const cls = await classesService.getClassById(classId);
  if (!cls || cls.schoolId !== schoolId) {
    throw new NotFoundError('Class not found');
  }
  const resolvedYearId = await resolveAcademicYearId(schoolId, academicYearId);
  const version = await resolveVersionForRead(schoolId, resolvedYearId, versionType);
  if (!version) return [];

  const lessons = await repository.listLessonsByClassAndVersion(classId, version.id, { includeArchived });
  return Promise.all(lessons.map(enrichLesson));
}

async function getTeacherTimetable(schoolId, teacherId, { includeArchived = false, academicYearId, versionType = 'DRAFT' } = {}) {
  const teacher = await teachersService.getTeacherById(schoolId, teacherId);
  if (!teacher) {
    throw new NotFoundError('Teacher not found');
  }
  const resolvedYearId = await resolveAcademicYearId(schoolId, academicYearId);
  const version = await resolveVersionForRead(schoolId, resolvedYearId, versionType);
  if (!version) return [];

  const lessons = await repository.listLessonsByTeacherAndVersion(teacherId, version.id, { includeArchived });
  return Promise.all(lessons.map(enrichLesson));
}

// --- Preferences and School Optimization Settings ------------------------------
// Pure data used only as the generation engine's own Soft Preference inputs
// (Architecture Update) and getTimetableQualityScore's illustrative
// computation — this module still never enforces them as Hard Validation on
// its own.

async function getTeacherPreference(schoolId, teacherId) {
  const teacher = await teachersService.getTeacherById(schoolId, teacherId);
  if (!teacher) {
    throw new NotFoundError('Teacher not found');
  }
  return repository.findTeacherPreference(teacherId);
}

async function updateTeacherPreference(schoolId, teacherId, data, actingUser) {
  const teacher = await teachersService.getTeacherById(schoolId, teacherId);
  if (!teacher) {
    throw new NotFoundError('Teacher not found');
  }
  const updated = await repository.upsertTeacherPreference(schoolId, teacherId, data);
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'TEACHER_SCHEDULE_PREFERENCE_UPDATED', metadata: { teacherId } });
  return updated;
}

async function getSubjectPreference(schoolId, teacherSubjectAssignmentId) {
  const assignment = await teacherSubjectAssignmentsService.getAssignmentById(schoolId, teacherSubjectAssignmentId);
  if (!assignment) {
    throw new NotFoundError('Teacher Subject Assignment not found');
  }
  return repository.findSubjectPreference(teacherSubjectAssignmentId);
}

async function updateSubjectPreference(schoolId, teacherSubjectAssignmentId, data, actingUser) {
  const assignment = await teacherSubjectAssignmentsService.getAssignmentById(schoolId, teacherSubjectAssignmentId);
  if (!assignment) {
    throw new NotFoundError('Teacher Subject Assignment not found');
  }
  const updated = await repository.upsertSubjectPreference(schoolId, teacherSubjectAssignmentId, data);
  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'SUBJECT_SCHEDULE_PREFERENCE_UPDATED',
    metadata: { teacherSubjectAssignmentId },
  });
  return updated;
}

async function getOptimizationSettings(schoolId) {
  return repository.findOptimizationSettings(schoolId);
}

async function updateOptimizationSettings(schoolId, data, actingUser) {
  const updated = await repository.updateOptimizationSettings(schoolId, data);
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SCHOOL_OPTIMIZATION_SETTINGS_UPDATED' });
  return updated;
}

// --- Bootstrap: called by School & Platform Management's own createSchool ----
async function createDefaultOptimizationSettingsForSchool(schoolId) {
  return repository.createOptimizationSettings(schoolId);
}

// --- Timetable Quality Score (Business Rule #19, v2.0 numbering) --------------
// A read-only, explicitly illustrative computation — never stored, never
// blocks a write. Delegates to timetable.generation.js's own
// computeQualityScore, shared with a completed generation job's own result —
// lazily required here (not at module top level) to avoid a circular
// require, since timetable.generation.js itself requires this module for
// its own conflict-checking/assignment-resolution helpers.
async function getTimetableQualityScore(schoolId, { academicYearId, versionType = 'DRAFT' } = {}) {
  const generation = require('./timetable.generation');
  const resolvedYearId = await resolveAcademicYearId(schoolId, academicYearId);
  const version = await resolveVersionForRead(schoolId, resolvedYearId, versionType);
  if (!version) {
    return generation.emptyQualityScore();
  }
  const lessons = await repository.listLessonsByVersion(version.id, { includeArchived: false });
  return generation.computeQualityScore(schoolId, resolvedYearId, version.id, lessons);
}

// (Teacher weekly capacity Hard Constraint, Business Rule #30 — proactive
// check) Lazily requires timetable.generation.js, same reasoning as
// getTimetableQualityScore just above — avoids the circular require, since
// that module requires this one for its own helpers.
async function getTeacherCapacityReport(schoolId, { academicYearId } = {}) {
  const generation = require('./timetable.generation');
  const resolvedYearId = await resolveAcademicYearId(schoolId, academicYearId);
  return generation.getTeacherCapacityReport(schoolId, resolvedYearId);
}

// --- Stable public service interface for future feature integration -------
// Per this project's established Stable Public Service Interface contract —
// the only functions another feature module may call directly, in-process.
// Architecture Update: both resolve the school's own current PUBLISHED
// Version for the given (or current) Academic Year, per Business Rule #28
// (v2.0 numbering) — a future consumer must never read the Draft.

async function getLessonsForClass(schoolId, classId, { status, academicYearId } = {}) {
  const resolvedYearId = await resolveAcademicYearId(schoolId, academicYearId);
  const version = await resolveVersionForRead(schoolId, resolvedYearId, 'PUBLISHED');
  if (!version) return [];
  const lessons = await repository.listLessonsByClassAndVersion(classId, version.id, { includeArchived: true });
  return status ? lessons.filter((l) => l.status === status) : lessons;
}

async function getLessonsForTeacher(schoolId, teacherId, { status, academicYearId } = {}) {
  const resolvedYearId = await resolveAcademicYearId(schoolId, academicYearId);
  const version = await resolveVersionForRead(schoolId, resolvedYearId, 'PUBLISHED');
  if (!version) return [];
  const lessons = await repository.listLessonsByTeacherAndVersion(teacherId, version.id, { includeArchived: true });
  return status ? lessons.filter((l) => l.status === status) : lessons;
}

async function getLessonById(schoolId, lessonId) {
  const lesson = await repository.findLessonById(lessonId);
  return lesson && lesson.schoolId === schoolId ? lesson : null;
}

async function validateLesson(schoolId, lessonId) {
  const lesson = await repository.findLessonById(lessonId);
  return Boolean(lesson && lesson.schoolId === schoolId && lesson.status === 'ACTIVE');
}

async function countActiveLessonsForAssignment(schoolId, teacherSubjectAssignmentId, timetableVersionId) {
  return repository.countActiveByAssignment(teacherSubjectAssignmentId, timetableVersionId || null, null);
}

module.exports = {
  // Version resolution — exported for timetable.generation.js/timetable.jobs.js
  resolveAcademicYearId,
  getOrCreateDraftVersion,
  resolveVersionForRead,
  // Shared assertion helpers — exported for timetable.generation.js's own
  // per-candidate Hard Constraint filtering, so the engine and every manual
  // write share the identical rule implementations, never a parallel copy.
  assertPeriodSchedulable,
  assertTeacherAvailable,
  // Lesson lifecycle
  createLesson,
  updateLesson,
  archiveLesson,
  reactivateLesson,
  // Locking
  lockLesson,
  unlockLesson,
  // Lesson Groups
  getLessonGroupOrThrow,
  splitLessonGroup,
  // Publish
  publishTimetableVersion,
  // Views
  getMasterTimetable,
  getClassTimetable,
  getTeacherTimetable,
  // Preferences / settings
  getTeacherPreference,
  updateTeacherPreference,
  getSubjectPreference,
  updateSubjectPreference,
  getOptimizationSettings,
  updateOptimizationSettings,
  createDefaultOptimizationSettingsForSchool,
  // Quality Score
  getTimetableQualityScore,
  // Teacher weekly capacity Hard Constraint (Business Rule #30) — proactive check
  getTeacherCapacityReport,
  // Stable Public Service Interface
  getLessonsForClass,
  getLessonsForTeacher,
  getLessonById,
  validateLesson,
  countActiveLessonsForAssignment,
};
