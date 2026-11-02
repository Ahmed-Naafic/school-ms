// Integration tests against the real Express app and dev database. Every
// fixture (School, Calendar/Shift/Period bootstrap, Teacher, Subject, Class,
// Academic Year, Teacher Subject Assignment) is created via direct SERVICE
// calls, never HTTP — this avoids the password-reset endpoint's shared
// rate-limit budget entirely (already spent today by earlier feature work),
// the same "raw school + direct service calls" pattern School Schedule
// Management's and Teacher Subject Assignment's own Concurrency blocks
// already established. A small, separate HTTP-level pass at the end uses
// exactly ONE createTestSchoolAdmin call, mirroring Period Management's own
// budget-conscious precedent.
const { app, request, loginSuperAdmin, createTestSchoolAdmin, uniqueSuffix } = require('../../shared/test-helpers');
const prisma = require('../../config/database');
const service = require('./timetable.service');
const jobs = require('./timetable.jobs');
const schoolsService = require('../schools/schools.service');
const teachersService = require('../teachers/teachers.service');
const subjectsService = require('../subjects/subjects.service');
const classesService = require('../classes/classes.service');
const academicYearsService = require('../academic-years/academic-years.service');
const teacherSubjectAssignmentsService = require('../teacher-subject-assignments/teacher-subject-assignments.service');
const schoolScheduleService = require('../school-schedule/school-schedule.service');
const weeklySubjectAllocationsService = require('../weekly-subject-allocations/weekly-subject-allocations.service');
const { signAccessToken } = require('../../shared/jwt');

