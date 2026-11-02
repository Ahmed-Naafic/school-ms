// Integration tests against the real Express app and dev database. See
// ../../shared/test-helpers.js — self-contained, creates fresh Schools/School
// Admins per run rather than depending on manually-created fixtures.
const { app, request, loginSuperAdmin, createTestSchoolAdmin, uniqueSuffix } = require('../../shared/test-helpers');
const prisma = require('../../config/database');
const service = require('./teacher-subject-assignments.service');

jest.setTimeout(30000);

let superAdminToken;
let schoolA;
let schoolB;
let suffix;

// Shared fixtures for School A: one Subject assigned to the school, one
// ACTIVE Teacher, one Class with no Sections (whole-Class assignments), one
// Class with a Section (Section-required assignments), and one Academic Year
// covering both.
let subject;
let teacherId;
let wholeClassId;
let sectionedClassId;
let sectionId;
let academicYearId;

async function createSubjectAndAssign(name, schoolId) {
  const created = await request(app)
    .post('/api/v1/subjects')
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({ name, educationLevel: 'PRIMARY' });
  await request(app)
    .post(`/api/v1/schools/${schoolId}/subjects/${created.body.data.id}`)
    .set('Authorization', `Bearer ${superAdminToken}`);
  return created.body.data;
}

async function onboardTeacher(token, email) {
  const res = await request(app)
    .post('/api/v1/teachers')
    .set('Authorization', `Bearer ${token}`)
    .send({ email, fullName: 'A Teacher', joiningDate: '2026-01-15' });
  return res.body.data;
}

async function createClass(token, name) {
  const res = await request(app).post('/api/v1/classes').set('Authorization', `Bearer ${token}`).send({ name });
  return res.body.data;
}

async function createAcademicYear(token, startDate, endDate) {
  const res = await request(app)
    .post('/api/v1/academic-years')
    .set('Authorization', `Bearer ${token}`)
    .send({ startDate, endDate });
  return res.body.data;
}

beforeAll(async () => {
  superAdminToken = await loginSuperAdmin();
  suffix = uniqueSuffix();

  schoolA = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `TSA IT A ${suffix}`,
    adminEmail: `tsa-it-a-${suffix}@example.com`,
    password: 'TsaIT123456',
  });
  schoolB = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `TSA IT B ${suffix}`,
    adminEmail: `tsa-it-b-${suffix}@example.com`,
    password: 'TsaIT123456',
  });

  subject = await createSubjectAndAssign(`TSA Subject ${suffix}`, schoolA.schoolId);

  const teacher = await onboardTeacher(schoolA.token, `tsa-teacher-${suffix}@example.com`);
  teacherId = teacher.id;

  const wholeClass = await createClass(schoolA.token, `TSA Whole Class ${suffix}`);
  wholeClassId = wholeClass.id;

  const sectionedClass = await createClass(schoolA.token, `TSA Sectioned Class ${suffix}`);
  sectionedClassId = sectionedClass.id;
  const sectionRes = await request(app)
    .post(`/api/v1/classes/${sectionedClassId}/sections`)
    .set('Authorization', `Bearer ${schoolA.token}`)
    .send({ name: 'A' });
  sectionId = sectionRes.body.data.id;

  const academicYear = await createAcademicYear(schoolA.token, '2026-01-01', '2026-12-31');
  academicYearId = academicYear.id;
});

