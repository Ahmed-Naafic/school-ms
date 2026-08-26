const { Prisma } = require('@prisma/client');
const repository = require('./attendance.repository');
const timetableService = require('../timetable/timetable.service');
const schoolScheduleService = require('../school-schedule/school-schedule.service');
const classesService = require('../classes/classes.service');
const studentsService = require('../students/students.service');
const teachersService = require('../teachers/teachers.service');
const authService = require('../auth/auth.service');
const { recordAuditEvent } = require('../../shared/audit');
const { ValidationError, NotFoundError, ConflictError, AuthorizationError } = require('../../shared/errors');

const ALL_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const STUDENT_ROSTER_PAGE_SIZE = 500;

// --- Date/time helpers -----------------------------------------------------
// A Period's own startTime/endTime is a literal wall-clock value with no
// timezone concept anywhere in this codebase (School Schedule Management's
// own convention — see school-schedule.service.js's time helpers). "Now" is
// therefore read in the same single, implicit clock frame every stored
// Period time already assumes (the server clock's own UTC HH:mm), never
// timezone-converted — there is nothing elsewhere in this project to convert
// it against.

function toDateOnly(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function dayOfWeekFor(dateStr) {
  return ALL_DAYS[toDateOnly(dateStr).getUTCDay()];
}

function nowTimeString() {
  return new Date().toISOString().slice(11, 16);
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

// --- Working day / holiday gate (Business Rule #31) ------------------------

async function isSchoolDay(schoolId, dateStr) {
  const dayOfWeek = dayOfWeekFor(dateStr);
  const workingDays = await schoolScheduleService.getWorkingDays(schoolId);
  if (!workingDays.includes(dayOfWeek)) {
    return false;
  }
  const nonWorking = await repository.findNonWorkingDay(schoolId, toDateOnly(dateStr));
  return !nonWorking;
}

async function assertSchoolDay(schoolId, dateStr) {
  if (!(await isSchoolDay(schoolId, dateStr))) {
    throw new ValidationError('Attendance cannot be recorded for a non-working day, holiday, or officially closed day', {
      date: 'Not a school day',
    });
  }
}

// --- Manager checkpoint coverage (Business Rule #9, Technical Design Section G) ---
// Derived from School Schedule Management's own live Period data every time
// — never cached or stored — so a later Period/Shift edit is always
// reflected, per the Technical Design's own reasoning.

async function resolveCheckpointCoverage(schoolId, classId, checkpoint) {
  const cls = await classesService.getClassById(classId);
  if (!cls || cls.schoolId !== schoolId) {
    throw new NotFoundError('Class not found');
  }

  const periods = await schoolScheduleService.getShiftPeriods(schoolId, cls.shiftId, { status: 'ACTIVE' });
  const breakPeriods = periods.filter((p) => p.type === 'BREAK');
  if (breakPeriods.length !== 1) {
    // Assumption Requiring Approval #1 (Business Specification): this
    // computation assumes exactly one BREAK Period per Shift. Reject with a
    // clear configuration error rather than guess, per Technical Design
    // Section G.
    throw new ConflictError(
      'This Class\'s Shift does not have exactly one configured Break Period — Manager checkpoint attendance is not available until it does'
    );
  }
  const breakPeriod = breakPeriods[0];

  const teaching = periods.filter((p) => p.type === 'TEACHING' && p.startTime && p.endTime);
  const coveredPeriods =
    checkpoint === 'BEFORE_BREAK'
      ? teaching.filter((p) => p.startTime < breakPeriod.startTime)
      : teaching.filter((p) => p.startTime > breakPeriod.startTime);

  return { class: cls, breakPeriod, coveredPeriods };
}

// Only computed lazily, per checkpoint value actually present among a
// student's existing Manager records — avoids resolving coverage at all for
// the common case (no Manager record yet exists).
async function findLockingManagerRecord(schoolId, classId, periodId, managerRecords, coverageCache) {
  for (const record of managerRecords) {
    const checkpoint = record.source === 'MANAGER_BEFORE_BREAK' ? 'BEFORE_BREAK' : 'AFTER_BREAK';
    let coveredIds = coverageCache.get(checkpoint);
    if (coveredIds === undefined) {
      try {
        const { coveredPeriods } = await resolveCheckpointCoverage(schoolId, classId, checkpoint);
        coveredIds = new Set(coveredPeriods.map((p) => p.id));
      } catch (err) {
        // Coverage is genuinely undefined (Assumption #1 not yet resolved for
        // this Shift) — fail open toward the Teacher being able to act,
        // never toward silently locking them out of an undefined coverage set.
        coveredIds = new Set();
      }
      coverageCache.set(checkpoint, coveredIds);
    }
    if (coveredIds.has(periodId)) {
      return record;
    }
  }
  return null;
}

async function assertNotManagerLocked(schoolId, studentId, classId, periodId, dateOnly) {
  const managerRecords = await repository.listManagerCheckpointRecords(studentId, classId, dateOnly);
  if (managerRecords.length === 0) return;
  const lockingRecord = await findLockingManagerRecord(schoolId, classId, periodId, managerRecords, new Map());
  if (lockingRecord) {
    throw new ConflictError(
      'This Student\'s attendance for this Period has already been recorded by a Manager and is read-only to Teachers'
    );
  }
}

// --- Teacher edit window (Business Rule #6/#23, Technical Design Section K) ---
// null (no configured value) means no limit enforced — never a guessed
// default invented by this feature. The exact window is an approved Open
// Question in the Business Specification.

async function assertWithinTeacherEditWindow(schoolId, periodEndTime, dateStr) {
  const settings = await repository.getAttendanceSettings(schoolId);
  const windowMinutes = settings ? settings.teacherEditWindowMinutes : null;
  if (windowMinutes == null) return;

  const periodEnd = new Date(`${dateStr}T${periodEndTime}:00.000Z`);
  const deadline = new Date(periodEnd.getTime() + windowMinutes * 60000);
  if (new Date() > deadline) {
    throw new ConflictError('The allowed Teacher attendance editing window for this date has closed');
  }
}

// --- Teacher Student Attendance (Business Lifecycle §1, Business Rules #3-6) ---

async function resolveTeacherCurrentLesson(schoolId, actingUser) {
  const teacher = await teachersService.getOwnProfile(actingUser.id);
  if (teacher.schoolId !== schoolId) {
    throw new AuthorizationError();
  }

  const dateStr = todayDateStr();
  const dayOfWeek = dayOfWeekFor(dateStr);
  const time = nowTimeString();

  const lessons = await timetableService.getTeacherTimetable(schoolId, teacher.id, { versionType: 'PUBLISHED' });
  const current = lessons.find(
    (l) =>
      l.status === 'ACTIVE' &&
      l.dayOfWeek === dayOfWeek &&
      l.period &&
      l.period.startTime &&
      l.period.endTime &&
      l.period.startTime <= time &&
      time < l.period.endTime
  );

  if (!current) return null;
  if (!(await isSchoolDay(schoolId, dateStr))) return null;

  return { lesson: current, teacher, dateStr };
}

async function getTeacherAttendanceView(schoolId, actingUser) {
  const resolved = await resolveTeacherCurrentLesson(schoolId, actingUser);
  if (!resolved) {
    return { lesson: null, date: todayDateStr(), students: [] };
  }
  const { lesson, dateStr } = resolved;
  const dateOnly = toDateOnly(dateStr);

  const { students } = await studentsService.listStudents(
    { status: 'ACTIVE', classId: lesson.class.id, page: 1, pageSize: STUDENT_ROSTER_PAGE_SIZE },
    actingUser
  );

  const classRecords = await repository.listStudentAttendanceForClassDate(lesson.class.id, dateOnly);
  const coverageCache = new Map();

  const roster = [];
  for (const student of students) {
    const teacherRecord = classRecords.find(
      (r) => r.studentId === student.id && r.lessonId === lesson.id && r.source === 'TEACHER'
    );
    const managerRecords = classRecords.filter(
      (r) => r.studentId === student.id && ['MANAGER_BEFORE_BREAK', 'MANAGER_AFTER_BREAK'].includes(r.source)
    );
    // eslint-disable-next-line no-await-in-loop
    const lockingRecord = await findLockingManagerRecord(schoolId, lesson.class.id, lesson.period.id, managerRecords, coverageCache);
    const effective = lockingRecord || teacherRecord;

    roster.push({
      studentId: student.id,
      fullName: student.fullName,
      status: effective ? effective.status : 'NOT_RECORDED',
      locked: Boolean(lockingRecord),
      recordId: effective ? effective.id : null,
      source: effective ? effective.source : null,
    });
  }

  return { lesson, date: dateStr, students: roster };
}

async function recordTeacherAttendance(schoolId, lessonId, dateStr, records, actingUser) {
  const teacher = await teachersService.getOwnProfile(actingUser.id);
  const lesson = await timetableService.getLessonById(schoolId, lessonId);
  if (!lesson || lesson.teacherId !== teacher.id) {
    throw new NotFoundError('Lesson not found');
  }
  if (lesson.status !== 'ACTIVE') {
    throw new ConflictError('Cannot record attendance for an archived Lesson');
  }
  if (lesson.dayOfWeek !== dayOfWeekFor(dateStr)) {
    throw new ValidationError('The supplied date does not fall on this Lesson\'s own recurring day', {
      date: 'Day mismatch',
    });
  }
  await assertSchoolDay(schoolId, dateStr);

  const dateOnly = toDateOnly(dateStr);
  const { students } = await studentsService.listStudents(
    { status: 'ACTIVE', classId: lesson.classId, page: 1, pageSize: STUDENT_ROSTER_PAGE_SIZE },
    actingUser
  );
  const validStudentIds = new Set(students.map((s) => s.id));

  const created = [];
  for (const { studentId, status } of records) {
    if (!validStudentIds.has(studentId)) {
      throw new ValidationError('One or more students are not part of this Lesson\'s Class roster', {
        studentId: 'Invalid student for this Class',
      });
    }
    // eslint-disable-next-line no-await-in-loop
    await assertNotManagerLocked(schoolId, studentId, lesson.classId, lesson.periodId, dateOnly);

    try {
      // eslint-disable-next-line no-await-in-loop
      const record = await repository.createStudentAttendance({
        schoolId,
        studentId,
        classId: lesson.classId,
        lessonId: lesson.id,
        date: dateOnly,
        source: 'TEACHER',
        status,
        recordedByAccountId: actingUser.id,
        recordedByRole: actingUser.role,
      });
      created.push(record);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError(
          `Attendance for this Student and Lesson on ${dateStr} has already been recorded — use the edit endpoint instead`
        );
      }
      throw err;
    }
  }

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'STUDENT_ATTENDANCE_RECORDED',
    metadata: { lessonId: lesson.id, date: dateStr, count: created.length, source: 'TEACHER' },
  });

  return created;
}