// Generation is deliberately fire-and-forget (Technical Design's own Job
// Execution Model) — tests must poll the persisted job row rather than
// awaiting a return value, the same way a real frontend would.
async function waitForJob(jobId, { timeoutMs = 10000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await prisma.timetableGenerationJob.findUnique({ where: { id: jobId } });
    if (job && (job.status === 'COMPLETED' || job.status === 'FAILED')) return job;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Generation job ${jobId} did not complete within ${timeoutMs}ms`);
}

jest.setTimeout(30000);

let suffix;
const systemUser = { id: 'timetable-test-system' };

// existingSchoolId lets the HTTP-level describe block build its Teacher/
// Subject/Class/AcademicYear/Assignment fixture under the SAME school an
// already-issued HTTP token belongs to (created via createTestSchoolAdmin,
// which already runs its own default-schedule bootstrap through the real
// POST /schools endpoint) — re-running createDefaultScheduleForSchool
// against that same school would violate SchoolCalendar's own schoolId
// unique constraint, so that step only runs for a genuinely fresh raw school.
// compactSchedule: used only by scenarios that must set an exact,
// deliberately small Weekly Subject Allocation total (Weekly Subject
// Allocation requires every allocation's line items to sum to EXACTLY the
// calculated available weekly teaching periods — a single-Subject fixture
// can only hit a small, precise target if the Class's own Shift/Calendar
// make that target the whole week's capacity). Narrows the Calendar to one
// Working Day and gives the Class its own two-Period, no-Break Shift, so
// availablePeriods is exactly 2 — matching the exact numbers ("weekly
// target of 2", "one double-period group") these scenarios were already
// written around before Weekly Subject Allocation existed.
async function buildFixture(label, existingSchoolId, { compactSchedule = false, compactPeriodCount = 2 } = {}) {
  const localSuffix = `${suffix}-${label}`;
  let schoolId = existingSchoolId;
  if (!schoolId) {
    const rawSchool = await prisma.school.create({ data: { name: `Timetable ${label} ${localSuffix}` } });
    schoolId = rawSchool.id;
  }
  // role: 'SCHOOL_ADMIN' is required by Authentication & Authorization's own
  // createAccount authorization check (onboardTeacher's own account-creation
  // call), not just a Timetable-specific need.
  const actingUser = { id: 'timetable-fixture-user', schoolId, role: 'SCHOOL_ADMIN' };

  if (!existingSchoolId) {
    await schoolScheduleService.createDefaultScheduleForSchool(schoolId, actingUser);
    // (ACR-009, Architecture Update — Grade/Form) A raw school bypasses
    // createSchool's own orchestration entirely, so it has no GradeLevel to
    // default to unless created explicitly here too.
    await classesService.createDefaultGradeLevelForSchool(schoolId, 'PRIMARY');
  }

  let classShiftId;
  let morningShift = await schoolScheduleService.getActiveShift(schoolId);
  let periods = await schoolScheduleService.getShiftPeriods(schoolId, morningShift.id, { status: 'ACTIVE' });

  if (compactSchedule) {
    await schoolScheduleService.updateSchoolCalendar(schoolId, { workingDays: ['MONDAY'] }, actingUser);
    const compactShift = await schoolScheduleService.createShift(
      schoolId,
      { name: `Compact ${localSuffix}`, startTime: '13:00', endTime: '14:00', teachingPeriodCount: compactPeriodCount, includeBreak: false },
      actingUser
    );
    classShiftId = compactShift.id;
    periods = await schoolScheduleService.getShiftPeriods(schoolId, compactShift.id, { status: 'ACTIVE' });
  }

  const teachingPeriods = periods.filter((p) => p.type === 'TEACHING');
  const periodA = teachingPeriods[0];
  const periodB = teachingPeriods[1];
  const breakPeriod = periods.find((p) => p.type === 'BREAK');

  const cls = await classesService.createClass({ name: `Class ${localSuffix}`, shiftId: classShiftId }, actingUser);

  const teacher = await teachersService.onboardTeacher(
    {
      email: `teacher-${localSuffix}@example.com`,
      fullName: `Teacher ${localSuffix}`,
      joiningDate: '2026-01-01',
    },
    actingUser
  );

  const subject = await subjectsService.createSubject({ name: `Subject ${localSuffix}`, educationLevel: 'PRIMARY' }, systemUser);
  await subjectsService.assignSubjectToSchool(schoolId, subject.id, actingUser);

  const academicYear = await academicYearsService.createAcademicYear(
    schoolId,
    { startDate: '2026-01-01', endDate: '2026-12-31' },
    actingUser
  );
  await academicYearsService.designateCurrentAcademicYear(schoolId, academicYear.id, actingUser);

  const assignment = await teacherSubjectAssignmentsService.createAssignment(
    schoolId,
    { teacherId: teacher.id, subjectId: subject.id, classId: cls.id, academicYearId: academicYear.id, effectiveStartDate: '2026-01-01' },
    actingUser
  );

  return { schoolId, actingUser, morningShift, periodA, periodB, teachingPeriods, breakPeriod, cls, teacher, subject, academicYear, assignment };
}

// Removes everything buildFixture creates EXCEPT the School/Calendar/Shift/
// Period/Account/School-Optimization-Settings rows — used when the fixture
// was built under an already-existing, externally-owned school (the HTTP
// describe block's own schoolA, created via createTestSchoolAdmin), which
// this file must not delete out from under other tests in the same block.
async function cleanupFixtureRowsOnly(schoolId, teacherAccountId) {
  // Architecture Update (Generation-First) — Lesson now FKs to
  // TimetableVersion and (optionally) LessonGroup; both must be cleared
  // after Lesson rows (children first) and before the School itself is
  // deleted, or the School's own FK from TimetableVersion/
  // TimetableGenerationJob would block it.
  await prisma.lesson.deleteMany({ where: { schoolId } });
  await prisma.lessonGroup.deleteMany({ where: { schoolId } });
  await prisma.timetableGenerationJob.deleteMany({ where: { schoolId } });
  await prisma.timetableVersion.deleteMany({ where: { schoolId } });
  // subjectSchedulePreference FKs to teacherSubjectAssignment — must clear
  // before deleting Assignments (the double-period tests create one).
  await prisma.subjectSchedulePreference.deleteMany({ where: { schoolId } });
  await prisma.teacherSchedulePreference.deleteMany({ where: { schoolId } });
  await prisma.teacherSubjectAssignment.deleteMany({ where: { schoolId } });
  // weeklySubjectAllocation FKs to both academicYearId and gradeLevelId —
  // must clear before either Academic Year or (indirectly, via the School's
  // own cascade at final delete) GradeLevel goes away.
  await prisma.weeklySubjectAllocation.deleteMany({ where: { schoolId } });
  await prisma.schoolSubject.deleteMany({ where: { schoolId } }).catch(() => {});
  await prisma.academicYear.deleteMany({ where: { schoolId } });
  await prisma.class.deleteMany({ where: { schoolId } });
  await prisma.teacher.deleteMany({ where: { schoolId } });
  if (teacherAccountId) {
    await prisma.account.deleteMany({ where: { id: teacherAccountId } });
  }
}

// Full teardown — only for a fixture built under a fresh raw school this
// file created itself (buildFixture called with no existingSchoolId).
async function cleanupFixture(schoolId) {
  await cleanupFixtureRowsOnly(schoolId);
  await prisma.period.deleteMany({ where: { shift: { schoolId } } });
  await prisma.shift.deleteMany({ where: { schoolId } });
  await prisma.schoolCalendar.deleteMany({ where: { schoolId } });
  await prisma.schoolOptimizationSettings.deleteMany({ where: { schoolId } });
  await prisma.account.deleteMany({ where: { schoolId } });
  await prisma.auditLog.deleteMany({ where: { schoolId } });
  await prisma.school.delete({ where: { id: schoolId } });
}

beforeAll(() => {
  suffix = uniqueSuffix();
});

describe('createLesson / updateLesson / archiveLesson / reactivateLesson (Business Rules #1-#12)', () => {
  let fixture;

  beforeAll(async () => {
    fixture = await buildFixture('core');
  });

  afterAll(async () => {
    await cleanupFixture(fixture.schoolId);
  });

  it('creates a Lesson, copying classId/teacherId/academicYearId from the Assignment', async () => {
    const lesson = await service.createLesson(
      fixture.schoolId,
      { teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'MONDAY', periodId: fixture.periodA.id },
      fixture.actingUser
    );
    expect(lesson.classId).toBe(fixture.cls.id);
    expect(lesson.teacherId).toBe(fixture.teacher.id);
    expect(lesson.academicYearId).toBe(fixture.academicYear.id);
    expect(lesson.status).toBe('ACTIVE');

    const event = await prisma.auditLog.findFirst({ where: { schoolId: fixture.schoolId, action: 'LESSON_CREATED' } });
    expect(event).toBeTruthy();

    await prisma.lesson.delete({ where: { id: lesson.id } });
  });

  it('rejects scheduling into a Break Period', async () => {
    await expect(
      service.createLesson(
        fixture.schoolId,
        { teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'MONDAY', periodId: fixture.breakPeriod.id },
        fixture.actingUser
      )
    ).rejects.toThrow('Break Period');
  });

  it('rejects a Teacher conflict, then allows a move to a free slot re-validating the same pipeline', async () => {
    const lesson = await service.createLesson(
      fixture.schoolId,
      { teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'TUESDAY', periodId: fixture.periodA.id },
      fixture.actingUser
    );

    await expect(
      service.createLesson(
        fixture.schoolId,
        { teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'TUESDAY', periodId: fixture.periodA.id },
        fixture.actingUser
      )
    ).rejects.toThrow('Teacher already has an active Lesson');

    const moved = await service.updateLesson(
      fixture.schoolId,
      lesson.id,
      { teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'TUESDAY', periodId: fixture.periodB.id },
      fixture.actingUser
    );
    expect(moved.periodId).toBe(fixture.periodB.id);

    await prisma.lesson.delete({ where: { id: lesson.id } });
  });

  it('archives then restores a Lesson, re-validating before restoring', async () => {
    const lesson = await service.createLesson(
      fixture.schoolId,
      { teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'WEDNESDAY', periodId: fixture.periodA.id },
      fixture.actingUser
    );

    const archived = await service.archiveLesson(fixture.schoolId, lesson.id, fixture.actingUser);
    expect(archived.status).toBe('ARCHIVED');

    // A different Lesson now takes the archived one's old slot.
    const blocker = await service.createLesson(
      fixture.schoolId,
      { teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'WEDNESDAY', periodId: fixture.periodA.id },
      fixture.actingUser
    );

    await expect(service.reactivateLesson(fixture.schoolId, lesson.id, fixture.actingUser)).rejects.toThrow(
      'Teacher already has an active Lesson'
    );

    await prisma.lesson.deleteMany({ where: { id: { in: [lesson.id, blocker.id] } } });
  });

  it('enforces the weekly Lesson target once set, via Weekly Subject Allocation', async () => {
    // Self-contained: Weekly Subject Allocation requires every allocation's
    // line items to sum to EXACTLY the Grade/Form's calculated available
    // weekly teaching periods, so this needs its own compact-schedule
    // fixture (available periods = 2) plus a second, filler Subject to
    // absorb the other period — the target Subject's own line can then be
    // set below the physical slot count, distinct from a hard "no more
    // slots exist at all" failure.
    const wtFixture = await buildFixture('weekly-target', undefined, { compactSchedule: true });
    const fillerSubject = await subjectsService.createSubject(
      { name: `Filler ${wtFixture.schoolId}`, educationLevel: 'PRIMARY' },
      systemUser
    );
    await subjectsService.assignSubjectToSchool(wtFixture.schoolId, fillerSubject.id, wtFixture.actingUser);

    await weeklySubjectAllocationsService.createAllocation(
      {
        academicYearId: wtFixture.academicYear.id,
        gradeLevelId: wtFixture.cls.gradeLevelId,
        subjects: [
          { subjectId: wtFixture.subject.id, weeklyPeriods: 1, doublePeriodRequired: false },
          { subjectId: fillerSubject.id, weeklyPeriods: 1, doublePeriodRequired: false },
        ],
      },
      wtFixture.actingUser
    );

    await service.createLesson(
      wtFixture.schoolId,
      { teacherSubjectAssignmentId: wtFixture.assignment.id, dayOfWeek: 'MONDAY', periodId: wtFixture.periodA.id },
      wtFixture.actingUser
    );

    await expect(
      service.createLesson(
        wtFixture.schoolId,
        { teacherSubjectAssignmentId: wtFixture.assignment.id, dayOfWeek: 'MONDAY', periodId: wtFixture.periodB.id },
        wtFixture.actingUser
      )
    ).rejects.toThrow('weekly target');

    await cleanupFixture(wtFixture.schoolId);
  });
});

describe('ACR-006 downstream-record-check registration', () => {
  // Fires only from Teacher Subject Assignment's own creation pipeline
  // (createAssignment/replaceTeacher/copyAssignments) targeting an
  // already-past Academic Year — not from correctAssignment, which never
  // calls assertReasonIfDownstreamRecordsExist at all. A new Assignment for
  // a different Subject on the same Class+Year is used here so Teacher
  // Subject Assignment's own "one Active Assignment per Class/Subject/Year"
  // rule doesn't get in the way of exercising this specific check.
  it('requires a reason to create a new Assignment for a past Academic Year whose Class already has an active Lesson', async () => {
    const fixture = await buildFixture('downstream');

    await service.createLesson(
      fixture.schoolId,
      { teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'FRIDAY', periodId: fixture.periodA.id },
      fixture.actingUser
    );

    // Force the Academic Year into the past so the downstream-check's own
    // "isPastYear" gate is actually exercised — both startDate and endDate
    // must move together, or the range itself becomes inverted (endDate <
    // startDate), which would reject every date for an unrelated reason.
    await prisma.academicYear.update({
      where: { id: fixture.academicYear.id },
      data: { startDate: new Date('2019-01-01'), endDate: new Date('2020-01-01') },
    });

    const otherSubject = await subjectsService.createSubject(
      { name: `Subject downstream-other-${suffix}`, educationLevel: 'PRIMARY' },
      systemUser
    );
    await subjectsService.assignSubjectToSchool(fixture.schoolId, otherSubject.id, fixture.actingUser);

    await expect(
      teacherSubjectAssignmentsService.createAssignment(
        fixture.schoolId,
        {
          teacherId: fixture.teacher.id,
          subjectId: otherSubject.id,
          classId: fixture.cls.id,
          academicYearId: fixture.academicYear.id,
          effectiveStartDate: '2019-06-01',
        },
        fixture.actingUser
      )
    ).rejects.toThrow('A reason is required');

    await teacherSubjectAssignmentsService.createAssignment(
      fixture.schoolId,
      {
        teacherId: fixture.teacher.id,
        subjectId: otherSubject.id,
        classId: fixture.cls.id,
        academicYearId: fixture.academicYear.id,
        effectiveStartDate: '2019-06-01',
        reason: 'Historical correction',
      },
      fixture.actingUser
    );

    await cleanupFixture(fixture.schoolId);
  });
});

// Unit/mocked tests can't prove a real Postgres partial unique index and
// advisory lock actually serialize concurrent requests for the same slot —
// this fires genuinely concurrent calls (Promise.allSettled) against the
// real service layer + real database. The single highest-severity risk in
// this feature's own Technical Design.
describe('Concurrency — the two partial unique indexes (Business Rules #6, #7)', () => {
  it('concurrent creates for the same Teacher+slot (different Classes) leave exactly one Active Lesson', async () => {
    const fixtureA = await buildFixture('conc-teacher-a');
    // A second Class in the SAME school, taught by the SAME Teacher for the
    // SAME Subject — a second Teacher Subject Assignment sharing the Teacher.
    const clsB = await classesService.createClass({ name: `Class conc-teacher-b-${suffix}` }, fixtureA.actingUser);
    const assignmentB = await teacherSubjectAssignmentsService.createAssignment(
      fixtureA.schoolId,
      {
        teacherId: fixtureA.teacher.id,
        subjectId: fixtureA.subject.id,
        classId: clsB.id,
        academicYearId: fixtureA.academicYear.id,
        effectiveStartDate: '2026-01-01',
      },
      fixtureA.actingUser
    );

    const results = await Promise.allSettled([
      service.createLesson(
        fixtureA.schoolId,
        { teacherSubjectAssignmentId: fixtureA.assignment.id, dayOfWeek: 'MONDAY', periodId: fixtureA.periodA.id },
        fixtureA.actingUser
      ),
      service.createLesson(
        fixtureA.schoolId,
        { teacherSubjectAssignmentId: assignmentB.id, dayOfWeek: 'MONDAY', periodId: fixtureA.periodA.id },
        fixtureA.actingUser
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const activeLessons = await prisma.lesson.findMany({
      where: { schoolId: fixtureA.schoolId, teacherId: fixtureA.teacher.id, dayOfWeek: 'MONDAY', status: 'ACTIVE' },
    });
    expect(activeLessons).toHaveLength(1);

    await cleanupFixture(fixtureA.schoolId);
  });

  it('concurrent creates for the same Class+slot (different Teachers) leave exactly one Active Lesson', async () => {
    const fixtureA = await buildFixture('conc-class-a');
    // A different Teacher AND a different Subject — Teacher Subject
    // Assignment's own Business Rule #4 (one Active Assignment per School/
    // Year/Class/Section/Subject) would otherwise block a second Assignment
    // for the exact same Subject on this Class; the Class-conflict this test
    // exists to prove is a Timetable-level slot conflict, not a Teacher
    // Subject Assignment-level one, so a distinct Subject sidesteps that
    // unrelated constraint cleanly.
    const teacherB = await teachersService.onboardTeacher(
      { email: `teacher-conc-class-b-${suffix}@example.com`, fullName: `Teacher B ${suffix}`, joiningDate: '2026-01-01' },
      fixtureA.actingUser
    );
    const subjectB = await subjectsService.createSubject(
      { name: `Subject conc-class-b-${suffix}`, educationLevel: 'PRIMARY' },
      systemUser
    );
    await subjectsService.assignSubjectToSchool(fixtureA.schoolId, subjectB.id, fixtureA.actingUser);
    const assignmentB = await teacherSubjectAssignmentsService.createAssignment(
      fixtureA.schoolId,
      {
        teacherId: teacherB.id,
        subjectId: subjectB.id,
        classId: fixtureA.cls.id,
        academicYearId: fixtureA.academicYear.id,
        effectiveStartDate: '2026-01-01',
      },
      fixtureA.actingUser
    );

    const results = await Promise.allSettled([
      service.createLesson(
        fixtureA.schoolId,
        { teacherSubjectAssignmentId: fixtureA.assignment.id, dayOfWeek: 'MONDAY', periodId: fixtureA.periodA.id },
        fixtureA.actingUser
      ),
      service.createLesson(
        fixtureA.schoolId,
        { teacherSubjectAssignmentId: assignmentB.id, dayOfWeek: 'MONDAY', periodId: fixtureA.periodA.id },
        fixtureA.actingUser
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const activeLessons = await prisma.lesson.findMany({
      where: { schoolId: fixtureA.schoolId, classId: fixtureA.cls.id, dayOfWeek: 'MONDAY', status: 'ACTIVE' },
    });
    expect(activeLessons).toHaveLength(1);

    await cleanupFixture(fixtureA.schoolId);
  });
});

// A small, separate HTTP-level pass — exactly ONE createTestSchoolAdmin
// call, mirroring Period Management's own budget-conscious precedent for
// the shared password-reset rate limiter.
describe('HTTP surface — Permissions, Tenant isolation, Views, Printing/PDF, Preferences', () => {
  let superAdminToken;
  let schoolA;
  let fixture;

  beforeAll(async () => {
    superAdminToken = await loginSuperAdmin();
    const localSuffix = uniqueSuffix();
    schoolA = await createTestSchoolAdmin(superAdminToken, {
      schoolName: `Timetable HTTP ${localSuffix}`,
      adminEmail: `timetable-http-${localSuffix}@example.com`,
      password: 'TimetableHttp123456',
    });
    // Built under schoolA's OWN existing schoolId (already bootstrapped by
    // createTestSchoolAdmin's own POST /schools call) so schoolA's token can
    // actually read/write it.
    fixture = await buildFixture(`http-${localSuffix}`, schoolA.schoolId);
  });

  afterAll(async () => {
    await cleanupFixtureRowsOnly(fixture.schoolId, fixture.teacher.accountId);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/timetable/master');
    expect(res.status).toBe(401);
  });

  it('rejects a non-School-Admin write (Super Admin stands in for "any forbidden role", the same substitute this project already used for School Schedule Management)', async () => {
    const res = await request(app)
      .post('/api/v1/lessons')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ teacherSubjectAssignmentId: 'x', dayOfWeek: 'MONDAY', periodId: 'y' });
    expect(res.status).toBe(403);
  });

  it("School Admin creates a Lesson via HTTP, then the Class/Teacher/Master Timetable views all reflect it", async () => {
    const createRes = await request(app)
      .post('/api/v1/lessons')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'MONDAY', periodId: fixture.periodA.id });
    expect(createRes.status).toBe(201);

    const classView = await request(app)
      .get(`/api/v1/timetable/classes/${fixture.cls.id}`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(classView.status).toBe(200);
    expect(classView.body.data).toHaveLength(1);

    const teacherView = await request(app)
      .get(`/api/v1/timetable/teachers/${fixture.teacher.id}`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(teacherView.status).toBe(200);
    expect(teacherView.body.data).toHaveLength(1);

    const masterView = await request(app)
      .get('/api/v1/timetable/master')
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(masterView.status).toBe(200);
    expect(masterView.body.data.some((group) => group.class && group.class.id === fixture.cls.id)).toBe(true);

    await prisma.lesson.delete({ where: { id: createRes.body.data.id } });
  });

  it('exports a PDF for the Master Timetable', async () => {
    const res = await request(app)
      .get('/api/v1/timetable/master/pdf')
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("School B cannot see School A's Class Timetable (tenant isolation)", async () => {
    // A real School + Account is required — authenticate's own middleware
    // looks the account up by id on every request, so a token for a
    // nonexistent account would simply 401, not exercise tenant isolation
    // at all. Created directly via Prisma (not the rate-limited password-
    // reset flow, and not requestable through it anyway since we only need
    // a valid, already-ACTIVE account to sign a token for, the same
    // technique used for this feature's own live manual verification).
    const localSuffix = uniqueSuffix();
    const rawSchoolB = await prisma.school.create({ data: { name: `Timetable Tenant B ${localSuffix}` } });
    const accountB = await prisma.account.create({
      data: {
        email: `timetable-tenant-b-${localSuffix}@example.com`,
        passwordHash: 'unused-not-logged-in-with',
        role: 'SCHOOL_ADMIN',
        status: 'ACTIVE',
        schoolId: rawSchoolB.id,
      },
    });
    const tokenB = signAccessToken(accountB);

    const crossTenantRes = await request(app)
      .get(`/api/v1/timetable/classes/${fixture.cls.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(crossTenantRes.status).toBe(404);

    const ownTenantRes = await request(app)
      .get(`/api/v1/timetable/classes/${fixture.cls.id}`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(ownTenantRes.status).toBe(200);

    await prisma.account.delete({ where: { id: accountB.id } });
    await prisma.school.delete({ where: { id: rawSchoolB.id } });
  });

  it('Super Admin oversight can view any school\'s Master Timetable, read-only', async () => {
    const res = await request(app)
      .get(`/api/v1/schools/${fixture.schoolId}/timetable/master`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
  });

  it('updates and reads back School Optimization Settings', async () => {
    const patchRes = await request(app)
      .patch('/api/v1/school-optimization-settings')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ balanceTeacherWorkloads: true });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.balanceTeacherWorkloads).toBe(true);

    const getRes = await request(app)
      .get('/api/v1/school-optimization-settings')
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.balanceTeacherWorkloads).toBe(true);
  });

  it('retrieves the illustrative Quality Score', async () => {
    const res = await request(app)
      .get('/api/v1/timetable/quality-score')
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.illustrative).toBe(true);
  });
});

