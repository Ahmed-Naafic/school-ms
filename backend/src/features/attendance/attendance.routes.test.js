// Integration tests against the real Express app and dev database. Every
// fixture (School, Calendar/Shift/Period, Class, Teacher, Subject, Academic
// Year, Teacher Subject Assignment, Lesson, Students, Manager/Accountant
// accounts) is created via direct SERVICE calls, never HTTP — the same "raw
// school + direct service calls" pattern Timetable Management's own
// routes.test.js already established, avoiding the password-reset endpoint's
// shared rate-limit budget entirely.
//
// "Now" is pinned via Jest fake timers (Date only — real timers are left
// alone so Prisma/Postgres/supertest network I/O never hangs) so Teacher
// current-lesson resolution and the Manager Before/After Break boundary are
// fully deterministic regardless of when this suite actually runs.
const { app, request } = require('../../shared/test-helpers');
const prisma = require('../../config/database');
const { hashPassword } = require('../../shared/password');
const { signAccessToken } = require('../../shared/jwt');
const schoolScheduleService = require('../school-schedule/school-schedule.service');
const classesService = require('../classes/classes.service');
const teachersService = require('../teachers/teachers.service');
const subjectsService = require('../subjects/subjects.service');
const academicYearsService = require('../academic-years/academic-years.service');
const teacherSubjectAssignmentsService = require('../teacher-subject-assignments/teacher-subject-assignments.service');
const timetableService = require('../timetable/timetable.service');
const studentsService = require('../students/students.service');
const authService = require('../auth/auth.service');

jest.setTimeout(30000);

const ALL_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
// Afternoon window, deliberately outside the default "Morning" Shift's own
// 07:30-12:30 range every fixture school is bootstrapped with, so this
// fixture's own custom Shift never collides with it.
const FAKE_NOW = new Date('2026-01-05T13:15:00.000Z');
const FAKE_TODAY = '2026-01-05';
const FAKE_DAY_OF_WEEK = ALL_DAYS[FAKE_NOW.getUTCDay()];
// School Schedule Management requires at least one Weekend Day (Business
// Rule #4 there) — every day cannot be Working. Excludes some OTHER day,
// never FAKE_DAY_OF_WEEK itself, so the fixture's own Lesson day always
// stays a working day regardless of which real weekday this suite runs on.
const FIXTURE_WEEKEND_DAY = ALL_DAYS.find((d) => d !== FAKE_DAY_OF_WEEK);
const FIXTURE_WORKING_DAYS = ALL_DAYS.filter((d) => d !== FIXTURE_WEEKEND_DAY);
// One week after FAKE_TODAY — same day-of-week as the fixture's Lesson (so
// this specifically exercises the holiday check, not an incidental
// day-of-week mismatch), marked a one-off non-working day per-test below.
const NON_WORKING_DATE = '2026-01-12';

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// role is created through authService.createAccount, whose own authorization
// matrix requires a real actingUser with authority to create THAT role — a
// School Admin (Accountant/Teacher/Student/Manager) or a Super Admin (School
// Admin). Since this fixture builds its School via a raw prisma.school.create
// (Timetable Management's own established fixture technique) rather than
// through schools.service.createSchool, no School Admin account exists yet —
// see directSchoolAdminToken below for that one case.
async function directAccountToken(schoolId, role, email, actingUser) {
  const account = await authService.createAccount({ email, role, schoolId }, actingUser);
  const passwordHash = await hashPassword('Passw0rd123!');
  const updated = await prisma.account.update({ where: { id: account.id }, data: { passwordHash, status: 'ACTIVE' } });
  return { token: signAccessToken(updated), account: updated };
}

// A School Admin account cannot be created via authService.createAccount by
// anyone other than a genuine Super Admin (Authentication-and-Authorization.md:
// "May not create another School Admin account under any circumstance").
// This raw-school fixture has no such account yet, so it's inserted directly
// — the same direct-Prisma-insert technique test-helpers.js's own
// createTestSchoolAdminDirect already uses for exactly this reason.
async function directSchoolAdminToken(schoolId, email) {
  const passwordHash = await hashPassword('Passw0rd123!');
  const account = await prisma.account.create({
    data: { email, role: 'SCHOOL_ADMIN', schoolId, passwordHash, status: 'ACTIVE' },
  });
  return { token: signAccessToken(account), account };
}