async function editTeacherAttendance(schoolId, lessonId, dateStr, records, actingUser) {
  const teacher = await teachersService.getOwnProfile(actingUser.id);
  const lesson = await timetableService.getLessonById(schoolId, lessonId);
  if (!lesson || lesson.teacherId !== teacher.id) {
    throw new NotFoundError('Lesson not found');
  }

  const period = await schoolScheduleService.getPeriodById(schoolId, lesson.periodId);
  await assertWithinTeacherEditWindow(schoolId, period.endTime, dateStr);

  const dateOnly = toDateOnly(dateStr);
  const updated = [];
  for (const { studentId, status } of records) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await repository.findTeacherRecord(studentId, lesson.id, dateOnly);
    if (!existing) {
      throw new NotFoundError(
        `No existing Teacher-recorded attendance found for this Student on ${dateStr} — use the create endpoint instead`
      );
    }
    // eslint-disable-next-line no-await-in-loop
    const record = await repository.updateStudentAttendanceStatus(existing.id, status);
    updated.push(record);
  }

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'STUDENT_ATTENDANCE_EDITED',
    metadata: { lessonId: lesson.id, date: dateStr, count: updated.length },
  });

  return updated;
}

// A Manager's Student-attendance authority spans "all Classes" (Business
// Rule #7) — this narrow read lets the Manager-facing UI enumerate them to
// pick one, without granting Manager any of Class Management's own
// SCHOOL_ADMIN-only routes (classesService.listClasses is an in-process,
// Stable-Public-Service-Interface call, never a new cross-role grant on
// Class Management's own route file).
async function listClassesForManager(schoolId) {
  const classes = await classesService.listClasses(schoolId);
  return classes.filter((c) => c.status === 'ACTIVE');
}