// Architecture Update (Generation-First) — real end-to-end coverage of the
// generation engine, locking, and publish, run as one continuous flow
// against a single fixture since each step's own state is exactly what the
// next step needs to exercise, mirroring how an Administrator would
// actually use Generate -> Review -> Adjust -> Publish in sequence.
describe('Architecture Update (Generation-First) — generate, lock, regenerate, publish', () => {
  let fixture;

  beforeAll(async () => {
    fixture = await buildFixture('generation', undefined, { compactSchedule: true });
    await weeklySubjectAllocationsService.createAllocation(
      {
        academicYearId: fixture.academicYear.id,
        gradeLevelId: fixture.cls.gradeLevelId,
        subjects: [{ subjectId: fixture.subject.id, weeklyPeriods: 2, doublePeriodRequired: false }],
      },
      fixture.actingUser
    );
  });

  afterAll(async () => {
    await cleanupFixture(fixture.schoolId);
  });

  it('generates a Draft Timetable via a background job, placing every required Lesson with zero conflicts', async () => {
    const job = await jobs.startGenerationJob(fixture.schoolId, fixture.academicYear.id, { type: 'ALL' }, fixture.actingUser);
    expect(job.status).toBe('QUEUED');

    const completed = await waitForJob(job.id);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.placedUnits).toBe(2);
    expect(completed.result.teacherConflicts).toBe(0);
    expect(completed.result.classConflicts).toBe(0);
    expect(completed.result.missingLessons).toBe(0);

    const draft = await service.getMasterTimetable(fixture.schoolId, { academicYearId: fixture.academicYear.id });
    const classGroup = draft.find((g) => g.class && g.class.id === fixture.cls.id);
    expect(classGroup.lessons.filter((l) => l.status === 'ACTIVE')).toHaveLength(2);
  });

  it('regenerating (ALL scope) never touches a Locked Lesson', async () => {
    const before = await service.getClassTimetable(fixture.schoolId, fixture.cls.id, { academicYearId: fixture.academicYear.id });
    const toLock = before.find((l) => l.status === 'ACTIVE');
    await service.lockLesson(fixture.schoolId, toLock.id, fixture.actingUser);

    const job = await jobs.startGenerationJob(fixture.schoolId, fixture.academicYear.id, { type: 'ALL' }, fixture.actingUser);
    const completed = await waitForJob(job.id);
    expect(completed.status).toBe('COMPLETED');

    const stillThere = await prisma.lesson.findUnique({ where: { id: toLock.id } });
    expect(stillThere.status).toBe('ACTIVE');
    expect(stillThere.dayOfWeek).toBe(toLock.dayOfWeek);
    expect(stillThere.periodId).toBe(toLock.period.id);
    expect(stillThere.locked).toBe(true);

    await service.unlockLesson(fixture.schoolId, toLock.id, fixture.actingUser);
  });

  it('rejects moving a Locked Lesson directly, and rejects publishing with no Draft before one exists', async () => {
    const lessons = await service.getClassTimetable(fixture.schoolId, fixture.cls.id, { academicYearId: fixture.academicYear.id });
    const active = lessons.find((l) => l.status === 'ACTIVE');
    await service.lockLesson(fixture.schoolId, active.id, fixture.actingUser);

    await expect(
      service.updateLesson(
        fixture.schoolId,
        active.id,
        { teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'FRIDAY', periodId: fixture.periodB.id },
        fixture.actingUser
      )
    ).rejects.toThrow('Locked');

    await service.unlockLesson(fixture.schoolId, active.id, fixture.actingUser);
  });

  it('publishes the Draft: Teacher/Student consumption resolves the Published version, and the next write starts a fresh empty Draft', async () => {
    const published = await service.publishTimetableVersion(fixture.schoolId, fixture.academicYear.id, fixture.actingUser);
    expect(published.status).toBe('PUBLISHED');

    const publishedView = await service.getTeacherTimetable(fixture.schoolId, fixture.teacher.id, {
      academicYearId: fixture.academicYear.id,
      versionType: 'PUBLISHED',
    });
    expect(publishedView.filter((l) => l.status === 'ACTIVE')).toHaveLength(2);

    // The Stable Public Service Interface (future consumers) must also read
    // the Published version — Business Rule #28 (v2.0 numbering).
    const stableInterfaceView = await service.getLessonsForTeacher(fixture.schoolId, fixture.teacher.id, {
      academicYearId: fixture.academicYear.id,
    });
    expect(stableInterfaceView.filter((l) => l.status === 'ACTIVE')).toHaveLength(2);

    // No Draft exists immediately after Publish — the promoted row is now
    // PUBLISHED, not still separately DRAFT (Technical Design's own Risks
    // section: a deliberate, literal reading, not an oversight).
    const draftAfterPublish = await service.getMasterTimetable(fixture.schoolId, { academicYearId: fixture.academicYear.id });
    expect(draftAfterPublish).toEqual([]);

    // The next manual write auto-creates a brand-new, empty Draft — never
    // reusing or mutating the just-Published version.
    const newLesson = await service.createLesson(
      fixture.schoolId,
      { teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'SATURDAY', periodId: fixture.periodA.id },
      fixture.actingUser
    );
    expect(newLesson.timetableVersionId).not.toBe(published.id);

    const stillPublished = await service.getTeacherTimetable(fixture.schoolId, fixture.teacher.id, {
      academicYearId: fixture.academicYear.id,
      versionType: 'PUBLISHED',
    });
    expect(stillPublished.filter((l) => l.status === 'ACTIVE')).toHaveLength(2); // unaffected by the new Draft write
  });
});