async function buildFixture(label) {
  const suffix = `${label}-${uniqueSuffix()}`;
  const school = await prisma.school.create({ data: { name: `Attendance ${suffix}` } });
  const schoolId = school.id;
  const actingUser = { id: 'attendance-fixture-user', schoolId, role: 'SCHOOL_ADMIN' };

  await schoolScheduleService.createDefaultScheduleForSchool(schoolId, actingUser);
  await classesService.createDefaultGradeLevelForSchool(schoolId, 'PRIMARY');

  // FAKE_DAY_OF_WEEK is always a working day for this fixture — sidesteps
  // any dependency on which real-world weekday the suite happens to run on.
  await schoolScheduleService.updateSchoolCalendar(schoolId, { workingDays: FIXTURE_WORKING_DAYS }, actingUser);

  const shift = await schoolScheduleService.createShift(
    schoolId,
    { name: `Shift ${suffix}`, startTime: '13:00', endTime: '16:00', teachingPeriodCount: 2, includeBreak: true, breakAfterPeriod: 1 },
    actingUser
  );
  const rawPeriods = await schoolScheduleService.listPeriods(schoolId, shift.id, { status: 'ACTIVE' });
  const periodOrder = rawPeriods.sort((a, b) => a.displayOrder - b.displayOrder);
  const [p1, brk, p2] = periodOrder;

  // Before Break: 13:00-13:55. Break: 14:00-14:10. After Break: 14:15-15:00.
  // Small gaps between each (rather than exact touching boundaries) since
  // School Schedule Management's own overlap check treats two Periods
  // sharing an exact boundary instant as overlapping (inclusive <=), not
  // adjacent. FAKE_NOW (13:15) falls inside the Before-Break Period.
  const periodA = await schoolScheduleService.updatePeriod(schoolId, p1.id, { name: p1.name, type: 'TEACHING', startTime: '13:00', endTime: '13:55' }, actingUser);
  await schoolScheduleService.updatePeriod(schoolId, brk.id, { name: brk.name, type: 'BREAK', startTime: '14:00', endTime: '14:10' }, actingUser);
  const periodB = await schoolScheduleService.updatePeriod(schoolId, p2.id, { name: p2.name, type: 'TEACHING', startTime: '14:15', endTime: '15:00' }, actingUser);

  const cls = await classesService.createClass({ name: `Class ${suffix}`, shiftId: shift.id }, actingUser);

  const teacher = await teachersService.onboardTeacher(
    { email: `teacher-${suffix}@example.com`, fullName: `Teacher ${suffix}`, joiningDate: '2026-01-01' },
    actingUser
  );

  const subject = await subjectsService.createSubject({ name: `Subject ${suffix}`, educationLevel: 'PRIMARY' }, { id: 'system' });
  await subjectsService.assignSubjectToSchool(schoolId, subject.id, actingUser);

  const academicYear = await academicYearsService.createAcademicYear(schoolId, { startDate: '2026-01-01', endDate: '2026-12-31' }, actingUser);
  await academicYearsService.designateCurrentAcademicYear(schoolId, academicYear.id, actingUser);

  const assignment = await teacherSubjectAssignmentsService.createAssignment(
    schoolId,
    { teacherId: teacher.id, subjectId: subject.id, classId: cls.id, academicYearId: academicYear.id, effectiveStartDate: '2026-01-01' },
    actingUser
  );

  const lesson = await timetableService.createLesson(
    schoolId,
    { teacherSubjectAssignmentId: assignment.id, dayOfWeek: FAKE_DAY_OF_WEEK, periodId: periodA.id },
    actingUser
  );
  await timetableService.publishTimetableVersion(schoolId, academicYear.id, actingUser);

  const students = [];
  for (let i = 0; i < 2; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const student = await studentsService.admitStudent(
      { email: `student-${suffix}-${i}@example.com`, fullName: `Student ${i} ${suffix}` },
      actingUser
    );
    // eslint-disable-next-line no-await-in-loop
    await studentsService.enrollStudent(student.id, { classId: cls.id, academicYearId: academicYear.id }, actingUser);
    students.push(student);
  }

  const schoolAdmin = await directSchoolAdminToken(schoolId, `admin-${suffix}@example.com`);
  const manager = await directAccountToken(schoolId, 'MANAGER', `manager-${suffix}@example.com`, actingUser);
  const accountant = await directAccountToken(schoolId, 'ACCOUNTANT', `accountant-${suffix}@example.com`, actingUser);

  // The real Teacher account was already created by onboardTeacher above —
  // sign a token for THAT account directly rather than creating a second one.
  const teacherPasswordHash = await hashPassword('Passw0rd123!');
  const teacherAccountRow = await prisma.account.update({
    where: { id: teacher.accountId },
    data: { passwordHash: teacherPasswordHash, status: 'ACTIVE' },
  });
  const teacherAccount = { token: signAccessToken(teacherAccountRow), account: teacherAccountRow };

  return {
    schoolId,
    actingUser,
    shift,
    periodA,
    periodB,
    cls,
    teacher,
    students,
    schoolAdmin,
    manager,
    accountant,
    teacherToken: teacherAccount.token,
  };
}