// --- Manager Student Attendance — checkpoints (Business Lifecycle §2-4) ----

async function getManagerCheckpointView(schoolId, classId, checkpoint, dateStr, actingUser) {
  await assertSchoolDay(schoolId, dateStr);
  const { class: cls, coveredPeriods } = await resolveCheckpointCoverage(schoolId, classId, checkpoint);

  const dateOnly = toDateOnly(dateStr);
  const source = checkpoint === 'BEFORE_BREAK' ? 'MANAGER_BEFORE_BREAK' : 'MANAGER_AFTER_BREAK';
  const { students } = await studentsService.listStudents(
    { status: 'ACTIVE', classId, page: 1, pageSize: STUDENT_ROSTER_PAGE_SIZE },
    actingUser
  );
  const records = await repository.listStudentAttendanceForClassDate(classId, dateOnly);

  const roster = students.map((student) => {
    const record = records.find((r) => r.studentId === student.id && r.source === source);
    return {
      studentId: student.id,
      fullName: student.fullName,
      status: record ? record.status : 'NOT_RECORDED',
      recordId: record ? record.id : null,
    };
  });

  return { class: cls, checkpoint, coveredPeriods, date: dateStr, students: roster };
}

async function recordManagerCheckpointAttendance(schoolId, classId, checkpoint, dateStr, records, actingUser) {
  await assertSchoolDay(schoolId, dateStr);
  const { class: cls } = await resolveCheckpointCoverage(schoolId, classId, checkpoint);

  const source = checkpoint === 'BEFORE_BREAK' ? 'MANAGER_BEFORE_BREAK' : 'MANAGER_AFTER_BREAK';
  const dateOnly = toDateOnly(dateStr);
  const { students } = await studentsService.listStudents(
    { status: 'ACTIVE', classId: cls.id, page: 1, pageSize: STUDENT_ROSTER_PAGE_SIZE },
    actingUser
  );
  const validStudentIds = new Set(students.map((s) => s.id));

  const created = [];
  for (const { studentId, status } of records) {
    if (!validStudentIds.has(studentId)) {
      throw new ValidationError('One or more students are not part of this Class roster', {
        studentId: 'Invalid student for this Class',
      });
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const record = await repository.createStudentAttendance({
        schoolId,
        studentId,
        classId: cls.id,
        lessonId: null,
        date: dateOnly,
        source,
        status,
        recordedByAccountId: actingUser.id,
        recordedByRole: actingUser.role,
      });
      created.push(record);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError(
          `This checkpoint has already been recorded for this Student on ${dateStr} — use the correction endpoint instead`
        );
      }
      throw err;
    }
  }

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'STUDENT_ATTENDANCE_RECORDED',
    metadata: { classId: cls.id, checkpoint, date: dateStr, count: created.length, source },
  });

  return created;
}