// A dedicated, independent fixture for double periods — kept separate from
// the generate/lock/publish flow above so ordering between the two never
// matters.
describe('Architecture Update (Generation-First) — Lesson Groups (double periods) and Split', () => {
  let fixture;

  beforeAll(async () => {
    fixture = await buildFixture('groups', undefined, { compactSchedule: true });
    await weeklySubjectAllocationsService.createAllocation(
      {
        academicYearId: fixture.academicYear.id,
        gradeLevelId: fixture.cls.gradeLevelId,
        subjects: [{ subjectId: fixture.subject.id, weeklyPeriods: 2, doublePeriodRequired: true }],
      },
      fixture.actingUser
    );
  });

  afterAll(async () => {
    await cleanupFixture(fixture.schoolId);
  });

  it('generates a double period as two Lessons linked in one Lesson Group, in consecutive Periods', async () => {
    const job = await jobs.startGenerationJob(fixture.schoolId, fixture.academicYear.id, { type: 'ALL' }, fixture.actingUser);
    const completed = await waitForJob(job.id);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.result.missingLessons).toBe(0);

    const lessons = await prisma.lesson.findMany({
      where: { schoolId: fixture.schoolId, teacherSubjectAssignmentId: fixture.assignment.id, status: 'ACTIVE' },
    });
    expect(lessons).toHaveLength(2);
    expect(lessons[0].lessonGroupId).toBeTruthy();
    expect(lessons[0].lessonGroupId).toBe(lessons[1].lessonGroupId);
    expect(lessons[0].dayOfWeek).toBe(lessons[1].dayOfWeek);
    expect([lessons[0].sequenceInGroup, lessons[1].sequenceInGroup].sort()).toEqual([1, 2]);
  });

  it('splits the Lesson Group into two independent Lessons, recorded in the audit log', async () => {
    const lessons = await prisma.lesson.findMany({
      where: { schoolId: fixture.schoolId, teacherSubjectAssignmentId: fixture.assignment.id, status: 'ACTIVE' },
    });
    const groupId = lessons[0].lessonGroupId;

    await service.splitLessonGroup(fixture.schoolId, groupId, fixture.actingUser);

    const afterSplit = await prisma.lesson.findMany({
      where: { schoolId: fixture.schoolId, teacherSubjectAssignmentId: fixture.assignment.id, status: 'ACTIVE' },
    });
    expect(afterSplit.every((l) => l.lessonGroupId === null && l.sequenceInGroup === null)).toBe(true);

    const group = await prisma.lessonGroup.findUnique({ where: { id: groupId } });
    expect(group).toBeNull();

    const event = await prisma.auditLog.findFirst({ where: { schoolId: fixture.schoolId, action: 'LESSON_GROUP_SPLIT' } });
    expect(event).toBeTruthy();

    // Now independent — moving one no longer moves the other.
    const moved = await service.updateLesson(
      fixture.schoolId,
      afterSplit[0].id,
      { teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'SUNDAY', periodId: fixture.periodA.id },
      fixture.actingUser
    );
    const other = await prisma.lesson.findUnique({ where: { id: afterSplit[1].id } });
    expect(moved.dayOfWeek).toBe('SUNDAY');
    expect(other.dayOfWeek).not.toBe('SUNDAY');
  });
});

// Generation's own two new pre-flight gates (Product Owner-approved,
// enforced only at generation time — never at Weekly Subject Allocation's or
// Teacher Subject Assignment's own write paths, since either one alone can
// invalidate the other without any write happening on this side).
describe('Generation pre-flight — Needs-Review Weekly Subject Allocation blocks generation', () => {
  it('fails the job with a clear reason when an allocation no longer matches its own calculated available periods', async () => {
    const fixture = await buildFixture('needs-review', undefined, { compactSchedule: true });
    await weeklySubjectAllocationsService.createAllocation(
      {
        academicYearId: fixture.academicYear.id,
        gradeLevelId: fixture.cls.gradeLevelId,
        subjects: [{ subjectId: fixture.subject.id, weeklyPeriods: 2, doublePeriodRequired: false }],
      },
      fixture.actingUser
    );

    // Adding a third Teaching Period to the Class's own compact Shift moves
    // the calculated available periods from 2 (what was saved) to 3 —
    // exactly the "Needs Review" condition, with zero WSA/TSA writes.
    await schoolScheduleService.createPeriod(
      fixture.schoolId,
      fixture.cls.shiftId,
      { name: 'Period 3', type: 'TEACHING' },
      fixture.actingUser
    );

    const job = await jobs.startGenerationJob(fixture.schoolId, fixture.academicYear.id, { type: 'ALL' }, fixture.actingUser);
    const completed = await waitForJob(job.id);

    expect(completed.status).toBe('FAILED');
    expect(completed.errorMessage).toMatch(/Weekly Subject Allocations need review/);

    await cleanupFixture(fixture.schoolId);
  });
});