async function cleanupFixture(schoolId) {
  await prisma.studentAttendance.deleteMany({ where: { schoolId } });
  await prisma.staffAttendance.deleteMany({ where: { schoolId } });
  await prisma.schoolNonWorkingDay.deleteMany({ where: { schoolId } });
  await prisma.attendanceSettings.deleteMany({ where: { schoolId } });
  await prisma.enrollment.deleteMany({ where: { student: { schoolId } } });
  await prisma.lesson.deleteMany({ where: { schoolId } });
  await prisma.lessonGroup.deleteMany({ where: { schoolId } });
  await prisma.timetableGenerationJob.deleteMany({ where: { schoolId } });
  await prisma.timetableVersion.deleteMany({ where: { schoolId } });
  await prisma.teacherSubjectAssignment.deleteMany({ where: { schoolId } });
  await prisma.weeklySubjectAllocation.deleteMany({ where: { schoolId } });
  await prisma.schoolSubject.deleteMany({ where: { schoolId } }).catch(() => {});
  await prisma.academicYear.deleteMany({ where: { schoolId } });
  await prisma.student.deleteMany({ where: { schoolId } });
  await prisma.class.deleteMany({ where: { schoolId } });
  await prisma.teacher.deleteMany({ where: { schoolId } });
  await prisma.period.deleteMany({ where: { shift: { schoolId } } });
  await prisma.shift.deleteMany({ where: { schoolId } });
  await prisma.schoolCalendar.deleteMany({ where: { schoolId } });
  await prisma.schoolOptimizationSettings.deleteMany({ where: { schoolId } });
  await prisma.account.deleteMany({ where: { schoolId } });
  await prisma.auditLog.deleteMany({ where: { schoolId } });
  await prisma.school.delete({ where: { id: schoolId } });
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] });
  jest.setSystemTime(FAKE_NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Attendance Management', () => {
  let fx;

  beforeAll(async () => {
    fx = await buildFixture('main');
  });

  afterAll(async () => {
    await cleanupFixture(fx.schoolId);
  });

  // --- Business Rule #34: SUPER_ADMIN has zero Attendance access -----------
  describe('SUPER_ADMIN exclusion (Business Rule #34)', () => {
    let superAdminToken;

    beforeAll(async () => {
      const superAdmin = await prisma.account.findFirst({ where: { role: 'SUPER_ADMIN' } });
      superAdminToken = signAccessToken(superAdmin);
    });

    const routes = [
      ['get', '/api/v1/attendance/settings'],
      ['patch', '/api/v1/attendance/settings'],
      ['get', '/api/v1/attendance/teacher/current-lesson'],
      ['post', () => `/api/v1/attendance/teacher/lessons/${fx.teacher.id}/records`],
      ['patch', () => `/api/v1/attendance/teacher/lessons/${fx.teacher.id}/records`],
      ['get', () => `/api/v1/attendance/manager/classes/${fx.cls.id}/checkpoints/BEFORE_BREAK`],
      ['post', () => `/api/v1/attendance/manager/classes/${fx.cls.id}/checkpoints/BEFORE_BREAK/records`],
      ['patch', '/api/v1/attendance/manager/records/nonexistent-id'],
      ['post', '/api/v1/attendance/staff/me/come'],
      ['get', '/api/v1/attendance/manager/staff'],
      ['patch', '/api/v1/attendance/manager/staff/nonexistent-id/excuse'],
      ['patch', '/api/v1/attendance/manager/staff/nonexistent-id/excuse-historical'],
      ['patch', '/api/v1/attendance/manager/staff/nonexistent-id/unexcuse'],
      ['get', '/api/v1/attendance/admin/managers'],
      ['patch', '/api/v1/attendance/admin/managers/nonexistent-id/excuse'],
      ['patch', '/api/v1/attendance/admin/managers/nonexistent-id/excuse-historical'],
      ['patch', '/api/v1/attendance/admin/managers/nonexistent-id/unexcuse'],
      ['get', () => `/api/v1/attendance/students/${fx.students[0].id}/history`],
    ];

    test.each(routes)('%s %s is rejected for SUPER_ADMIN, regardless of school context', async (method, pathOrFn) => {
      const path = typeof pathOrFn === 'function' ? pathOrFn() : pathOrFn;
      const res = await request(app)[method](path).set('Authorization', `Bearer ${superAdminToken}`).send({});
      expect(res.status).toBe(403);
    });
  });

  // --- Staff Attendance Timing Settings (School Admin configuration) -------
  describe('Staff Attendance Timing Settings', () => {
    test('School Admin can set and read back the three configured times', async () => {
      const putRes = await request(app)
        .patch('/api/v1/attendance/settings')
        .set('Authorization', `Bearer ${fx.schoolAdmin.token}`)
        .send({ staffAttendanceStartTime: '07:00', staffAttendanceLateThreshold: '07:30', staffAttendanceAbsenceCutoff: '08:00' });
      expect(putRes.status).toBe(200);
      expect(putRes.body.data).toEqual({
        staffAttendanceStartTime: '07:00',
        staffAttendanceLateThreshold: '07:30',
        staffAttendanceAbsenceCutoff: '08:00',
      });

      const getRes = await request(app)
        .get('/api/v1/attendance/settings')
        .set('Authorization', `Bearer ${fx.schoolAdmin.token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.staffAttendanceLateThreshold).toBe('07:30');
    });

    test('rejects an out-of-order configuration (late threshold before start time)', async () => {
      const res = await request(app)
        .patch('/api/v1/attendance/settings')
        .set('Authorization', `Bearer ${fx.schoolAdmin.token}`)
        .send({ staffAttendanceStartTime: '08:00', staffAttendanceLateThreshold: '07:00', staffAttendanceAbsenceCutoff: '09:00' });
      expect(res.status).toBe(422);
    });

    test('Manager cannot access the settings endpoint', async () => {
      const res = await request(app)
        .get('/api/v1/attendance/settings')
        .set('Authorization', `Bearer ${fx.manager.token}`);
      expect(res.status).toBe(403);
    });
  });

  // --- Teacher Student Attendance ------------------------------------------
  describe('Teacher Student Attendance', () => {
    test('resolves the current lesson from the Timetable and reports NOT_RECORDED for unrecorded students', async () => {
      const res = await request(app)
        .get('/api/v1/attendance/teacher/current-lesson')
        .set('Authorization', `Bearer ${fx.teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.lesson).not.toBeNull();
      expect(res.body.data.students).toHaveLength(2);
      expect(res.body.data.students.every((s) => s.status === 'NOT_RECORDED')).toBe(true);
    });

    test('Teacher records attendance for their current lesson', async () => {
      const res = await request(app)
        .post(`/api/v1/attendance/teacher/lessons/${(await currentLessonId())}/records`)
        .set('Authorization', `Bearer ${fx.teacherToken}`)
        .send({
          date: FAKE_TODAY,
          records: [
            { studentId: fx.students[0].id, status: 'PRESENT' },
            { studentId: fx.students[1].id, status: 'ABSENT' },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveLength(2);
    });

    test('a duplicate create for the same Student/Lesson/date is rejected (409)', async () => {
      const lessonId = await currentLessonId();
      const res = await request(app)
        .post(`/api/v1/attendance/teacher/lessons/${lessonId}/records`)
        .set('Authorization', `Bearer ${fx.teacherToken}`)
        .send({ date: FAKE_TODAY, records: [{ studentId: fx.students[0].id, status: 'PRESENT' }] });

      expect(res.status).toBe(409);
    });

    test('Teacher can edit their own recorded attendance', async () => {
      const lessonId = await currentLessonId();
      const res = await request(app)
        .patch(`/api/v1/attendance/teacher/lessons/${lessonId}/records`)
        .set('Authorization', `Bearer ${fx.teacherToken}`)
        .send({ date: FAKE_TODAY, records: [{ studentId: fx.students[0].id, status: 'LATE' }] });

      expect(res.status).toBe(200);
      expect(res.body.data[0].status).toBe('LATE');
    });

    test('recording attendance for a non-working day is rejected', async () => {
      // No SchoolNonWorkingDay management API exists yet (Implementation
      // Plan Phase 1 note) — inserted directly, the same "no service exists
      // yet for this fixture row" technique buildFixture's own
      // prisma.school.create already uses.
      await prisma.schoolNonWorkingDay.create({
        data: { schoolId: fx.schoolId, date: new Date(`${NON_WORKING_DATE}T00:00:00.000Z`), reason: 'Test holiday' },
      });

      const lessonId = await currentLessonId();
      const res = await request(app)
        .post(`/api/v1/attendance/teacher/lessons/${lessonId}/records`)
        .set('Authorization', `Bearer ${fx.teacherToken}`)
        .send({ date: NON_WORKING_DATE, records: [{ studentId: fx.students[0].id, status: 'PRESENT' }] });

      expect(res.status).toBe(422);
    });

    async function currentLessonId() {
      const view = await request(app)
        .get('/api/v1/attendance/teacher/current-lesson')
        .set('Authorization', `Bearer ${fx.teacherToken}`);
      return view.body.data.lesson.id;
    }
  });

  // --- Manager Student Attendance — checkpoints ----------------------------
  describe('Manager checkpoint attendance and Teacher lock', () => {
    let checkpointFx;

    beforeAll(async () => {
      checkpointFx = await buildFixture('checkpoint');
    });

    afterAll(async () => {
      await cleanupFixture(checkpointFx.schoolId);
    });

    test('Manager records Before Break attendance covering the Teacher\'s own Period', async () => {
      const res = await request(app)
        .post(`/api/v1/attendance/manager/classes/${checkpointFx.cls.id}/checkpoints/BEFORE_BREAK/records`)
        .set('Authorization', `Bearer ${checkpointFx.manager.token}`)
        .send({
          date: FAKE_TODAY,
          records: checkpointFx.students.map((s) => ({ studentId: s.id, status: 'PRESENT' })),
        });

      expect(res.status).toBe(201);
    });

    test('the checkpoint view reports the correct covered Periods', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/manager/classes/${checkpointFx.cls.id}/checkpoints/BEFORE_BREAK?date=${FAKE_TODAY}`)
        .set('Authorization', `Bearer ${checkpointFx.manager.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.coveredPeriods.map((p) => p.id)).toEqual([checkpointFx.periodA.id]);
    });

    test('Teacher can no longer create attendance for a Period the Manager\'s checkpoint already covers', async () => {
      const lessonRes = await timetableService.getTeacherTimetable(checkpointFx.schoolId, checkpointFx.teacher.id, { versionType: 'PUBLISHED' });
      const lesson = lessonRes[0];

      const res = await request(app)
        .post(`/api/v1/attendance/teacher/lessons/${lesson.id}/records`)
        .set('Authorization', `Bearer ${checkpointFx.teacherToken}`)
        .send({ date: FAKE_TODAY, records: [{ studentId: checkpointFx.students[0].id, status: 'PRESENT' }] });

      expect(res.status).toBe(409);
    });

    test('Teacher still sees the Manager-recorded attendance as read-only in the current-lesson view', async () => {
      const res = await request(app)
        .get('/api/v1/attendance/teacher/current-lesson')
        .set('Authorization', `Bearer ${checkpointFx.teacherToken}`);

      expect(res.status).toBe(200);
      const entry = res.body.data.students.find((s) => s.studentId === checkpointFx.students[0].id);
      expect(entry.locked).toBe(true);
      expect(entry.status).toBe('PRESENT');
    });

    test('Manager corrects the checkpoint-recorded attendance, preserving original recordedBy', async () => {
      const viewRes = await request(app)
        .get(`/api/v1/attendance/manager/classes/${checkpointFx.cls.id}/checkpoints/BEFORE_BREAK?date=${FAKE_TODAY}`)
        .set('Authorization', `Bearer ${checkpointFx.manager.token}`);
      const recordId = viewRes.body.data.students.find((s) => s.studentId === checkpointFx.students[0].id).recordId;

      const res = await request(app)
        .patch(`/api/v1/attendance/manager/records/${recordId}`)
        .set('Authorization', `Bearer ${checkpointFx.manager.token}`)
        .send({ status: 'LATE' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('LATE');
      expect(res.body.data.correctedByAccountId).toBe(checkpointFx.manager.account.id);
      expect(res.body.data.recordedByAccountId).toBe(checkpointFx.manager.account.id);
    });

    test('a duplicate checkpoint create for the same Student/date/checkpoint is rejected (409)', async () => {
      const res = await request(app)
        .post(`/api/v1/attendance/manager/classes/${checkpointFx.cls.id}/checkpoints/BEFORE_BREAK/records`)
        .set('Authorization', `Bearer ${checkpointFx.manager.token}`)
        .send({ date: FAKE_TODAY, records: [{ studentId: checkpointFx.students[0].id, status: 'PRESENT' }] });

      expect(res.status).toBe(409);
    });
  });

  // --- Staff Attendance (v1.3 — arrival-based, Business Rules #35-39) --------
  describe('Staff Attendance', () => {
    let staffFx;
    let extraTeacher;
    let presentTeacher;
    let excuseTeacher;

    beforeAll(async () => {
      staffFx = await buildFixture('staff');
      // Settings deliberately chosen relative to FAKE_NOW (13:15): late
      // threshold before it (so a "Come" lands LATE), absence cutoff well
      // after it (so an un-recorded staff member reads NOT_RECORDED, not
      // ABSENT, until a dedicated test below moves the cutoff earlier).
      await prisma.attendanceSettings.create({
        data: {
          schoolId: staffFx.schoolId,
          staffAttendanceStartTime: new Date('1970-01-01T08:00:00.000Z'),
          staffAttendanceLateThreshold: new Date('1970-01-01T13:00:00.000Z'),
          staffAttendanceAbsenceCutoff: new Date('1970-01-01T20:00:00.000Z'),
        },
      });

      extraTeacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-late-${uniqueSuffix()}@example.com`, staffFx.actingUser);
      presentTeacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-present-${uniqueSuffix()}@example.com`, staffFx.actingUser);
      excuseTeacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-excuse-${uniqueSuffix()}@example.com`, staffFx.actingUser);
    });

    afterAll(async () => {
      await cleanupFixture(staffFx.schoolId);
    });

    test('rejects self "Come" when Staff Attendance Timing Settings have not been configured for the school at all', async () => {
      const unconfiguredFx = await buildFixture('unconfigured');
      const teacherRow = await prisma.teacher.findUnique({ where: { id: unconfiguredFx.teacher.id } });
      const teacherToken = signAccessToken(await prisma.account.findUnique({ where: { id: teacherRow.accountId } }));
      const res = await request(app).post('/api/v1/attendance/staff/me/come').set('Authorization', `Bearer ${teacherToken}`);
      expect(res.status).toBe(422);
      await cleanupFixture(unconfiguredFx.schoolId);
    });

    test('rejects self "Come" before the configured start time', async () => {
      await prisma.attendanceSettings.update({
        where: { schoolId: staffFx.schoolId },
        data: { staffAttendanceStartTime: new Date('1970-01-01T14:00:00.000Z') },
      });
      const res = await request(app).post('/api/v1/attendance/staff/me/come').set('Authorization', `Bearer ${extraTeacher.token}`);
      expect(res.status).toBe(422);

      // Restore the real start time for every test below.
      await prisma.attendanceSettings.update({
        where: { schoolId: staffFx.schoolId },
        data: { staffAttendanceStartTime: new Date('1970-01-01T08:00:00.000Z') },
      });
    });

    test('self "Come" after the late threshold derives LATE automatically — status is never client-supplied', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/staff/me/come')
        .set('Authorization', `Bearer ${extraTeacher.token}`)
        .send({ status: 'PRESENT' }); // deliberately sent to prove it's ignored

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('LATE');
      expect(res.body.data.recordedAt).not.toBeNull();
      expect(res.body.data.recordedByAccountId).toBe(extraTeacher.account.id); // self-recorded, not the Manager
    });

    test('self "Come" at or before the late threshold derives PRESENT', async () => {
      await prisma.attendanceSettings.update({
        where: { schoolId: staffFx.schoolId },
        data: { staffAttendanceLateThreshold: new Date('1970-01-01T23:59:00.000Z') },
      });
      const res = await request(app).post('/api/v1/attendance/staff/me/come').set('Authorization', `Bearer ${presentTeacher.token}`);
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PRESENT');

      await prisma.attendanceSettings.update({
        where: { schoolId: staffFx.schoolId },
        data: { staffAttendanceLateThreshold: new Date('1970-01-01T13:00:00.000Z') },
      });
    });

    test('a second self "Come" for the same person/day is rejected (409)', async () => {
      const res = await request(app).post('/api/v1/attendance/staff/me/come').set('Authorization', `Bearer ${extraTeacher.token}`);
      expect(res.status).toBe(409);
    });

    test('an Accountant can self-record their own arrival the same way as a Teacher', async () => {
      const accountant = await directAccountToken(staffFx.schoolId, 'ACCOUNTANT', `staff-accountant-${uniqueSuffix()}@example.com`, staffFx.actingUser);
      const res = await request(app).post('/api/v1/attendance/staff/me/come').set('Authorization', `Bearer ${accountant.token}`);
      expect(res.status).toBe(201);
      expect(['PRESENT', 'LATE']).toContain(res.body.data.status);
      expect(res.body.data.recordedByAccountId).toBe(accountant.account.id);
    });

    // --- Self "Come" date/timestamp integrity (v1.8) ------------------------
    // The route takes no path parameter and the controller never reads
    // req.body for this action at all — date and timestamp are always
    // todayDateStr()/new Date() (Section H.1). These tests lock that
    // guarantee in explicitly, per-field, rather than leaving it as an
    // inference from "the controller doesn't read the body."
    describe('self "Come" date/timestamp integrity', () => {
      const YESTERDAY = '2026-01-04';
      const TOMORROW = '2026-01-06';

      test('today: a normal self "Come" with no body succeeds and is dated today', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-datecheck-today-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const res = await request(app).post('/api/v1/attendance/staff/me/come').set('Authorization', `Bearer ${teacher.token}`);
        expect(res.status).toBe(201);
        expect(res.body.data.date).toBe(new Date(`${FAKE_TODAY}T00:00:00.000Z`).toISOString());
      });

      test('yesterday: a client-supplied date of yesterday cannot create a backdated self "Come" — the record is still dated today', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-datecheck-yesterday-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const res = await request(app)
          .post('/api/v1/attendance/staff/me/come')
          .set('Authorization', `Bearer ${teacher.token}`)
          .send({ date: YESTERDAY });
        expect(res.status).toBe(201);
        expect(res.body.data.date).toBe(new Date(`${FAKE_TODAY}T00:00:00.000Z`).toISOString());
        expect(res.body.data.date).not.toBe(new Date(`${YESTERDAY}T00:00:00.000Z`).toISOString());

        const row = await prisma.staffAttendance.findUnique({
          where: { staffAccountId_date: { staffAccountId: teacher.account.id, date: new Date(`${YESTERDAY}T00:00:00.000Z`) } },
        });
        expect(row).toBeNull(); // no row was ever created for the spoofed date
      });

      test('tomorrow: a client-supplied date of tomorrow cannot create a future-dated self "Come" — the record is still dated today', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-datecheck-tomorrow-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const res = await request(app)
          .post('/api/v1/attendance/staff/me/come')
          .set('Authorization', `Bearer ${teacher.token}`)
          .send({ date: TOMORROW });
        expect(res.status).toBe(201);
        expect(res.body.data.date).toBe(new Date(`${FAKE_TODAY}T00:00:00.000Z`).toISOString());

        const row = await prisma.staffAttendance.findUnique({
          where: { staffAccountId_date: { staffAccountId: teacher.account.id, date: new Date(`${TOMORROW}T00:00:00.000Z`) } },
        });
        expect(row).toBeNull();
      });

      test('a client-supplied recordedAt is ignored — the server\'s own captured timestamp is used', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-datecheck-recordedat-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const spoofedRecordedAt = '1999-12-31T00:00:00.000Z';
        const res = await request(app)
          .post('/api/v1/attendance/staff/me/come')
          .set('Authorization', `Bearer ${teacher.token}`)
          .send({ recordedAt: spoofedRecordedAt });
        expect(res.status).toBe(201);
        expect(res.body.data.recordedAt).toBe(FAKE_NOW.toISOString());
        expect(res.body.data.recordedAt).not.toBe(spoofedRecordedAt);
      });

      test('a client-supplied status is ignored — the server always derives it from the real arrival time', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-datecheck-status-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const res = await request(app)
          .post('/api/v1/attendance/staff/me/come')
          .set('Authorization', `Bearer ${teacher.token}`)
          .send({ status: 'ABSENT' }); // ABSENT is never a "Come" outcome at all (Business Rule #36)
        expect(res.status).toBe(201);
        expect(res.body.data.status).toBe('LATE'); // late threshold is 13:00, FAKE_NOW is 13:15
        expect(res.body.data.status).not.toBe('ABSENT');
      });

      test('date, recordedAt, and status spoofed together in one request are all ignored simultaneously', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-datecheck-combined-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const res = await request(app)
          .post('/api/v1/attendance/staff/me/come')
          .set('Authorization', `Bearer ${teacher.token}`)
          .send({ date: YESTERDAY, recordedAt: '1999-12-31T00:00:00.000Z', status: 'EXCUSED' });
        expect(res.status).toBe(201);
        expect(res.body.data.date).toBe(new Date(`${FAKE_TODAY}T00:00:00.000Z`).toISOString());
        expect(res.body.data.recordedAt).toBe(FAKE_NOW.toISOString());
        expect(res.body.data.status).toBe('LATE');
      });
    });

    test('removed route: POST /attendance/manager/staff/:accountId/come no longer exists', async () => {
      const res = await request(app)
        .post(`/api/v1/attendance/manager/staff/${presentTeacher.account.id}/come`)
        .set('Authorization', `Bearer ${staffFx.manager.token}`);
      expect(res.status).toBe(404);
    });

    test('removed route: POST /attendance/admin/managers/:accountId/come no longer exists', async () => {
      const res = await request(app)
        .post(`/api/v1/attendance/admin/managers/${staffFx.manager.account.id}/come`)
        .set('Authorization', `Bearer ${staffFx.schoolAdmin.token}`);
      expect(res.status).toBe(404);
    });

    test('"Excuse" creates a fresh EXCUSED record when no arrival was ever recorded', async () => {
      const res = await request(app)
        .patch(`/api/v1/attendance/manager/staff/${excuseTeacher.account.id}/excuse`)
        .set('Authorization', `Bearer ${staffFx.manager.token}`)
        .send({ date: FAKE_TODAY });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('EXCUSED');
      expect(res.body.data.correctedByAccountId).toBeNull();
      expect(res.body.data.recordedByAccountId).toBe(staffFx.manager.account.id);
    });

    test('"Excuse" corrects an existing (e.g. LATE) record instead of creating a duplicate', async () => {
      const res = await request(app)
        .patch(`/api/v1/attendance/manager/staff/${extraTeacher.account.id}/excuse`)
        .set('Authorization', `Bearer ${staffFx.manager.token}`)
        .send({ date: FAKE_TODAY });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('EXCUSED');
      expect(res.body.data.correctedByAccountId).toBe(staffFx.manager.account.id);
    });

    // --- Normal "Excuse" is today-only; historical correction is separate ---
    // (v1.9, Business Rule #41) Live-testing found the pre-v1.9 "excuse"
    // action accepted ANY client-supplied date — yesterday, 2020, 2099, all
    // succeeded. Fixed by restricting the normal action to today and adding
    // a genuinely separate "excuse-historical" action, required-date, for a
    // real past date only. Self "Come" (v1.8, Business Rule #40) is
    // untouched by this — this block is entirely about the Excuse action.
    describe('"Excuse" date restriction (Business Rule #41)', () => {
      const YESTERDAY = '2026-01-04';
      const TOMORROW = '2026-01-06';
      const PAST_DATE = '2026-01-02'; // three days before FAKE_TODAY

      test('today: the normal Excuse action succeeds for today (omitted date)', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-excuse-today-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const res = await request(app)
          .patch(`/api/v1/attendance/manager/staff/${teacher.account.id}/excuse`)
          .set('Authorization', `Bearer ${staffFx.manager.token}`)
          .send({});
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('EXCUSED');
        expect(res.body.data.date).toBe(new Date(`${FAKE_TODAY}T00:00:00.000Z`).toISOString());
      });

      test('today: the normal Excuse action succeeds when today is supplied explicitly', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-excuse-today-explicit-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const res = await request(app)
          .patch(`/api/v1/attendance/manager/staff/${teacher.account.id}/excuse`)
          .set('Authorization', `Bearer ${staffFx.manager.token}`)
          .send({ date: FAKE_TODAY });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('EXCUSED');
      });

      test('yesterday: the normal Excuse action is rejected (422) for a past date — this is the exact bug that was reported', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-excuse-yesterday-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const res = await request(app)
          .patch(`/api/v1/attendance/manager/staff/${teacher.account.id}/excuse`)
          .set('Authorization', `Bearer ${staffFx.manager.token}`)
          .send({ date: YESTERDAY });
        expect(res.status).toBe(422);

        const row = await prisma.staffAttendance.findUnique({
          where: { staffAccountId_date: { staffAccountId: teacher.account.id, date: new Date(`${YESTERDAY}T00:00:00.000Z`) } },
        });
        expect(row).toBeNull(); // no record was created for the rejected date
      });

      test('tomorrow: the normal Excuse action is rejected (422) for a future date', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-excuse-tomorrow-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const res = await request(app)
          .patch(`/api/v1/attendance/manager/staff/${teacher.account.id}/excuse`)
          .set('Authorization', `Bearer ${staffFx.manager.token}`)
          .send({ date: TOMORROW });
        expect(res.status).toBe(422);

        const row = await prisma.staffAttendance.findUnique({
          where: { staffAccountId_date: { staffAccountId: teacher.account.id, date: new Date(`${TOMORROW}T00:00:00.000Z`) } },
        });
        expect(row).toBeNull();
      });

      test('historical: "excuse-historical" succeeds for a genuine past date, via the separate explicitly-authorized endpoint', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-historical-excuse-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const res = await request(app)
          .patch(`/api/v1/attendance/manager/staff/${teacher.account.id}/excuse-historical`)
          .set('Authorization', `Bearer ${staffFx.manager.token}`)
          .send({ date: PAST_DATE });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('EXCUSED');
        expect(res.body.data.date).toBe(new Date(`${PAST_DATE}T00:00:00.000Z`).toISOString());

        const row = await prisma.staffAttendance.findUnique({
          where: { staffAccountId_date: { staffAccountId: teacher.account.id, date: new Date(`${PAST_DATE}T00:00:00.000Z`) } },
        });
        expect(row).not.toBeNull();
        expect(row.status).toBe('EXCUSED');
      });

      test('historical: "excuse-historical" requires a date in the body at all — omitting it is rejected (422)', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-historical-nodate-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const res = await request(app)
          .patch(`/api/v1/attendance/manager/staff/${teacher.account.id}/excuse-historical`)
          .set('Authorization', `Bearer ${staffFx.manager.token}`)
          .send({});
        expect(res.status).toBe(422);
      });

      test('historical: "excuse-historical" rejects today (422) — today must use the normal Excuse action instead', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-historical-today-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const res = await request(app)
          .patch(`/api/v1/attendance/manager/staff/${teacher.account.id}/excuse-historical`)
          .set('Authorization', `Bearer ${staffFx.manager.token}`)
          .send({ date: FAKE_TODAY });
        expect(res.status).toBe(422);
      });

      test('historical: "excuse-historical" rejects a future date (422) — future EXCUSED is never allowed, correction or not', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-historical-future-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const res = await request(app)
          .patch(`/api/v1/attendance/manager/staff/${teacher.account.id}/excuse-historical`)
          .set('Authorization', `Bearer ${staffFx.manager.token}`)
          .send({ date: TOMORROW });
        expect(res.status).toBe(422);

        const row = await prisma.staffAttendance.findUnique({
          where: { staffAccountId_date: { staffAccountId: teacher.account.id, date: new Date(`${TOMORROW}T00:00:00.000Z`) } },
        });
        expect(row).toBeNull();
      });

      test('a Manager can "Unexcuse" a historical (past) date\'s record created via "excuse-historical", not just today\'s — Unexcuse itself is unchanged by this fix', async () => {
        const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-historical-unexcuse-${uniqueSuffix()}@example.com`, staffFx.actingUser);

        await request(app)
          .patch(`/api/v1/attendance/manager/staff/${teacher.account.id}/excuse-historical`)
          .set('Authorization', `Bearer ${staffFx.manager.token}`)
          .send({ date: PAST_DATE });

        const res = await request(app)
          .patch(`/api/v1/attendance/manager/staff/${teacher.account.id}/unexcuse`)
          .set('Authorization', `Bearer ${staffFx.manager.token}`)
          .send({ date: PAST_DATE });
        expect(res.status).toBe(200);

        const row = await prisma.staffAttendance.findUnique({
          where: { staffAccountId_date: { staffAccountId: teacher.account.id, date: new Date(`${PAST_DATE}T00:00:00.000Z`) } },
        });
        expect(row).toBeNull(); // excuse-historical had created it fresh, so Unexcuse deletes it — same mechanism as today's case
      });

      test('audit trail: a normal same-day Excuse and a historical Excuse are recorded under distinct audit actions', async () => {
        const todayTeacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-audit-today-${uniqueSuffix()}@example.com`, staffFx.actingUser);
        const historicalTeacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-audit-historical-${uniqueSuffix()}@example.com`, staffFx.actingUser);

        await request(app)
          .patch(`/api/v1/attendance/manager/staff/${todayTeacher.account.id}/excuse`)
          .set('Authorization', `Bearer ${staffFx.manager.token}`)
          .send({});
        await request(app)
          .patch(`/api/v1/attendance/manager/staff/${historicalTeacher.account.id}/excuse-historical`)
          .set('Authorization', `Bearer ${staffFx.manager.token}`)
          .send({ date: PAST_DATE });

        const todayAudit = await prisma.auditLog.findFirst({
          where: { schoolId: staffFx.schoolId, action: 'STAFF_ATTENDANCE_EXCUSED' },
          orderBy: { createdAt: 'desc' },
        });
        const historicalAudit = await prisma.auditLog.findFirst({
          where: { schoolId: staffFx.schoolId, action: 'STAFF_ATTENDANCE_HISTORICAL_EXCUSE' },
          orderBy: { createdAt: 'desc' },
        });

        expect(todayAudit).not.toBeNull();
        expect(todayAudit.metadata.staffAccountId).toBe(todayTeacher.account.id);
        expect(historicalAudit).not.toBeNull();
        expect(historicalAudit.metadata.staffAccountId).toBe(historicalTeacher.account.id);
        expect(historicalAudit.metadata.historicalCorrection).toBe(true);
      });
    });

    // --- "Unexcuse" (v1.6, replaces v1.5's "Correct") — fixes the one-way ---
    // "Excuse" gap WITHOUT letting a Manager/Admin pick any status themselves.
    test('"Unexcuse" recomputes the real prior status from the original arrival, not a client-supplied value', async () => {
      const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-unexcuse-late-${uniqueSuffix()}@example.com`, staffFx.actingUser);

      const comeRes = await request(app).post('/api/v1/attendance/staff/me/come').set('Authorization', `Bearer ${teacher.token}`);
      expect(comeRes.body.data.status).toBe('LATE'); // late threshold is 13:00, FAKE_NOW is 13:15

      const excuseRes = await request(app)
        .patch(`/api/v1/attendance/manager/staff/${teacher.account.id}/excuse`)
        .set('Authorization', `Bearer ${staffFx.manager.token}`)
        .send({ date: FAKE_TODAY });
      expect(excuseRes.body.data.status).toBe('EXCUSED');
      expect(excuseRes.body.data.correctedByAccountId).toBe(staffFx.manager.account.id);

      const unexcuseRes = await request(app)
        .patch(`/api/v1/attendance/manager/staff/${teacher.account.id}/unexcuse`)
        .set('Authorization', `Bearer ${staffFx.manager.token}`)
        .send({ date: FAKE_TODAY, status: 'PRESENT' }); // deliberately sent to prove it's ignored
      expect(unexcuseRes.status).toBe(200);
      expect(unexcuseRes.body.data.status).toBe('LATE');
      expect(unexcuseRes.body.data.correctedByAccountId).toBeNull();
      expect(unexcuseRes.body.data.correctedAt).toBeNull();
    });

    test('"Unexcuse" deletes a record Excuse created fresh, restoring the derived read-time state', async () => {
      const teacher = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-unexcuse-fresh-${uniqueSuffix()}@example.com`, staffFx.actingUser);

      const excuseRes = await request(app)
        .patch(`/api/v1/attendance/manager/staff/${teacher.account.id}/excuse`)
        .set('Authorization', `Bearer ${staffFx.manager.token}`)
        .send({ date: FAKE_TODAY });
      expect(excuseRes.body.data.correctedByAccountId).toBeNull(); // fresh create, not a correction

      const unexcuseRes = await request(app)
        .patch(`/api/v1/attendance/manager/staff/${teacher.account.id}/unexcuse`)
        .set('Authorization', `Bearer ${staffFx.manager.token}`)
        .send({ date: FAKE_TODAY });
      expect(unexcuseRes.status).toBe(200);

      const row = await prisma.staffAttendance.findUnique({
        where: { staffAccountId_date: { staffAccountId: teacher.account.id, date: toDateOnlyForTest(FAKE_TODAY) } },
      });
      expect(row).toBeNull();
    });

    test('"Unexcuse" is rejected (422) when the record is not currently EXCUSED', async () => {
      const res = await request(app)
        .patch(`/api/v1/attendance/manager/staff/${presentTeacher.account.id}/unexcuse`)
        .set('Authorization', `Bearer ${staffFx.manager.token}`)
        .send({ date: FAKE_TODAY });
      expect(res.status).toBe(422);
    });

    test('"Unexcuse" is rejected (404) when no record exists yet for that person/day', async () => {
      const neverRecorded = await directAccountToken(staffFx.schoolId, 'TEACHER', `staff-never-${uniqueSuffix()}@example.com`, staffFx.actingUser);
      const res = await request(app)
        .patch(`/api/v1/attendance/manager/staff/${neverRecorded.account.id}/unexcuse`)
        .set('Authorization', `Bearer ${staffFx.manager.token}`)
        .send({ date: FAKE_TODAY });
      expect(res.status).toBe(404);
    });

    test('GET roster reports NOT_RECORDED (never ABSENT) before the configured absence cutoff', async () => {
      const untouched = await directAccountToken(staffFx.schoolId, 'ACCOUNTANT', `staff-untouched-${uniqueSuffix()}@example.com`, staffFx.actingUser);
      const res = await request(app)
        .get(`/api/v1/attendance/manager/staff?date=${FAKE_TODAY}`)
        .set('Authorization', `Bearer ${staffFx.manager.token}`);
      const entry = res.body.data.find((s) => s.accountId === untouched.account.id);
      expect(entry.status).toBe('NOT_RECORDED');
      expect(entry.time).toBeNull();
    });

    test('GET roster derives ABSENT with a null time once the absence cutoff has passed, without writing any row', async () => {
      const neverComes = await directAccountToken(staffFx.schoolId, 'ACCOUNTANT', `staff-absent-${uniqueSuffix()}@example.com`, staffFx.actingUser);
      await prisma.attendanceSettings.update({
        where: { schoolId: staffFx.schoolId },
        data: { staffAttendanceAbsenceCutoff: new Date('1970-01-01T13:00:00.000Z') }, // before FAKE_NOW (13:15)
      });

      const res = await request(app)
        .get(`/api/v1/attendance/manager/staff?date=${FAKE_TODAY}`)
        .set('Authorization', `Bearer ${staffFx.manager.token}`);
      const entry = res.body.data.find((s) => s.accountId === neverComes.account.id);
      expect(entry.status).toBe('ABSENT');
      expect(entry.time).toBeNull();

      const row = await prisma.staffAttendance.findUnique({
        where: { staffAccountId_date: { staffAccountId: neverComes.account.id, date: toDateOnlyForTest(FAKE_TODAY) } },
      });
      expect(row).toBeNull();
    });

    test('a Manager self-records their own arrival the same self-check-in way', async () => {
      const res = await request(app).post('/api/v1/attendance/staff/me/come').set('Authorization', `Bearer ${staffFx.manager.token}`);
      expect(res.status).toBe(201);
      expect(['PRESENT', 'LATE']).toContain(res.body.data.status);
      expect(res.body.data.recordedByAccountId).toBe(staffFx.manager.account.id); // self-recorded, not the Admin
    });

    test('Manager cannot unexcuse a Manager attendance row (Admin correction jurisdiction) through the Manager endpoint', async () => {
      const excuseRes = await request(app)
        .patch(`/api/v1/attendance/admin/managers/${staffFx.manager.account.id}/excuse`)
        .set('Authorization', `Bearer ${staffFx.schoolAdmin.token}`)
        .send({ date: FAKE_TODAY });
      expect(excuseRes.body.data.status).toBe('EXCUSED');

      const res = await request(app)
        .patch(`/api/v1/attendance/manager/staff/${staffFx.manager.account.id}/unexcuse`)
        .set('Authorization', `Bearer ${staffFx.manager.token}`)
        .send({ date: FAKE_TODAY });
      expect(res.status).toBe(403);
    });

    test('Admin cannot unexcuse a Teacher/Accountant attendance row (Manager correction jurisdiction) through the Admin endpoint', async () => {
      const res = await request(app)
        .patch(`/api/v1/attendance/admin/managers/${extraTeacher.account.id}/unexcuse`)
        .set('Authorization', `Bearer ${staffFx.schoolAdmin.token}`)
        .send({ date: FAKE_TODAY });
      expect(res.status).toBe(403);
    });

    test('School Admin unexcuses a Manager\'s own attendance record via /admin/managers/:accountId/unexcuse', async () => {
      const res = await request(app)
        .patch(`/api/v1/attendance/admin/managers/${staffFx.manager.account.id}/unexcuse`)
        .set('Authorization', `Bearer ${staffFx.schoolAdmin.token}`)
        .send({ date: FAKE_TODAY });
      expect(res.status).toBe(200);
      expect(['PRESENT', 'LATE']).toContain(res.body.data.status);
      expect(res.body.data.correctedByAccountId).toBeNull();
    });

    test('School Admin cannot call the self-check-in route at all — Business Rule #33', async () => {
      const res = await request(app).post('/api/v1/attendance/staff/me/come').set('Authorization', `Bearer ${staffFx.schoolAdmin.token}`);
      expect(res.status).toBe(403);
    });

    test('Manager cannot access the Admin-manager-attendance endpoints', async () => {
      const res = await request(app)
        .get('/api/v1/attendance/admin/managers')
        .set('Authorization', `Bearer ${staffFx.manager.token}`);
      expect(res.status).toBe(403);
    });

    function toDateOnlyForTest(dateStr) {
      return new Date(`${dateStr}T00:00:00.000Z`);
    }
  });

  // --- Tenant isolation --------------------------------------------------
  describe('Tenant isolation', () => {
    let otherFx;

    beforeAll(async () => {
      otherFx = await buildFixture('otherschool');
    });

    afterAll(async () => {
      await cleanupFixture(otherFx.schoolId);
    });

    test('a Manager from School A cannot view School B\'s Class checkpoint attendance', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/manager/classes/${otherFx.cls.id}/checkpoints/BEFORE_BREAK?date=${FAKE_TODAY}`)
        .set('Authorization', `Bearer ${fx.manager.token}`);

      expect(res.status).toBe(404);
    });

    test('self "Come" always writes against the caller\'s own school, never a cross-school target — there is no accountId for a Manager to even attempt to target any more (v1.7)', async () => {
      const otherTeacherRecord = await prisma.teacher.findUnique({ where: { id: otherFx.teacher.id } });
      const otherTeacherAccount = await prisma.account.findUnique({ where: { id: otherTeacherRecord.accountId } });

      // The old per-account route this scenario used to exercise is gone
      // entirely (v1.7) — confirm it stays gone regardless of which school's
      // account a caller tries against.
      const removedRouteRes = await request(app)
        .post(`/api/v1/attendance/manager/staff/${otherTeacherRecord.accountId}/come`)
        .set('Authorization', `Bearer ${fx.manager.token}`);
      expect(removedRouteRes.status).toBe(404);

      // A School-B Teacher self-checking in writes only to School B — a
      // School-A Manager's own roster read never sees it.
      await prisma.attendanceSettings.upsert({
        where: { schoolId: otherFx.schoolId },
        create: {
          schoolId: otherFx.schoolId,
          staffAttendanceStartTime: new Date('1970-01-01T08:00:00.000Z'),
          staffAttendanceLateThreshold: new Date('1970-01-01T23:59:00.000Z'),
          staffAttendanceAbsenceCutoff: new Date('1970-01-01T23:59:00.000Z'),
        },
        update: {},
      });
      const otherTeacherToken = signAccessToken(otherTeacherAccount);
      const comeRes = await request(app).post('/api/v1/attendance/staff/me/come').set('Authorization', `Bearer ${otherTeacherToken}`);
      expect(comeRes.status).toBe(201);

      const rosterRes = await request(app)
        .get(`/api/v1/attendance/manager/staff?date=${FAKE_TODAY}`)
        .set('Authorization', `Bearer ${fx.manager.token}`);
      expect(rosterRes.body.data.find((s) => s.accountId === otherTeacherRecord.accountId)).toBeUndefined();
    });
  });
});