// A Manager may correct any StudentAttendance row (Teacher- or
// Manager-recorded) — Business Rule #7's "all Classes, all Students"
// authority extends naturally to correction, since no narrower
// correction-scope rule exists (Technical Design Section L).
async function correctStudentAttendance(schoolId, studentAttendanceId, status, actingUser) {
  const existing = await repository.findStudentAttendanceById(studentAttendanceId);
  if (!existing || existing.schoolId !== schoolId) {
    throw new NotFoundError('Attendance record not found');
  }

  const correctedAt = new Date();
  const record = await repository.correctStudentAttendance(studentAttendanceId, {
    status,
    correctedByAccountId: actingUser.id,
    correctedAt,
  });

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'STUDENT_ATTENDANCE_CORRECTED',
    metadata: { recordId: studentAttendanceId, priorStatus: existing.status, newStatus: status },
  });

  return record;
}

// --- Staff Attendance Timing Settings (School Admin configuration screen) --
// (v1.3) Business Rule #38: there is no default anywhere in this feature for
// these three values — School Admin must explicitly set them before "Come"
// works at all for their school (assertStaffAttendanceTimingConfigured below).

function timeStringToTimeField(hhmm) {
  return hhmm ? new Date(`1970-01-01T${hhmm}:00.000Z`) : null;
}

async function getStaffAttendanceTimingSettings(schoolId) {
  const settings = await repository.getAttendanceSettings(schoolId);
  return {
    staffAttendanceStartTime: settings ? formatTimeField(settings.staffAttendanceStartTime) : null,
    staffAttendanceLateThreshold: settings ? formatTimeField(settings.staffAttendanceLateThreshold) : null,
    staffAttendanceAbsenceCutoff: settings ? formatTimeField(settings.staffAttendanceAbsenceCutoff) : null,
  };
}

async function updateStaffAttendanceTimingSettings(schoolId, body, actingUser) {
  const updated = await repository.upsertAttendanceSettings(schoolId, {
    staffAttendanceStartTime: timeStringToTimeField(body.staffAttendanceStartTime),
    staffAttendanceLateThreshold: timeStringToTimeField(body.staffAttendanceLateThreshold),
    staffAttendanceAbsenceCutoff: timeStringToTimeField(body.staffAttendanceAbsenceCutoff),
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'ATTENDANCE_SETTINGS_UPDATED' });

  return {
    staffAttendanceStartTime: formatTimeField(updated.staffAttendanceStartTime),
    staffAttendanceLateThreshold: formatTimeField(updated.staffAttendanceLateThreshold),
    staffAttendanceAbsenceCutoff: formatTimeField(updated.staffAttendanceAbsenceCutoff),
  };
}