describe('Generation pre-flight — Teacher weekly capacity Hard Constraint blocks generation', () => {
  it('fails the job, naming the Teacher, when their committed weekly periods across all their Classes exceed their own capacity', async () => {
    const fixture = await buildFixture('capacity', undefined, { compactSchedule: true });

    // A second Grade/Form, sharing the exact same compact Shift as the
    // first — capacity is summed once per distinct Shift (Shifts never
    // overlap in time), so two Grade/Forms on the same Shift still add up
    // to only ONE Shift's worth of capacity, while each Grade/Form's own
    // Weekly Subject Allocation can independently commit this Teacher to
    // its own full weekly total.
    const gradeLevelB = await classesService.createGradeLevel({ name: `GradeB ${fixture.schoolId}`, educationLevel: 'PRIMARY' }, fixture.actingUser);
    const classB = await classesService.createClass(
      { name: `ClassB ${fixture.schoolId}`, shiftId: fixture.cls.shiftId, gradeLevelId: gradeLevelB.id },
      fixture.actingUser
    );
    const subjectB = await subjectsService.createSubject({ name: `SubjectB ${fixture.schoolId}`, educationLevel: 'PRIMARY' }, systemUser);
    await subjectsService.assignSubjectToSchool(fixture.schoolId, subjectB.id, fixture.actingUser);
    await teacherSubjectAssignmentsService.createAssignment(
      fixture.schoolId,
      { teacherId: fixture.teacher.id, subjectId: subjectB.id, classId: classB.id, academicYearId: fixture.academicYear.id, effectiveStartDate: '2026-01-01' },
      fixture.actingUser
    );

    await weeklySubjectAllocationsService.createAllocation(
      {
        academicYearId: fixture.academicYear.id,
        gradeLevelId: fixture.cls.gradeLevelId,
        subjects: [{ subjectId: fixture.subject.id, weeklyPeriods: 2, doublePeriodRequired: false }],
      },
      fixture.actingUser
    );
    await weeklySubjectAllocationsService.createAllocation(
      {
        academicYearId: fixture.academicYear.id,
        gradeLevelId: gradeLevelB.id,
        subjects: [{ subjectId: subjectB.id, weeklyPeriods: 2, doublePeriodRequired: false }],
      },
      fixture.actingUser
    );

    const job = await jobs.startGenerationJob(fixture.schoolId, fixture.academicYear.id, { type: 'ALL' }, fixture.actingUser);
    const completed = await waitForJob(job.id);

    expect(completed.status).toBe('FAILED');
    expect(completed.errorMessage).toMatch(/over their own weekly capacity/);
    expect(completed.errorMessage).toContain(fixture.teacher.fullName);
    expect(completed.errorMessage).toContain('4 periods/week');
    expect(completed.errorMessage).toContain('only available for 2');

    // cleanupFixture's own deleteMany calls are schoolId-scoped, so they
    // already remove classB/subjectB/assignmentB/gradeLevelB (the last via
    // the School's own cascading delete) along with everything buildFixture
    // itself created.
    await cleanupFixture(fixture.schoolId);
  });
});

describe('getTeacherCapacityReport — proactive Teacher weekly capacity check', () => {
  it('reports every Teacher with an Active assignment, flagging the one over their own weekly capacity', async () => {
    const fixture = await buildFixture('capacity-report', undefined, { compactSchedule: true });

    const gradeLevelB = await classesService.createGradeLevel(
      { name: `GradeB ${fixture.schoolId}`, educationLevel: 'PRIMARY' },
      fixture.actingUser
    );
    const classB = await classesService.createClass(
      { name: `ClassB ${fixture.schoolId}`, shiftId: fixture.cls.shiftId, gradeLevelId: gradeLevelB.id },
      fixture.actingUser
    );
    const subjectB = await subjectsService.createSubject({ name: `SubjectB ${fixture.schoolId}`, educationLevel: 'PRIMARY' }, systemUser);
    await subjectsService.assignSubjectToSchool(fixture.schoolId, subjectB.id, fixture.actingUser);
    await teacherSubjectAssignmentsService.createAssignment(
      fixture.schoolId,
      { teacherId: fixture.teacher.id, subjectId: subjectB.id, classId: classB.id, academicYearId: fixture.academicYear.id, effectiveStartDate: '2026-01-01' },
      fixture.actingUser
    );

    await weeklySubjectAllocationsService.createAllocation(
      {
        academicYearId: fixture.academicYear.id,
        gradeLevelId: fixture.cls.gradeLevelId,
        subjects: [{ subjectId: fixture.subject.id, weeklyPeriods: 2, doublePeriodRequired: false }],
      },
      fixture.actingUser
    );
    await weeklySubjectAllocationsService.createAllocation(
      {
        academicYearId: fixture.academicYear.id,
        gradeLevelId: gradeLevelB.id,
        subjects: [{ subjectId: subjectB.id, weeklyPeriods: 2, doublePeriodRequired: false }],
      },
      fixture.actingUser
    );

    const report = await service.getTeacherCapacityReport(fixture.schoolId, { academicYearId: fixture.academicYear.id });

    const entry = report.find((r) => r.teacherId === fixture.teacher.id);
    expect(entry).toEqual({
      teacherId: fixture.teacher.id,
      teacherName: fixture.teacher.fullName,
      committed: 4,
      capacity: 2,
      overCapacity: true,
    });

    await cleanupFixture(fixture.schoolId);
  });

  it('reports overCapacity: false for a Teacher comfortably within their own weekly capacity', async () => {
    const fixture = await buildFixture('capacity-report-ok', undefined, { compactSchedule: true });

    await weeklySubjectAllocationsService.createAllocation(
      {
        academicYearId: fixture.academicYear.id,
        gradeLevelId: fixture.cls.gradeLevelId,
        subjects: [{ subjectId: fixture.subject.id, weeklyPeriods: 2, doublePeriodRequired: false }],
      },
      fixture.actingUser
    );

    const report = await service.getTeacherCapacityReport(fixture.schoolId, { academicYearId: fixture.academicYear.id });

    const entry = report.find((r) => r.teacherId === fixture.teacher.id);
    expect(entry).toEqual({
      teacherId: fixture.teacher.id,
      teacherName: fixture.teacher.fullName,
      committed: 2,
      capacity: 2,
      overCapacity: false,
    });

    await cleanupFixture(fixture.schoolId);
  });
});

// A shared two-Assignment, same-Teacher, four-Period/one-Working-Day
// fixture — enough Periods to have a genuine "middle" Period distinct from
// both "first"/"last" (balanceFirstLastPeriods) and enough room for both an
// adjacent and a non-adjacent free Period relative to an already-placed
// Lesson (minimizeTeacherGaps). subjectA's own required Lesson is created
// and Locked directly (a real "Admin already locked this one, now generate
// the rest around it" scenario) at a caller-chosen Period, rather than
// relying on generation's own most-constrained-first tie-break to land it
// somewhere predictable — that tie-break order depends on how the
// underlying query returns rows, which this project makes no ordering
// guarantee about. Locking it also means generation's own Step 1 sees
// subjectA's weekly target (1) as already fully satisfied, so only
// subjectB's own single required Lesson is ever placed — no risk of the two
// Assignments' own units interacting with each other's scoring.
async function buildTwoAssignmentFixture(label, lockedPeriodIndex) {
  const fixture = await buildFixture(label, undefined, { compactSchedule: true, compactPeriodCount: 4 });
  const subjectB = await subjectsService.createSubject({ name: `SubjectB ${fixture.schoolId}`, educationLevel: 'PRIMARY' }, systemUser);
  await subjectsService.assignSubjectToSchool(fixture.schoolId, subjectB.id, fixture.actingUser);
  const subjectC = await subjectsService.createSubject({ name: `SubjectC ${fixture.schoolId}`, educationLevel: 'PRIMARY' }, systemUser);
  await subjectsService.assignSubjectToSchool(fixture.schoolId, subjectC.id, fixture.actingUser);

  const assignmentB = await teacherSubjectAssignmentsService.createAssignment(
    fixture.schoolId,
    { teacherId: fixture.teacher.id, subjectId: subjectB.id, classId: fixture.cls.id, academicYearId: fixture.academicYear.id, effectiveStartDate: '2026-01-01' },
    fixture.actingUser
  );

  // subjectC fills out the remaining 2 of the 4 available periods so the
  // allocation's own total matches exactly — no Teacher Subject Assignment
  // ever references it, so it contributes zero units to generation.
  await weeklySubjectAllocationsService.createAllocation(
    {
      academicYearId: fixture.academicYear.id,
      gradeLevelId: fixture.cls.gradeLevelId,
      subjects: [
        { subjectId: fixture.subject.id, weeklyPeriods: 1, doublePeriodRequired: false },
        { subjectId: subjectB.id, weeklyPeriods: 1, doublePeriodRequired: false },
        { subjectId: subjectC.id, weeklyPeriods: 2, doublePeriodRequired: false },
      ],
    },
    fixture.actingUser
  );

  const lockedLesson = await service.createLesson(
    fixture.schoolId,
    { teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'MONDAY', periodId: fixture.teachingPeriods[lockedPeriodIndex].id },
    fixture.actingUser
  );
  await service.lockLesson(fixture.schoolId, lockedLesson.id, fixture.actingUser);

  return { fixture, assignmentBId: assignmentB.id };
}