describe('Permissions', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/teacher-subject-assignments');
    expect(res.status).toBe(401);
  });

  it('rejects a Super Admin — no operational role here', async () => {
    const res = await request(app)
      .get('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Create Assignment (Business Rules #4, #7, #14, #15, #16, #23)', () => {
  it('creates a whole-Class assignment, defaulting Academic Year to Current', async () => {
    const res = await request(app)
      .post('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({
        teacherId,
        subjectId: subject.id,
        classId: wholeClassId,
        effectiveStartDate: '2026-02-01',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.academicYearId).toBe(academicYearId);
  });

  it('rejects a second Active assignment for the exact same scope (Business Rule #4)', async () => {
    const res = await request(app)
      .post('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({
        teacherId,
        subjectId: subject.id,
        classId: wholeClassId,
        academicYearId,
        effectiveStartDate: '2026-03-01',
      });
    expect(res.status).toBe(409);
  });

  it('requires a Section once the Class has active Sections (Business Rule #23)', async () => {
    const res = await request(app)
      .post('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({
        teacherId,
        subjectId: subject.id,
        classId: sectionedClassId,
        academicYearId,
        effectiveStartDate: '2026-02-01',
      });
    expect(res.status).toBe(422);
  });

  it('creates a Section-specific assignment when a valid Section is provided', async () => {
    const res = await request(app)
      .post('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({
        teacherId,
        subjectId: subject.id,
        classId: sectionedClassId,
        sectionId,
        academicYearId,
        effectiveStartDate: '2026-02-01',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.sectionId).toBe(sectionId);
  });

  it('rejects a cross-school Teacher, Subject, Class, or Academic Year (tenant isolation)', async () => {
    const res = await request(app)
      .post('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolB.token}`)
      .send({
        teacherId,
        subjectId: subject.id,
        classId: wholeClassId,
        academicYearId,
        effectiveStartDate: '2026-02-01',
      });
    expect(res.status).toBe(422);
  });

  it('rejects effectiveStartDate outside the selected Academic Year\'s own date range', async () => {
    const otherClass = await createClass(schoolA.token, `TSA Range Class ${suffix}`);
    const res = await request(app)
      .post('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({
        teacherId,
        subjectId: subject.id,
        classId: otherClass.id,
        academicYearId,
        effectiveStartDate: '2030-02-01',
      });
    expect(res.status).toBe(422);
  });

  it('rejects a Teacher who is not ACTIVE (Business Rule #7)', async () => {
    const resignedEmail = `tsa-resigned-${suffix}@example.com`;
    const resignedTeacher = await onboardTeacher(schoolA.token, resignedEmail);
    await request(app)
      .patch(`/api/v1/teachers/${resignedTeacher.id}/resign`)
      .set('Authorization', `Bearer ${schoolA.token}`);

    const otherClass = await createClass(schoolA.token, `TSA Resigned Class ${suffix}`);
    const res = await request(app)
      .post('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({
        teacherId: resignedTeacher.id,
        subjectId: subject.id,
        classId: otherClass.id,
        academicYearId,
        effectiveStartDate: '2026-02-01',
      });
    expect(res.status).toBe(422);
  });
});