// --- Staff Attendance — arrival-based (Business Lifecycle §5-6, §11; Business Rules #14-18, #23, #35-39) ---
// (v1.3) Staff attendance is never a manually-chosen status. A Manager (for
// Teacher/Accountant) or an Admin (for Manager) records arrival ("Come");
// the server derives PRESENT/LATE from the captured timestamp. EXCUSED is
// the one status a human ever applies directly, via a separate "excuse"
// action that corrects an existing row or creates a fresh one. ABSENT is
// never written by either action — it is derived at read time only
// (deriveStaffRosterEntry below), once the configured absence cutoff has
// passed with no arrival recorded.

// Same @db.Time() <-> "HH:mm" convention School Schedule Management already
// established (school-schedule.service.js's own dateToTimeString) — Prisma
// surfaces a TIME column as a Date sharing a fixed 1970-01-01 reference,
// never directly comparable to a plain "HH:mm" string without this
// conversion first.
function formatTimeField(date) {
  return date ? new Date(date).toISOString().slice(11, 16) : null;
}

// null does NOT mean "use a system default" for these three fields — unlike
// teacherEditWindowMinutes etc. above, there is no default; null means "not
// yet configured," and every caller must treat that as a hard stop
// (Business Rule #38), never guessing a value. Returns the three fields
// already formatted as "HH:mm" strings, ready for direct comparison.
async function assertStaffAttendanceTimingConfigured(schoolId) {
  const settings = await repository.getAttendanceSettings(schoolId);
  const startTime = settings && formatTimeField(settings.staffAttendanceStartTime);
  const lateThreshold = settings && formatTimeField(settings.staffAttendanceLateThreshold);
  const absenceCutoff = settings && formatTimeField(settings.staffAttendanceAbsenceCutoff);

  if (!startTime || !lateThreshold || !absenceCutoff) {
    throw new ValidationError('Staff Attendance Timing Settings have not been configured for this school yet', {
      settings: 'Not configured',
    });
  }
  return { startTime, lateThreshold, absenceCutoff };
}

// Pure function — the PRESENT/LATE boundary (Business Rule #35). "At or
// before" the late threshold is PRESENT; strictly after is LATE, however
// late — this function is never called with the absence cutoff in mind at
// all, since a genuine arrival is never capped into ABSENT (Business
// Lifecycle §11).
function deriveStaffAttendanceStatus(arrivalTimeStr, lateThresholdStr) {
  return arrivalTimeStr <= lateThresholdStr ? 'PRESENT' : 'LATE';
}

// (v1.7) Which correction-jurisdiction source a self-recorded "Come" gets,
// derived purely from the acting user's own role — never client input. A
// Teacher's or Accountant's own arrival falls under the Manager's EXCUSED
// jurisdiction; a Manager's own arrival falls under the Admin's.
const SELF_ARRIVAL_SOURCE_BY_ROLE = {
  TEACHER: 'MANAGER_STAFF_ATTENDANCE',
  ACCOUNTANT: 'MANAGER_STAFF_ATTENDANCE',
  MANAGER: 'ADMIN_MANAGER_ATTENDANCE',
};

// Section H.1 (v1.7) — self-recorded arrival. Replaces recordStaffArrival/
// recordManagerStaffArrival/recordAdminManagerArrival: a Manager/Admin never
// records anyone else's arrival any more (Business Rules #14, #17, amended)
// — there is no target account at all, only the acting user's own.
async function recordSelfArrival(schoolId, actingUser) {
  const { startTime, lateThreshold } = await assertStaffAttendanceTimingConfigured(schoolId);

  // Captured once, explicitly — the single "server time" both the status
  // derivation AND the stored recordedAt are computed from (Business Rule
  // #39). Never left to the database's own @default(now()): that would let
  // the persisted arrival instant drift from the instant status was actually
  // derived against, which would silently break any later recomputation
  // (e.g. Section H.2's Unexcuse action) against the app's own clock.
  const arrivalNow = new Date();
  const timeStr = arrivalNow.toISOString().slice(11, 16);
  if (timeStr < startTime) {
    throw new ValidationError('Staff attendance has not opened yet for today', {
      time: 'Before the configured start time',
    });
  }

  const source = SELF_ARRIVAL_SOURCE_BY_ROLE[actingUser.role];
  const status = deriveStaffAttendanceStatus(timeStr, lateThreshold);
  const dateStr = todayDateStr();

  try {
    const record = await repository.createStaffAttendance({
      schoolId,
      staffAccountId: actingUser.id,
      staffRole: actingUser.role,
      date: toDateOnly(dateStr),
      source,
      status,
      recordedByAccountId: actingUser.id,
      recordedByRole: actingUser.role,
      recordedAt: arrivalNow,
    });

    await recordAuditEvent({
      schoolId,
      userId: actingUser.id,
      action: 'STAFF_ATTENDANCE_ARRIVAL_RECORDED',
      metadata: { staffAccountId: actingUser.id, date: dateStr, status, source },
    });

    return record;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError(`Attendance for today has already been recorded`);
    }
    throw err;
  }
}