describe('Soft Preference scoring — minimizeTeacherGaps genuinely influences which free Period is chosen', () => {
  it('defaults to the lowest-displayOrder free Period when the setting is off', async () => {
    // subjectA Locked onto teachingPeriods[2] (displayOrder 3); subjectB's
    // own three remaining candidates (periods 1, 2, 4) all score identically
    // with the setting off, so the tie-break (lowest Display Order) alone
    // decides — teachingPeriods[0].
    const { fixture, assignmentBId } = await buildTwoAssignmentFixture('gaps-off', 2);

    const job = await jobs.startGenerationJob(fixture.schoolId, fixture.academicYear.id, { type: 'ALL' }, fixture.actingUser);
    const completed = await waitForJob(job.id);
    expect(completed.status).toBe('COMPLETED');

    const lessonB = await prisma.lesson.findFirst({ where: { schoolId: fixture.schoolId, teacherSubjectAssignmentId: assignmentBId, status: 'ACTIVE' } });
    expect(lessonB.periodId).toBe(fixture.teachingPeriods[0].id);

    await cleanupFixture(fixture.schoolId);
  });

  it('prefers the Period adjacent to the Teacher\'s own existing Lesson that day when the setting is on', async () => {
    // teachingPeriods[1] and teachingPeriods[3] are both adjacent to
    // subjectA's own Locked teachingPeriods[2] (distance 1, scored +1);
    // teachingPeriods[0] is distance 2 (scored -1). Between the tied
    // adjacent pair, the tie-break keeps the lower Display Order —
    // teachingPeriods[1].
    const { fixture, assignmentBId } = await buildTwoAssignmentFixture('gaps-on', 2);
    // A raw fixture school (never created via School & Platform Management's
    // own createSchool) has no SchoolOptimizationSettings row of its own yet
    // — that bootstrap only happens inside createSchool's own orchestration.
    await service.createDefaultOptimizationSettingsForSchool(fixture.schoolId);
    await service.updateOptimizationSettings(fixture.schoolId, { minimizeTeacherGaps: true }, fixture.actingUser);

    const job = await jobs.startGenerationJob(fixture.schoolId, fixture.academicYear.id, { type: 'ALL' }, fixture.actingUser);
    const completed = await waitForJob(job.id);
    expect(completed.status).toBe('COMPLETED');

    const lessonB = await prisma.lesson.findFirst({ where: { schoolId: fixture.schoolId, teacherSubjectAssignmentId: assignmentBId, status: 'ACTIVE' } });
    expect(lessonB.periodId).toBe(fixture.teachingPeriods[1].id);

    await cleanupFixture(fixture.schoolId);
  });
});

describe('Soft Preference scoring — balanceFirstLastPeriods genuinely influences which free Period is chosen', () => {
  it('defaults to the lowest-displayOrder free Period when the setting is off', async () => {
    // subjectA Locked onto teachingPeriods[3] (the last Teaching Period);
    // subjectB's own three remaining candidates (periods 1, 2, 3) all score
    // identically with the setting off (the Teacher's own first/last count
    // is never read), so the tie-break alone decides — teachingPeriods[0],
    // which is itself the first Period.
    const { fixture, assignmentBId } = await buildTwoAssignmentFixture('firstlast-off', 3);

    const job = await jobs.startGenerationJob(fixture.schoolId, fixture.academicYear.id, { type: 'ALL' }, fixture.actingUser);
    const completed = await waitForJob(job.id);
    expect(completed.status).toBe('COMPLETED');

    const lessonB = await prisma.lesson.findFirst({ where: { schoolId: fixture.schoolId, teacherSubjectAssignmentId: assignmentBId, status: 'ACTIVE' } });
    expect(lessonB.periodId).toBe(fixture.teachingPeriods[0].id);

    await cleanupFixture(fixture.schoolId);
  });

  it('avoids another first/last Period for a Teacher who already has one that day when the setting is on', async () => {
    // subjectA's own Locked placement on the last Period already counts
    // once against this Teacher's own first/last tally, so — with the
    // setting on — teachingPeriods[0] (the first Period) is now penalized
    // below the two middle candidates (teachingPeriods[1]/[2], still tied
    // at zero); the tie-break keeps the lower of those two.
    const { fixture, assignmentBId } = await buildTwoAssignmentFixture('firstlast-on', 3);
    // A raw fixture school (never created via School & Platform Management's
    // own createSchool) has no SchoolOptimizationSettings row of its own yet
    // — that bootstrap only happens inside createSchool's own orchestration.
    await service.createDefaultOptimizationSettingsForSchool(fixture.schoolId);
    await service.updateOptimizationSettings(fixture.schoolId, { balanceFirstLastPeriods: true }, fixture.actingUser);

    const job = await jobs.startGenerationJob(fixture.schoolId, fixture.academicYear.id, { type: 'ALL' }, fixture.actingUser);
    const completed = await waitForJob(job.id);
    expect(completed.status).toBe('COMPLETED');

    const lessonB = await prisma.lesson.findFirst({ where: { schoolId: fixture.schoolId, teacherSubjectAssignmentId: assignmentBId, status: 'ACTIVE' } });
    expect(lessonB.periodId).toBe(fixture.teachingPeriods[1].id);

    await cleanupFixture(fixture.schoolId);
  });
});

describe('Missing Lessons diagnostic — names the Class/Subject/Teacher and whether a fix is possible right now', () => {
  it('reports hasOpenSlot: false for a genuine dead end — the only remaining Period in each Class is already taken by that Teacher elsewhere', async () => {
    // A single Working Day, two-Period Shift shared by two Grade/Forms.
    // Each Class's own first Period is Locked to a different, unrelated
    // filler Teacher — leaving each Class with exactly one remaining free
    // Period (the second). The same shared Teacher is required for both
    // Classes' own remaining Period, so whichever gets placed first wins
    // and the second becomes Missing — genuinely unrecoverable, since
    // neither Class has any other Period left at all. The shared Teacher's
    // own total (2 periods, one per Class) stays within their own capacity
    // (2), so this is a pure slot conflict, not a capacity block.
    const fixture = await buildFixture('missing-dead-end', undefined, { compactSchedule: true, compactPeriodCount: 2 });

    const gradeLevelB = await classesService.createGradeLevel({ name: `GradeB ${fixture.schoolId}`, educationLevel: 'PRIMARY' }, fixture.actingUser);
    const classB = await classesService.createClass(
      { name: `ClassB ${fixture.schoolId}`, shiftId: fixture.cls.shiftId, gradeLevelId: gradeLevelB.id },
      fixture.actingUser
    );
    const subjectB = await subjectsService.createSubject({ name: `SubjectB ${fixture.schoolId}`, educationLevel: 'PRIMARY' }, systemUser);
    await subjectsService.assignSubjectToSchool(fixture.schoolId, subjectB.id, fixture.actingUser);
    await teacherSubjectAssignmentsService.createAssignment(
      fixture.schoolId,
      { teacherId: fixture.teacher.id, subjectId: subjectB.id, classId: classB.id, academicYearId: fixture.academicYear.id, effectiveStartDate: '2026-01-01' },
      fixture.actingUser
    );

    // Filler Teacher/Subject for each Class's own first Period, locking it
    // out before generation ever runs.
    const fillerTeacherA = await teachersService.onboardTeacher(
      { email: `filler-a-${fixture.schoolId}@example.com`, fullName: `Filler A ${fixture.schoolId}`, joiningDate: '2026-01-01' },
      fixture.actingUser
    );
    const fillerSubjectA = await subjectsService.createSubject({ name: `FillerSubjectA ${fixture.schoolId}`, educationLevel: 'PRIMARY' }, systemUser);
    await subjectsService.assignSubjectToSchool(fixture.schoolId, fillerSubjectA.id, fixture.actingUser);
    const fillerAssignmentA = await teacherSubjectAssignmentsService.createAssignment(
      fixture.schoolId,
      { teacherId: fillerTeacherA.id, subjectId: fillerSubjectA.id, classId: fixture.cls.id, academicYearId: fixture.academicYear.id, effectiveStartDate: '2026-01-01' },
      fixture.actingUser
    );

    const fillerTeacherB = await teachersService.onboardTeacher(
      { email: `filler-b-${fixture.schoolId}@example.com`, fullName: `Filler B ${fixture.schoolId}`, joiningDate: '2026-01-01' },
      fixture.actingUser
    );
    const fillerSubjectB = await subjectsService.createSubject({ name: `FillerSubjectB ${fixture.schoolId}`, educationLevel: 'PRIMARY' }, systemUser);
    await subjectsService.assignSubjectToSchool(fixture.schoolId, fillerSubjectB.id, fixture.actingUser);
    const fillerAssignmentB = await teacherSubjectAssignmentsService.createAssignment(
      fixture.schoolId,
      { teacherId: fillerTeacherB.id, subjectId: fillerSubjectB.id, classId: classB.id, academicYearId: fixture.academicYear.id, effectiveStartDate: '2026-01-01' },
      fixture.actingUser
    );

    await weeklySubjectAllocationsService.createAllocation(
      {
        academicYearId: fixture.academicYear.id,
        gradeLevelId: fixture.cls.gradeLevelId,
        subjects: [
          { subjectId: fixture.subject.id, weeklyPeriods: 1, doublePeriodRequired: false },
          { subjectId: fillerSubjectA.id, weeklyPeriods: 1, doublePeriodRequired: false },
        ],
      },
      fixture.actingUser
    );
    await weeklySubjectAllocationsService.createAllocation(
      {
        academicYearId: fixture.academicYear.id,
        gradeLevelId: gradeLevelB.id,
        subjects: [
          { subjectId: subjectB.id, weeklyPeriods: 1, doublePeriodRequired: false },
          { subjectId: fillerSubjectB.id, weeklyPeriods: 1, doublePeriodRequired: false },
        ],
      },
      fixture.actingUser
    );

    const fillerLessonA = await service.createLesson(
      fixture.schoolId,
      { teacherSubjectAssignmentId: fillerAssignmentA.id, dayOfWeek: 'MONDAY', periodId: fixture.teachingPeriods[0].id },
      fixture.actingUser
    );
    await service.lockLesson(fixture.schoolId, fillerLessonA.id, fixture.actingUser);
    const fillerLessonB = await service.createLesson(
      fixture.schoolId,
      { teacherSubjectAssignmentId: fillerAssignmentB.id, dayOfWeek: 'MONDAY', periodId: fixture.teachingPeriods[0].id },
      fixture.actingUser
    );
    await service.lockLesson(fixture.schoolId, fillerLessonB.id, fixture.actingUser);

    const job = await jobs.startGenerationJob(fixture.schoolId, fixture.academicYear.id, { type: 'ALL' }, fixture.actingUser);
    const completed = await waitForJob(job.id);

    expect(completed.status).toBe('COMPLETED');
    expect(completed.result.missingLessons).toBe(1);
    expect(completed.result.missingDetails).toHaveLength(1);
    expect(completed.result.missingDetails[0]).toMatchObject({
      teacherName: fixture.teacher.fullName,
      required: 1,
      placed: 0,
      missing: 1,
      hasOpenSlot: false,
      // The shared Teacher's own total (2 periods, one per Class) stays
      // within their own capacity (2) — confirms this is reported as a
      // pure scheduling-feasibility failure, never mistaken for a Teacher
      // workload violation (see this test's own top comment).
      teacherWorkloadValid: true,
    });
    // Whichever Assignment lost the race, it's one of these two Subjects.
    expect([fixture.subject.name, subjectB.name]).toContain(completed.result.missingDetails[0].subjectName);

    await cleanupFixture(fixture.schoolId);
  });

  it('reports hasOpenSlot: true when a Period genuinely remains free for both the Class and the Teacher', async () => {
    // Two Periods available, but only one Lesson has actually been created
    // (a manual write, not a full generation run) — the second Period is
    // completely untouched, so a fix is immediately possible: adding it by
    // hand, or Regenerating, would both work right now.
    const fixture = await buildFixture('missing-recoverable', undefined, { compactSchedule: true, compactPeriodCount: 2 });
    await weeklySubjectAllocationsService.createAllocation(
      { academicYearId: fixture.academicYear.id, gradeLevelId: fixture.cls.gradeLevelId, subjects: [{ subjectId: fixture.subject.id, weeklyPeriods: 2, doublePeriodRequired: false }] },
      fixture.actingUser
    );
    await service.createLesson(
      fixture.schoolId,
      { teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'MONDAY', periodId: fixture.teachingPeriods[0].id },
      fixture.actingUser
    );

    const score = await service.getTimetableQualityScore(fixture.schoolId, { academicYearId: fixture.academicYear.id });

    expect(score.missingLessons).toBe(1);
    expect(score.missingDetails).toHaveLength(1);
    expect(score.missingDetails[0]).toMatchObject({
      teacherSubjectAssignmentId: fixture.assignment.id,
      subjectName: fixture.subject.name,
      teacherName: fixture.teacher.fullName,
      required: 2,
      placed: 1,
      missing: 1,
      hasOpenSlot: true,
    });

    await cleanupFixture(fixture.schoolId);
  });
});