describe('List / filter / detail', () => {
  it('lists assignments scoped to the acting school, filterable by teacherId', async () => {
    const res = await request(app)
      .get(`/api/v1/teacher-subject-assignments?teacherId=${teacherId}`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((a) => a.teacherId === teacherId)).toBe(true);
  });

  it("School B cannot see School A's assignments", async () => {
    const res = await request(app)
      .get('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolB.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('returns 404, not 403, for a cross-tenant assignment id', async () => {
    const listRes = await request(app)
      .get('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolA.token}`);
    const target = listRes.body.data[0];

    const res = await request(app)
      .get(`/api/v1/teacher-subject-assignments/${target.id}`)
      .set('Authorization', `Bearer ${schoolB.token}`);
    expect(res.status).toBe(404);
  });
});

describe('Grouped view — Teacher -> Subject -> Classes (UI Redesign)', () => {
  it('groups this Teacher\'s own Active assignments by Subject, listing every Class taught, with no workload/weekly-target field exposed', async () => {
    const res = await request(app)
      .get('/api/v1/teacher-subject-assignments/grouped')
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);

    const teacherEntry = res.body.data.find((t) => t.teacherId === teacherId);
    expect(teacherEntry).toBeTruthy();
    const subjectEntry = teacherEntry.subjects.find((s) => s.subjectId === subject.id);
    expect(subjectEntry).toBeTruthy();
    expect(subjectEntry.classes.some((c) => c.classId === wholeClassId)).toBe(true);

    // This feature's own narrowed responsibility: only Teacher/Subject/Class
    // identity, never a weekly lesson target or any other Timetable-only concern.
    const classEntry = subjectEntry.classes.find((c) => c.classId === wholeClassId);
    expect(classEntry).toEqual({ assignmentId: expect.any(String), classId: wholeClassId, className: expect.any(String), sectionId: null });
  });

  it("School B sees an empty grouped view (tenant isolation)", async () => {
    const res = await request(app)
      .get('/api/v1/teacher-subject-assignments/grouped')
      .set('Authorization', `Bearer ${schoolB.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects a non-School-Admin caller', async () => {
    const res = await request(app)
      .get('/api/v1/teacher-subject-assignments/grouped')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Correction / Ending (Business Rules #11, #24)', () => {
  let assignmentId;

  beforeAll(async () => {
    const cls = await createClass(schoolA.token, `TSA Correction Class ${suffix}`);
    const res = await request(app)
      .post('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ teacherId, subjectId: subject.id, classId: cls.id, academicYearId, effectiveStartDate: '2026-02-01' });
    assignmentId = res.body.data.id;
  });

  it('rejects a field other than effectiveStartDate/effectiveEndDate/endReason (Guard by Construction)', async () => {
    const res = await request(app)
      .patch(`/api/v1/teacher-subject-assignments/${assignmentId}`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ teacherId: 'someone-else' });
    expect(res.status).toBe(422);
  });

  it('setting a previously-unset effectiveEndDate ends the assignment', async () => {
    const res = await request(app)
      .patch(`/api/v1/teacher-subject-assignments/${assignmentId}`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ effectiveEndDate: '2026-06-01', endReason: 'Term ended' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ENDED');
  });

  it('rejects clearing an already-set effectiveEndDate back to null (Business Rule #24)', async () => {
    const res = await request(app)
      .patch(`/api/v1/teacher-subject-assignments/${assignmentId}`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ effectiveEndDate: null });
    expect(res.status).toBe(409);
  });

  it('still allows correcting the end reason once Ended', async () => {
    const res = await request(app)
      .patch(`/api/v1/teacher-subject-assignments/${assignmentId}`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ endReason: 'Corrected reason' });
    expect(res.status).toBe(200);
    expect(res.body.data.endReason).toBe('Corrected reason');
  });
});

describe('Replace Teacher (Business Rule #9, Technical Design Review finding)', () => {
  it('ends the existing assignment and creates a replacement for the same Subject/Class/Academic Year', async () => {
    const cls = await createClass(schoolA.token, `TSA Replace Class ${suffix}`);
    const created = await request(app)
      .post('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ teacherId, subjectId: subject.id, classId: cls.id, academicYearId, effectiveStartDate: '2026-02-01' });

    const newTeacher = await onboardTeacher(schoolA.token, `tsa-replacement-${suffix}@example.com`);

    const res = await request(app)
      .post(`/api/v1/teacher-subject-assignments/${created.body.data.id}/replace-teacher`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ newTeacherId: newTeacher.id });

    expect(res.status).toBe(201);
    expect(res.body.data.teacherId).toBe(newTeacher.id);
    expect(res.body.data.subjectId).toBe(subject.id);
    expect(res.body.data.classId).toBe(cls.id);
    expect(res.body.data.academicYearId).toBe(academicYearId);

    const oldRes = await request(app)
      .get(`/api/v1/teacher-subject-assignments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(oldRes.body.data.status).toBe('ENDED');
  });

  it('rejects replacing an assignment that is not currently Active', async () => {
    const cls = await createClass(schoolA.token, `TSA Replace Ended Class ${suffix}`);
    const created = await request(app)
      .post('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ teacherId, subjectId: subject.id, classId: cls.id, academicYearId, effectiveStartDate: '2026-02-01' });
    await request(app)
      .patch(`/api/v1/teacher-subject-assignments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ effectiveEndDate: '2026-05-01' });

    const res = await request(app)
      .post(`/api/v1/teacher-subject-assignments/${created.body.data.id}/replace-teacher`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ newTeacherId: teacherId });
    expect(res.status).toBe(409);
  });
});

describe('Selective copy between Academic Years (Business Rules #12, #13)', () => {
  it('copies a valid candidate and skips one that would duplicate an existing Active scope', async () => {
    const targetYear = await createAcademicYear(schoolA.token, '2027-01-01', '2027-12-31');
    const cls = await createClass(schoolA.token, `TSA Copy Class ${suffix}`);

    const source = await request(app)
      .post('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ teacherId, subjectId: subject.id, classId: cls.id, academicYearId, effectiveStartDate: '2026-02-01' });

    // Pre-seed the target year with the exact same scope, so the copy
    // candidate collides with it and is skipped, not aborting the batch.
    await request(app)
      .post('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({
        teacherId,
        subjectId: subject.id,
        classId: cls.id,
        academicYearId: targetYear.id,
        effectiveStartDate: '2027-01-01',
      });

    const res = await request(app)
      .post('/api/v1/teacher-subject-assignments/copy')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ fromAcademicYearId: academicYearId, toAcademicYearId: targetYear.id, assignmentIds: [source.body.data.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.copied).toHaveLength(0);
    expect(res.body.data.skipped).toHaveLength(1);
    expect(res.body.data.skipped[0].assignmentId).toBe(source.body.data.id);
  });

  it('copies successfully into a fresh target year with no conflicting scope', async () => {
    const targetYear = await createAcademicYear(schoolA.token, '2028-01-01', '2028-12-31');
    const cls = await createClass(schoolA.token, `TSA Copy Fresh Class ${suffix}`);

    const source = await request(app)
      .post('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ teacherId, subjectId: subject.id, classId: cls.id, academicYearId, effectiveStartDate: '2026-02-01' });

    const res = await request(app)
      .post('/api/v1/teacher-subject-assignments/copy')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ fromAcademicYearId: academicYearId, toAcademicYearId: targetYear.id, assignmentIds: [source.body.data.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.copied).toHaveLength(1);
    expect(res.body.data.copied[0].academicYearId).toBe(targetYear.id);
    expect(res.body.data.copied[0].effectiveStartDate).toBe(new Date('2028-01-01').toISOString());
  });
});

describe('Subject Management dependency-validation integration (Business Rule #19)', () => {
  it('blocks removing the Subject-to-School assignment while an Active Teacher Subject Assignment references it', async () => {
    const res = await request(app)
      .delete(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(409);
  });
});

// Every write function calls recordAuditEvent — verify one is actually
// persisted, mirroring Academic Year Management's own Audit Trail
// persistence test.
describe('Audit Trail persistence', () => {
  it('TEACHER_SUBJECT_ASSIGNMENT_CREATED is persisted with the real schoolId', async () => {
    const cls = await createClass(schoolA.token, `TSA Audit Class ${suffix}`);
    const created = await request(app)
      .post('/api/v1/teacher-subject-assignments')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ teacherId, subjectId: subject.id, classId: cls.id, academicYearId, effectiveStartDate: '2026-02-01' });

    const event = await prisma.auditLog.findFirst({
      where: { schoolId: schoolA.schoolId, action: 'TEACHER_SUBJECT_ASSIGNMENT_CREATED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(event).toBeTruthy();
    expect(event.metadata.assignmentId).toBe(created.body.data.id);
  });
});

// Unit tests with a mocked transaction can't prove a real Postgres advisory
// lock actually serializes concurrent requests for the same uniqueness
// scope — this fires genuinely concurrent calls (Promise.allSettled, not
// sequential) against the real service layer + real database, mirroring
// Academic Year Management's own concurrency test.
describe('Concurrency (Business Rule #4, Implementation Requirements)', () => {
  it('concurrent creates for the exact same scope never 500 and leave exactly one Active row', async () => {
    const cls = await createClass(schoolA.token, `TSA Concurrency Class ${suffix}`);
    const fakeActingUser = { id: 'concurrency-test-user' };

    // Each concurrent call's transaction makes several cross-feature reads
    // (assertTeacherAssignable/assertSubjectAssignable/etc.) through the
    // plain (non-tx) Prisma client, each checking out its own connection
    // from this dev DB's small pool while the transaction itself holds
    // another — 3 concurrent attempts is enough to prove the advisory lock
    // actually serializes the race without exhausting that pool, unlike
    // Academic Year Management's own lighter (no cross-feature reads)
    // critical section, which can afford a higher concurrency count.
    const concurrency = 3;
    const results = await Promise.allSettled(
      Array.from({ length: concurrency }, () =>
        service.createAssignment(
          schoolA.schoolId,
          {
            teacherId,
            subjectId: subject.id,
            classId: cls.id,
            academicYearId,
            effectiveStartDate: '2026-02-01',
          },
          fakeActingUser
        )
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(concurrency - 1);
    expect(rejected.every((r) => /Active Teacher Subject Assignment already exists/.test(r.reason.message))).toBe(
      true
    );

    const activeRows = await prisma.teacherSubjectAssignment.findMany({
      where: { schoolId: schoolA.schoolId, classId: cls.id, effectiveEndDate: null },
    });
    expect(activeRows).toHaveLength(1);
  });
});