// (v1.9) Business Rule #41 — the normal Excuse action is today-only. A
// client-supplied date other than today is rejected outright, not silently
// honored — this is the fix for the exact gap live-testing found: the
// pre-v1.9 action accepted any syntactically-valid date, past or future,
// with no legality check at all.
function assertTodayOnly(dateStr) {
  const today = todayDateStr();
  if (dateStr !== today) {
    throw new ValidationError('Excuse can only be applied for today — use the historical correction action for a past date', {
      date: 'Must be today',
    });
  }
}

// (v1.9) The historical-correction path's own gate — strictly before today.
// Never today (that already has its own action above) and never a future
// date, under any circumstance: EXCUSED is never allowed for a date that
// hasn't happened yet, correction or not (Business Rule #41).
function assertPastDateOnly(dateStr) {
  const today = todayDateStr();
  if (!(dateStr < today)) {
    throw new ValidationError('Historical correction requires a date before today', {
      date: dateStr === today ? 'Use the normal Excuse action for today' : 'Future dates are never allowed for Excuse',
    });
  }
}

// Section H.2 — the one status a human ever applies directly (Business Rule
// #37). Corrects an existing row (preserving recordedBy*/recordedAt, per
// Business Rule #13) or creates a fresh one directly as EXCUSED when no
// arrival was ever recorded (the derived-ABSENT case) — never gated by the
// start time or absence cutoff, since this is an administrative override,
// not an arrival. `historical` (v1.9) selects which date is legal (today
// only vs. strictly past) and which audit action is recorded — the actual
// create-or-correct mutation below is identical either way, never duplicated.
async function markStaffExcused(schoolId, accountId, dateStr, actingUser, { targetRoles, source, historical = false }) {
  if (historical) {
    assertPastDateOnly(dateStr);
  } else {
    assertTodayOnly(dateStr);
  }

  const dateOnly = toDateOnly(dateStr);
  const existing = await repository.findStaffAttendanceByAccountAndDate(accountId, dateOnly);

  if (existing) {
    const record = await correctStaffAttendance(schoolId, existing.id, 'EXCUSED', actingUser);
    if (historical) {
      // correctStaffAttendance already records its own generic
      // STAFF_ATTENDANCE_CORRECTED audit event — this adds a second,
      // explicitly-named one so a historical correction is unambiguous in
      // the audit trail, not indistinguishable from an ordinary same-day
      // correction.
      await recordAuditEvent({
        schoolId,
        userId: actingUser.id,
        action: 'STAFF_ATTENDANCE_HISTORICAL_EXCUSE',
        metadata: { recordId: existing.id, staffAccountId: accountId, date: dateStr, source, historicalCorrection: true },
      });
    }
    return record;
  }

  const targets = await authService.listAccountsByRole(schoolId, targetRoles);
  const target = targets.find((t) => t.id === accountId);
  if (!target) {
    throw new ValidationError('This account is not a valid target for this action', {
      accountId: 'Invalid account',
    });
  }

  const record = await repository.createStaffAttendance({
    schoolId,
    staffAccountId: accountId,
    staffRole: target.role,
    date: dateOnly,
    source,
    status: 'EXCUSED',
    recordedByAccountId: actingUser.id,
    recordedByRole: actingUser.role,
  });

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: historical ? 'STAFF_ATTENDANCE_HISTORICAL_EXCUSE' : 'STAFF_ATTENDANCE_EXCUSED',
    metadata: { staffAccountId: accountId, date: dateStr, source, historicalCorrection: historical },
  });

  return record;
}

function excuseManagerStaff(schoolId, accountId, dateStr, actingUser) {
  return markStaffExcused(schoolId, accountId, dateStr, actingUser, {
    targetRoles: ['TEACHER', 'ACCOUNTANT'],
    source: 'MANAGER_STAFF_ATTENDANCE',
  });
}

function excuseManagerStaffHistorical(schoolId, accountId, dateStr, actingUser) {
  return markStaffExcused(schoolId, accountId, dateStr, actingUser, {
    targetRoles: ['TEACHER', 'ACCOUNTANT'],
    source: 'MANAGER_STAFF_ATTENDANCE',
    historical: true,
  });
}

function excuseAdminManager(schoolId, accountId, dateStr, actingUser) {
  return markStaffExcused(schoolId, accountId, dateStr, actingUser, {
    targetRoles: ['MANAGER'],
    source: 'ADMIN_MANAGER_ATTENDANCE',
  });
}