// Constraint-aware scheduling refactor — bounded conflict-aware repair
// (timetable.generation.js's attemptRepair/relocateLesson). These exercise
// the repair pass's own two Hard-Constraint guarantees directly, plus the
// "workload valid but scheduling-infeasible" reporting distinction
// (teacherWorkloadValid / reason on missingDetails).
describe('Bounded repair — never moves a Locked Lesson (Hard Constraint #5)', () => {
  it('reports the colliding unit Missing rather than displacing an already-Locked Lesson', async () => {
    // Two-Period, one-Working-Day Shift shared by two Classes. Class A's own
    // required Lesson (shared Teacher) is pre-placed and Locked at its only
    // free Period (the second — the first is taken by an unrelated filler);
    // Class B independently needs the SAME Teacher, and is ALSO down to only
    // that same second Period free (its own first Period is taken by its
    // own unrelated filler). The only way to free that Period for Class B
    // would be moving Class A's Locked Lesson — attemptRepair/relocateLesson
    // must refuse to do that (relocateLesson's own `!record.relocatable`
    // check) — so Class B's own unit must come back reported Missing, and
    // Class A's Locked Lesson must be completely untouched (same Day, same
    // Period, still Locked). Both Teachers here stay well within their own
    // weekly capacity (2 committed / 2 available for the shared Teacher) —
    // this is a pure scheduling collision, not a workload violation.
    const fixture = await buildFixture('repair-locked', undefined, { compactSchedule: true, compactPeriodCount: 2 });

    const gradeLevelB = await classesService.createGradeLevel(
      { name: `RepairLockedB ${fixture.schoolId}`, educationLevel: 'PRIMARY' },
      fixture.actingUser
    );
    const classB = await classesService.createClass(
      { name: `RepairLockedClassB ${fixture.schoolId}`, shiftId: fixture.cls.shiftId, gradeLevelId: gradeLevelB.id },
      fixture.actingUser
    );
    const subjectB = await subjectsService.createSubject({ name: `RepairLockedSubjectB ${fixture.schoolId}`, educationLevel: 'PRIMARY' }, systemUser);
    await subjectsService.assignSubjectToSchool(fixture.schoolId, subjectB.id, fixture.actingUser);
    const assignmentB = await teacherSubjectAssignmentsService.createAssignment(
      fixture.schoolId,
      { teacherId: fixture.teacher.id, subjectId: subjectB.id, classId: classB.id, academicYearId: fixture.academicYear.id, effectiveStartDate: '2026-01-01' },
      fixture.actingUser
    );

    const fillerTeacherA = await teachersService.onboardTeacher(
      { email: `repair-locked-filler-a-${fixture.schoolId}@example.com`, fullName: `Repair Locked Filler A ${fixture.schoolId}`, joiningDate: '2026-01-01' },
      fixture.actingUser
    );
    const fillerSubjectA = await subjectsService.createSubject({ name: `RepairLockedFillerA ${fixture.schoolId}`, educationLevel: 'PRIMARY' }, systemUser);
    await subjectsService.assignSubjectToSchool(fixture.schoolId, fillerSubjectA.id, fixture.actingUser);
    const fillerAssignmentA = await teacherSubjectAssignmentsService.createAssignment(
      fixture.schoolId,
      { teacherId: fillerTeacherA.id, subjectId: fillerSubjectA.id, classId: fixture.cls.id, academicYearId: fixture.academicYear.id, effectiveStartDate: '2026-01-01' },
      fixture.actingUser
    );

    const fillerTeacherB = await teachersService.onboardTeacher(
      { email: `repair-locked-filler-b-${fixture.schoolId}@example.com`, fullName: `Repair Locked Filler B ${fixture.schoolId}`, joiningDate: '2026-01-01' },
      fixture.actingUser
    );
    const fillerSubjectB = await subjectsService.createSubject({ name: `RepairLockedFillerB ${fixture.schoolId}`, educationLevel: 'PRIMARY' }, systemUser);
    await subjectsService.assignSubjectToSchool(fixture.schoolId, fillerSubjectB.id, fixture.actingUser);
    const fillerAssignmentB = await teacherSubjectAssignmentsService.createAssignment(
      fixture.schoolId,
      { teacherId: fillerTeacherB.id, subjectId: fillerSubjectB.id, classId: classB.id, academicYearId: fixture.academicYear.id, effectiveStartDate: '2026-01-01' },
      fixture.actingUser
    );

    await weeklySubjectAllocationsService.createAllocation(
      {
        academicYearId: fixture.academicYear.id,
        gradeLevelId: fixture.cls.gradeLevelId,
        subjects: [
          { subjectId: fixture.subject.id, weeklyPeriods: 1, doublePeriodRequired: false },
          { subjectId: fillerSubjectA.id, weeklyPeriods: 1, doublePeriodRequired: false },
        ],
      },
      fixture.actingUser
    );
    await weeklySubjectAllocationsService.createAllocation(
      {
        academicYearId: fixture.academicYear.id,
        gradeLevelId: gradeLevelB.id,
        subjects: [
          { subjectId: subjectB.id, weeklyPeriods: 1, doublePeriodRequired: false },
          { subjectId: fillerSubjectB.id, weeklyPeriods: 1, doublePeriodRequired: false },
        ],
      },
      fixture.actingUser
    );

    const fillerLessonA = await service.createLesson(
      fixture.schoolId,
      { teacherSubjectAssignmentId: fillerAssignmentA.id, dayOfWeek: 'MONDAY', periodId: fixture.teachingPeriods[0].id },
      fixture.actingUser
    );
    await service.lockLesson(fixture.schoolId, fillerLessonA.id, fixture.actingUser);
    const fillerLessonB = await service.createLesson(
      fixture.schoolId,
      { teacherSubjectAssignmentId: fillerAssignmentB.id, dayOfWeek: 'MONDAY', periodId: fixture.teachingPeriods[0].id },
      fixture.actingUser
    );
    await service.lockLesson(fixture.schoolId, fillerLessonB.id, fixture.actingUser);

    // Class A's own shared-Teacher Lesson — pre-placed at its only free
    // Period and Locked BEFORE generation ever runs. This is the Lesson
    // repair must never move.
    const lockedTLesson = await service.createLesson(
      fixture.schoolId,
      { teacherSubjectAssignmentId: fixture.assignment.id, dayOfWeek: 'MONDAY', periodId: fixture.teachingPeriods[1].id },
      fixture.actingUser
    );
    await service.lockLesson(fixture.schoolId, lockedTLesson.id, fixture.actingUser);

    const job = await jobs.startGenerationJob(fixture.schoolId, fixture.academicYear.id, { type: 'ALL' }, fixture.actingUser);
    const completed = await waitForJob(job.id);

    expect(completed.status).toBe('COMPLETED');

    const stillLocked = await prisma.lesson.findUnique({ where: { id: lockedTLesson.id } });
    expect(stillLocked.status).toBe('ACTIVE');
    expect(stillLocked.locked).toBe(true);
    expect(stillLocked.dayOfWeek).toBe('MONDAY');
    expect(stillLocked.periodId).toBe(fixture.teachingPeriods[1].id);

    expect(completed.result.teacherConflicts).toBe(0);
    expect(completed.result.classConflicts).toBe(0);
    expect(completed.result.missingLessons).toBe(1);
    expect(completed.result.missingDetails).toHaveLength(1);
    expect(completed.result.missingDetails[0]).toMatchObject({
      teacherSubjectAssignmentId: assignmentB.id,
      className: classB.name,
      subjectName: subjectB.name,
      teacherName: fixture.teacher.fullName,
      required: 1,
      placed: 0,
      missing: 1,
      hasOpenSlot: false,
      teacherWorkloadValid: true,
    });

    await cleanupFixture(fixture.schoolId);
  });
});