function excuseAdminManagerHistorical(schoolId, accountId, dateStr, actingUser) {
  return markStaffExcused(schoolId, accountId, dateStr, actingUser, {
    targetRoles: ['MANAGER'],
    source: 'ADMIN_MANAGER_ATTENDANCE',
    historical: true,
  });
}

// Section H.2 (v1.6) — the "Unexcuse" action. Replaces v1.5's "Correct,"
// which wrongly let a Manager/Admin pick any of the four statuses — that
// reintroduced manual, subjective status selection, exactly what the
// arrival-based model (Business Rules #35, #39) exists to prevent. This
// action never accepts a client-supplied status: it only ever reverses a
// mistaken Excuse, and the restored value is always computed server-side —
//  - if a genuine "Come" arrival preceded the mistaken Excuse (recognizable
//    because Excuse, via correctStaffAttendance, is the only path that ever
//    sets correctedByAccountId on a StaffAttendance row), recompute
//    PRESENT/LATE from that arrival's own untouched recordedAt and clear
//    correctedBy*/correctedAt — the row returns to exactly its pre-Excuse
//    state;
//  - otherwise Excuse created this row from nothing, so there is no prior
//    state to restore — delete it, restoring the derived ABSENT/NOT_RECORDED
//    read-time state (Section H.3).
async function unexcuseStaffAttendanceByAccount(schoolId, accountId, dateStr, actingUser) {
  const dateOnly = toDateOnly(dateStr);
  const existing = await repository.findStaffAttendanceByAccountAndDate(accountId, dateOnly);
  if (!existing || existing.schoolId !== schoolId) {
    throw new NotFoundError('Attendance record not found');
  }
  if (actingUser.role === 'MANAGER' && existing.source !== 'MANAGER_STAFF_ATTENDANCE') {
    throw new AuthorizationError();
  }
  if (actingUser.role === 'SCHOOL_ADMIN' && existing.source !== 'ADMIN_MANAGER_ATTENDANCE') {
    throw new AuthorizationError();
  }
  if (existing.status !== 'EXCUSED') {
    throw new ValidationError('This record is not currently marked Excused', { status: 'Not excused' });
  }

  if (existing.correctedByAccountId) {
    const settings = await repository.getAttendanceSettings(schoolId);
    const lateThreshold = settings && formatTimeField(settings.staffAttendanceLateThreshold);
    const arrivalTimeStr = formatTimeField(existing.recordedAt);
    const status = deriveStaffAttendanceStatus(arrivalTimeStr, lateThreshold);

    const record = await repository.correctStaffAttendance(existing.id, {
      status,
      correctedByAccountId: null,
      correctedAt: null,
    });

    await recordAuditEvent({
      schoolId,
      userId: actingUser.id,
      action: 'STAFF_ATTENDANCE_UNEXCUSED',
      metadata: { recordId: existing.id, restoredStatus: status },
    });

    return record;
  }

  await repository.deleteStaffAttendance(existing.id);

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'STAFF_ATTENDANCE_UNEXCUSED',
    metadata: { recordId: existing.id, restoredStatus: 'derived' },
  });

  return null;
}

function unexcuseManagerStaff(schoolId, accountId, dateStr, actingUser) {
  return unexcuseStaffAttendanceByAccount(schoolId, accountId, dateStr, actingUser);
}

function unexcuseAdminManager(schoolId, accountId, dateStr, actingUser) {
  return unexcuseStaffAttendanceByAccount(schoolId, accountId, dateStr, actingUser);
}

// Section H.3 — never a stored value. If a row exists, its status/recordedAt
// (as `time`) are authoritative. Otherwise: past the configured absence
// cutoff (for the SPECIFIC date being queried, not just "now" — this
// comparison is a real anchored Date for that date's own cutoff instant, so
// it is automatically correct for a past date too, not only today) ->
// ABSENT, time: null; before it -> NOT_RECORDED. If the timing settings
// aren't configured at all, the cutoff can never have "passed" — everything
// un-recorded stays NOT_RECORDED rather than guessing ABSENT.
function deriveStaffRosterEntry(account, record, dateStr, settings) {
  if (record) {
    return {
      accountId: account.id,
      email: account.email,
      role: account.role,
      status: record.status,
      time: record.recordedAt,
      recordId: record.id,
    };
  }

  let status = 'NOT_RECORDED';
  const absenceCutoff = settings && formatTimeField(settings.staffAttendanceAbsenceCutoff);
  if (absenceCutoff) {
    const cutoffInstant = new Date(`${dateStr}T${absenceCutoff}:00.000Z`);
    if (new Date() > cutoffInstant) {
      status = 'ABSENT';
    }
  }

  return {
    accountId: account.id,
    email: account.email,
    role: account.role,
    status,
    time: null,
    recordId: null,
  };
}