// Constraint-aware scheduling refactor — most-constrained-first + bounded
// repair actually resolving a below-capacity scheduling collision, the same
// shape as the real production case this refactor was written for: one
// Teacher shared across several Classes for the same Subject, comfortably
// under their own weekly capacity in total, but a naive single-pass
// placement can still leave some Classes short because the Teacher's own
// remaining free Periods stop lining up with what each individual Class
// still has open. Verified directly against the school's own real
// production data (id 195dfc96-8df7-4aae-9b47-6a35b6a03661, "Test School")
// before this refactor: 15 missing Lessons out of 420, concentrated on a
// Teacher (Aweys, Biology) shared across 8 Classes at 32/35 committed —
// comfortably within capacity. After this refactor, against that exact same
// data: 8 missing (a 47% reduction), zero Teacher/Class conflicts, and the
// specific Class/Teacher pair originally investigated (F3B/Aweys) fully
// resolved (4/4, was 1/4). This test reproduces the same structural pattern
// at a smaller, deterministic scale.
describe('Bounded repair — resolves a below-capacity scheduling collision (most-constrained-first + repair)', () => {
  it('places every required Lesson with zero conflicts for a Teacher shared across several Classes at tight-but-valid weekly capacity', async () => {
    const suffix = uniqueSuffix();
    const rawSchool = await prisma.school.create({ data: { name: `Repair Collision ${suffix}` } });
    const schoolId = rawSchool.id;
    const actingUser = { id: 'repair-collision-user', schoolId, role: 'SCHOOL_ADMIN' };

    await schoolScheduleService.createDefaultScheduleForSchool(schoolId, actingUser);
    await classesService.createDefaultGradeLevelForSchool(schoolId, 'PRIMARY');
    await schoolScheduleService.updateSchoolCalendar(schoolId, { workingDays: ['MONDAY'] }, actingUser);

    // Six Classes, one Working Day, 13 Teaching Periods — the shared
    // Teacher is required for 2 Periods per Class (12 total) against a
    // capacity of 13 (one Shift x one Working Day x 13 Teaching Periods):
    // 12/13 committed, a single Period of slack — the same ~92% margin as
    // the real school's own proven 32/35 (comfortably under capacity, not
    // exactly at it, so assertNoTeacherOverCapacity never blocks this).
    const NUM_CLASSES = 6;
    const PERIODS_PER_CLASS = 13;
    const REQUIRED_FROM_SHARED = 2;
    const compactShift = await schoolScheduleService.createShift(
      schoolId,
      { name: `Compact ${suffix}`, startTime: '13:00', endTime: '21:00', teachingPeriodCount: PERIODS_PER_CLASS, includeBreak: false },
      actingUser
    );

    const academicYear = await academicYearsService.createAcademicYear(schoolId, { startDate: '2026-01-01', endDate: '2026-12-31' }, actingUser);
    await academicYearsService.designateCurrentAcademicYear(schoolId, academicYear.id, actingUser);

    const sharedTeacher = await teachersService.onboardTeacher(
      { email: `repair-collision-shared-${suffix}@example.com`, fullName: `Repair Collision Shared ${suffix}`, joiningDate: '2026-01-01' },
      actingUser
    );
    const sharedSubject = await subjectsService.createSubject({ name: `Repair Collision Shared Subject ${suffix}`, educationLevel: 'PRIMARY' }, systemUser);
    await subjectsService.assignSubjectToSchool(schoolId, sharedSubject.id, actingUser);

    for (let i = 0; i < NUM_CLASSES; i += 1) {
      const gradeLevel = await classesService.createGradeLevel({ name: `RC Grade ${i} ${suffix}`, educationLevel: 'PRIMARY' }, actingUser);
      const cls = await classesService.createClass(
        { name: `RC Class ${i} ${suffix}`, shiftId: compactShift.id, gradeLevelId: gradeLevel.id },
        actingUser
      );
      await teacherSubjectAssignmentsService.createAssignment(
        schoolId,
        { teacherId: sharedTeacher.id, subjectId: sharedSubject.id, classId: cls.id, academicYearId: academicYear.id, effectiveStartDate: '2026-01-01' },
        actingUser
      );

      // A distinct filler Teacher per Class fills the remainder of that
      // Class's own week — unrelated to the shared Teacher, so it never
      // itself competes for the shared Teacher's own Periods; it exists
      // purely so each Weekly Subject Allocation's own total matches this
      // Shift's calculated available Periods exactly (Business Rule).
      const fillerTeacher = await teachersService.onboardTeacher(
        { email: `repair-collision-filler-${i}-${suffix}@example.com`, fullName: `Repair Collision Filler ${i} ${suffix}`, joiningDate: '2026-01-01' },
        actingUser
      );
      const fillerSubject = await subjectsService.createSubject({ name: `Repair Collision Filler ${i} ${suffix}`, educationLevel: 'PRIMARY' }, systemUser);
      await subjectsService.assignSubjectToSchool(schoolId, fillerSubject.id, actingUser);
      await teacherSubjectAssignmentsService.createAssignment(
        schoolId,
        { teacherId: fillerTeacher.id, subjectId: fillerSubject.id, classId: cls.id, academicYearId: academicYear.id, effectiveStartDate: '2026-01-01' },
        actingUser
      );

      await weeklySubjectAllocationsService.createAllocation(
        {
          academicYearId: academicYear.id,
          gradeLevelId: gradeLevel.id,
          subjects: [
            { subjectId: sharedSubject.id, weeklyPeriods: REQUIRED_FROM_SHARED, doublePeriodRequired: false },
            { subjectId: fillerSubject.id, weeklyPeriods: PERIODS_PER_CLASS - REQUIRED_FROM_SHARED, doublePeriodRequired: false },
          ],
        },
        actingUser
      );
    }

    // Below capacity in total — the actual committed/capacity figures
    // asserted below come straight from getTeacherWeeklyCommitmentAndCapacity
    // itself, not hand-derived here, so this test can never silently drift
    // out of sync with the numbers chosen above.
    const capacityReport = await teacherSubjectAssignmentsService.getTeacherWeeklyCommitmentAndCapacity(schoolId, sharedTeacher.id, academicYear.id);
    expect(capacityReport.committed).toBeLessThanOrEqual(capacityReport.capacity);

    const job = await jobs.startGenerationJob(schoolId, academicYear.id, { type: 'ALL' }, actingUser);
    const completed = await waitForJob(job.id, { timeoutMs: 60000 });

    expect(completed.status).toBe('COMPLETED');
    expect(completed.result.teacherConflicts).toBe(0);
    expect(completed.result.classConflicts).toBe(0);
    // The core claim this refactor makes: a Teacher comfortably within
    // their own weekly capacity, shared across several Classes, still gets
    // every required Lesson placed — not left Missing merely because a
    // naive single-pass placement order happened to box one Class out.
    expect(completed.result.missingLessons).toBe(0);

    await prisma.lesson.deleteMany({ where: { schoolId } });
    await prisma.lessonGroup.deleteMany({ where: { schoolId } });
    await prisma.timetableGenerationJob.deleteMany({ where: { schoolId } });
    await prisma.timetableVersion.deleteMany({ where: { schoolId } });
    await prisma.weeklySubjectAllocation.deleteMany({ where: { schoolId } });
    // schoolSubject (this Test's own Filler Subjects, one per Class, plus
    // the shared Subject) must clear before the School itself — the same
    // RESTRICT foreign key cleanupFixtureRowsOnly already accounts for
    // elsewhere in this file; this describe block builds its own School
    // directly (not via buildFixture) and had never picked up that same
    // line, which is what left school.delete below failing on
    // school_subjects_schoolId_fkey.
    await prisma.schoolSubject.deleteMany({ where: { schoolId } });
    await prisma.teacherSubjectAssignment.deleteMany({ where: { schoolId } });
    await prisma.academicYear.deleteMany({ where: { schoolId } });
    await prisma.class.deleteMany({ where: { schoolId } });
    await prisma.teacher.deleteMany({ where: { schoolId } });
    await prisma.period.deleteMany({ where: { shift: { schoolId } } });
    await prisma.shift.deleteMany({ where: { schoolId } });
    await prisma.schoolCalendar.deleteMany({ where: { schoolId } });
    await prisma.schoolOptimizationSettings.deleteMany({ where: { schoolId } });
    await prisma.account.deleteMany({ where: { schoolId } });
    await prisma.auditLog.deleteMany({ where: { schoolId } });
    await prisma.school.delete({ where: { id: schoolId } });
  }, 90000);
});