async function getManagerStaffAttendanceView(schoolId, dateStr) {
  const staff = await authService.listAccountsByRole(schoolId, ['TEACHER', 'ACCOUNTANT']);
  const dateOnly = toDateOnly(dateStr);
  const [records, settings] = await Promise.all([
    repository.listStaffAttendanceForDate(
      schoolId,
      dateOnly,
      staff.map((s) => s.id)
    ),
    repository.getAttendanceSettings(schoolId),
  ]);

  return staff.map((account) =>
    deriveStaffRosterEntry(
      account,
      records.find((r) => r.staffAccountId === account.id),
      dateStr,
      settings
    )
  );
}

// --- Admin records Manager attendance (Business Lifecycle §6) --------------
// Business Rule #33's structural guarantee lives here: staff/targets are
// built from listAccountsByRole(schoolId, ['MANAGER']) alone — a
// SCHOOL_ADMIN account (including the acting Admin's own) can never appear
// in it, so there is no code path anywhere in this module that could create
// a StaffAttendance row with staffRole = SCHOOL_ADMIN.

async function getAdminManagerAttendanceView(schoolId, dateStr) {
  const managers = await authService.listAccountsByRole(schoolId, ['MANAGER']);
  const dateOnly = toDateOnly(dateStr);
  const [records, settings] = await Promise.all([
    repository.listStaffAttendanceForDate(
      schoolId,
      dateOnly,
      managers.map((m) => m.id)
    ),
    repository.getAttendanceSettings(schoolId),
  ]);

  return managers.map((account) =>
    deriveStaffRosterEntry(
      account,
      records.find((r) => r.staffAccountId === account.id),
      dateStr,
      settings
    )
  );
}

// Shared correction path for StaffAttendance — used by both Manager
// (correcting Teacher/Accountant attendance they can also record) and Admin
// (correcting Manager attendance, Business Rule #19), and internally by
// markStaffExcused above when a row already exists. The source check below
// is the defense-in-depth guarantee that a Manager can never correct an
// Admin-recorded Manager-attendance row, and an Admin can never correct a
// Manager-recorded Teacher/Accountant row, through this shared function.
async function correctStaffAttendance(schoolId, staffAttendanceId, status, actingUser) {
  const existing = await repository.findStaffAttendanceById(staffAttendanceId);
  if (!existing || existing.schoolId !== schoolId) {
    throw new NotFoundError('Attendance record not found');
  }
  if (actingUser.role === 'MANAGER' && existing.source !== 'MANAGER_STAFF_ATTENDANCE') {
    throw new AuthorizationError();
  }
  if (actingUser.role === 'SCHOOL_ADMIN' && existing.source !== 'ADMIN_MANAGER_ATTENDANCE') {
    throw new AuthorizationError();
  }

  const correctedAt = new Date();
  const record = await repository.correctStaffAttendance(staffAttendanceId, {
    status,
    correctedByAccountId: actingUser.id,
    correctedAt,
  });

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'STAFF_ATTENDANCE_CORRECTED',
    metadata: { recordId: staffAttendanceId, priorStatus: existing.status, newStatus: status },
  });

  return record;
}

// --- Student attendance history (Business Rules #29-30, Technical Design Section Q) ---
// Unfiltered by current roster/status — a Student's history survives every
// lifecycle transition unchanged and remains queryable regardless of their
// current status.

async function getStudentAttendanceHistory(schoolId, studentId, actingUser) {
  await studentsService.getStudentDetail(studentId, actingUser);

  const records = await repository.listStudentAttendanceHistory(studentId);

  if (actingUser.role === 'TEACHER') {
    return records.filter((r) => r.source === 'TEACHER' && r.recordedByAccountId === actingUser.id);
  }
  return records;
}

module.exports = {
  getStaffAttendanceTimingSettings,
  updateStaffAttendanceTimingSettings,
  listClassesForManager,
  getTeacherAttendanceView,
  recordTeacherAttendance,
  editTeacherAttendance,
  getManagerCheckpointView,
  recordManagerCheckpointAttendance,
  correctStudentAttendance,
  deriveStaffAttendanceStatus,
  getManagerStaffAttendanceView,
  recordSelfArrival,
  excuseManagerStaff,
  excuseManagerStaffHistorical,
  unexcuseManagerStaff,
  getAdminManagerAttendanceView,
  excuseAdminManager,
  excuseAdminManagerHistorical,
  unexcuseAdminManager,
  correctStaffAttendance,
  getStudentAttendanceHistory,
};
