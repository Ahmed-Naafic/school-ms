// Integration tests against the real Express app and dev database (via
// supertest, in-process). Schools are created via createTestSchoolAdminDirect
// (bypasses the real HTTP password-reset flow entirely) — this feature's own
// tests don't need to exercise that flow, and it keeps this suite off the
// shared password-reset rate limiter's budget entirely, mirroring several
// other feature test files' own budget-conscious precedent.
const { app, request, loginSuperAdmin, createTestSchoolAdminDirect, uniqueSuffix } = require('../../shared/test-helpers');

jest.setTimeout(30000);

let superAdminToken;
let schoolA;
let schoolB;
let suffix;

async function createSubject(name, educationLevel) {
  const res = await request(app)
    .post('/api/v1/subjects')
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({ name, educationLevel });
  return res.body.data;
}

async function assignSubjectToSchool(schoolId, subjectId) {
  await request(app)
    .post(`/api/v1/schools/${schoolId}/subjects/${subjectId}`)
    .set('Authorization', `Bearer ${superAdminToken}`);
}

async function createGradeLevelWithClass(token, gradeLevelName, className) {
  const gradeLevelRes = await request(app)
    .post('/api/v1/grade-levels')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: gradeLevelName, educationLevel: 'PRIMARY' });
  const gradeLevelId = gradeLevelRes.body.data.id;

  // shiftId omitted — defaults to the school's own auto-created "Morning"
  // Shift, giving a deterministic available-periods figure: 5 Working Days
  // (the Somalia Default) x 6 Teaching Periods (the default wizard
  // structure) = 30.
  await request(app)
    .post('/api/v1/classes')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: className, gradeLevelId });

  return gradeLevelId;
}

beforeAll(async () => {
  superAdminToken = await loginSuperAdmin();
  suffix = uniqueSuffix();

  schoolA = await createTestSchoolAdminDirect({
    schoolName: `WSA IT School A ${suffix}`,
    adminEmail: `wsa-it-a-${suffix}@example.com`,
    password: 'WsaIT123456',
  });

  schoolB = await createTestSchoolAdminDirect({
    schoolName: `WSA IT School B ${suffix}`,
    adminEmail: `wsa-it-b-${suffix}@example.com`,
    password: 'WsaIT123456',
  });

  // A school has no Academic Year at all until one is explicitly created
  // (unlike Shift/Calendar/GradeLevel, which are auto-created at school
  // creation) — creating the first one automatically makes it Current, per
  // Academic Year Management's own Business Rule #9.
  await request(app)
    .post('/api/v1/academic-years')
    .set('Authorization', `Bearer ${schoolA.token}`)
    .send({ startDate: '2026-09-01', endDate: '2027-06-30' });
});

describe('authentication and permissions', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/weekly-subject-allocations');
    expect(res.status).toBe(401);
  });

  it('rejects Super Admin — no role in this feature at all', async () => {
    const res = await request(app)
      .get('/api/v1/weekly-subject-allocations')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(403);
  });

  it('allows School Admin to list allocations (their own, initially empty)', async () => {
    const res = await request(app)
      .get('/api/v1/weekly-subject-allocations')
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('create / total-must-exactly-equal-available (Business Rules #5-#7)', () => {
  let gradeLevelId;
  let subjectId;

  beforeAll(async () => {
    gradeLevelId = await createGradeLevelWithClass(schoolA.token, `Grade 8 ${suffix}`, `G8A ${suffix}`);
    const subject = await createSubject(`English ${suffix}`, 'PRIMARY');
    subjectId = subject.id;
    await assignSubjectToSchool(schoolA.schoolId, subjectId);
  });

  it('rejects an incomplete total', async () => {
    const res = await request(app)
      .post('/api/v1/weekly-subject-allocations')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ gradeLevelId, subjects: [{ subjectId, weeklyPeriods: 10 }] });
    expect(res.status).toBe(422);
  });

  it('rejects an over-allocated total', async () => {
    const res = await request(app)
      .post('/api/v1/weekly-subject-allocations')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ gradeLevelId, subjects: [{ subjectId, weeklyPeriods: 40 }] });
    expect(res.status).toBe(422);
  });

  it('creates an allocation whose total exactly equals the calculated available figure (30 = 5 Working Days x 6 Teaching Periods)', async () => {
    const res = await request(app)
      .post('/api/v1/weekly-subject-allocations')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ gradeLevelId, subjects: [{ subjectId, weeklyPeriods: 30, doublePeriodRequired: false }] });

    expect(res.status).toBe(201);
    expect(res.body.data.availablePeriodsAtSave).toBe(30);
    expect(res.body.data.needsReview).toBe(false);
    expect(res.body.data.availablePeriodsNow).toBe(30);
  });

  it('rejects a second allocation for the same Grade/Form and Academic Year', async () => {
    const res = await request(app)
      .post('/api/v1/weekly-subject-allocations')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ gradeLevelId, subjects: [{ subjectId, weeklyPeriods: 30 }] });
    expect(res.status).toBe(409);
  });

  it('rejects a gradeLevelId that does not exist', async () => {
    const res = await request(app)
      .post('/api/v1/weekly-subject-allocations')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ gradeLevelId: 'nonexistent-grade-level', subjects: [{ subjectId, weeklyPeriods: 30 }] });
    expect(res.status).toBe(422);
  });

  it('rejects a Subject not assigned to the school', async () => {
    const unassigned = await createSubject(`Unassigned ${suffix}`, 'PRIMARY');
    const res = await request(app)
      .post('/api/v1/weekly-subject-allocations')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({
        gradeLevelId: await createGradeLevelWithClass(schoolA.token, `Grade 9 ${suffix}`, `G9A ${suffix}`),
        subjects: [{ subjectId: unassigned.id, weeklyPeriods: 30 }],
      });
    expect(res.status).toBe(422);
  });
});

describe('correct (Business Lifecycle Step 5/6 — Needs Review resolved by construction)', () => {
  let gradeLevelId;
  let subjectId;
  let allocationId;

  beforeAll(async () => {
    gradeLevelId = await createGradeLevelWithClass(schoolA.token, `Grade 10 ${suffix}`, `G10A ${suffix}`);
    const subject = await createSubject(`Mathematics ${suffix}`, 'PRIMARY');
    subjectId = subject.id;
    await assignSubjectToSchool(schoolA.schoolId, subjectId);

    const createRes = await request(app)
      .post('/api/v1/weekly-subject-allocations')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ gradeLevelId, subjects: [{ subjectId, weeklyPeriods: 30 }] });
    allocationId = createRes.body.data.id;
  });

  it('rejects any field other than subjects (Guard by Construction)', async () => {
    const res = await request(app)
      .patch(`/api/v1/weekly-subject-allocations/${allocationId}`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ gradeLevelId: 'attempt-to-change', subjects: [{ subjectId, weeklyPeriods: 30 }] });
    expect(res.status).toBe(422);
  });

  it('replaces the full line-item set', async () => {
    const secondSubject = await createSubject(`Physics ${suffix}`, 'PRIMARY');
    await assignSubjectToSchool(schoolA.schoolId, secondSubject.id);

    const res = await request(app)
      .patch(`/api/v1/weekly-subject-allocations/${allocationId}`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({
        subjects: [
          { subjectId, weeklyPeriods: 20 },
          { subjectId: secondSubject.id, weeklyPeriods: 10 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.subjects).toHaveLength(2);
  });

  it('rejects an incomplete total on correction', async () => {
    const res = await request(app)
      .patch(`/api/v1/weekly-subject-allocations/${allocationId}`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ subjects: [{ subjectId, weeklyPeriods: 5 }] });
    expect(res.status).toBe(422);
  });
});

describe('Needs Review (derived live, never persisted — recalculated on every read)', () => {
  let gradeLevelId;
  let subjectId;
  let allocationId;

  beforeAll(async () => {
    gradeLevelId = await createGradeLevelWithClass(schoolA.token, `Grade 11 ${suffix}`, `G11A ${suffix}`);
    const subject = await createSubject(`Chemistry ${suffix}`, 'PRIMARY');
    subjectId = subject.id;
    await assignSubjectToSchool(schoolA.schoolId, subjectId);

    const createRes = await request(app)
      .post('/api/v1/weekly-subject-allocations')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ gradeLevelId, subjects: [{ subjectId, weeklyPeriods: 30 }] });
    allocationId = createRes.body.data.id;
  });

  afterAll(async () => {
    // Restore the school's own Working Days so later describe blocks in
    // this same file keep computing the expected 30-period figure.
    await request(app)
      .patch('/api/v1/school-calendar')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ workingDays: ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY'] });
  });

  it('reports current (needsReview: false) immediately after creation', async () => {
    const res = await request(app)
      .get(`/api/v1/weekly-subject-allocations/${allocationId}`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.body.data.needsReview).toBe(false);
  });

  it('reports Needs Review after a School Schedule Management change reduces the available figure', async () => {
    await request(app)
      .patch('/api/v1/school-calendar')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'] }); // 4 days x 6 periods = 24

    const res = await request(app)
      .get(`/api/v1/weekly-subject-allocations/${allocationId}`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.body.data.needsReview).toBe(true);
    expect(res.body.data.availablePeriodsNow).toBe(24);
    expect(res.body.data.availablePeriodsAtSave).toBe(30);
  });

  it('re-saving with the new total resolves Needs Review back to current', async () => {
    const res = await request(app)
      .patch(`/api/v1/weekly-subject-allocations/${allocationId}`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ subjects: [{ subjectId, weeklyPeriods: 24 }] });

    expect(res.status).toBe(200);
    expect(res.body.data.needsReview).toBe(false);
    expect(res.body.data.availablePeriodsAtSave).toBe(24);
  });
});

describe('tenant isolation (Multi-Tenancy)', () => {
  let gradeLevelId;
  let subjectId;
  let allocationId;

  beforeAll(async () => {
    gradeLevelId = await createGradeLevelWithClass(schoolA.token, `Grade 12 ${suffix}`, `G12A ${suffix}`);
    const subject = await createSubject(`Biology ${suffix}`, 'PRIMARY');
    subjectId = subject.id;
    await assignSubjectToSchool(schoolA.schoolId, subjectId);

    const createRes = await request(app)
      .post('/api/v1/weekly-subject-allocations')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ gradeLevelId, subjects: [{ subjectId, weeklyPeriods: 30 }] });
    allocationId = createRes.body.data.id;
  });

  it('School B cannot read School A\'s allocation', async () => {
    const res = await request(app)
      .get(`/api/v1/weekly-subject-allocations/${allocationId}`)
      .set('Authorization', `Bearer ${schoolB.token}`);
    expect(res.status).toBe(404);
  });

  it('School B cannot correct School A\'s allocation', async () => {
    const res = await request(app)
      .patch(`/api/v1/weekly-subject-allocations/${allocationId}`)
      .set('Authorization', `Bearer ${schoolB.token}`)
      .send({ subjects: [{ subjectId, weeklyPeriods: 30 }] });
    expect(res.status).toBe(404);
  });

  it('has no delete route', async () => {
    const res = await request(app)
      .delete(`/api/v1/weekly-subject-allocations/${allocationId}`)
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(res.status).toBe(404);
  });
});

describe('Subject Management removal-dependency-check (Technical Design Review finding — WP3)', () => {
  it('blocks removing a Subject from the school while a current allocation line references it', async () => {
    const gradeLevelId = await createGradeLevelWithClass(schoolA.token, `Grade 7 ${suffix}`, `G7A ${suffix}`);
    const subject = await createSubject(`Geography ${suffix}`, 'PRIMARY');
    await assignSubjectToSchool(schoolA.schoolId, subject.id);

    await request(app)
      .post('/api/v1/weekly-subject-allocations')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ gradeLevelId, subjects: [{ subjectId: subject.id, weeklyPeriods: 30 }] });

    const removeRes = await request(app)
      .delete(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(removeRes.status).toBe(409);
  });

  it('allows removing a Subject once no current allocation line references it', async () => {
    const subject = await createSubject(`Unreferenced ${suffix}`, 'PRIMARY');
    await assignSubjectToSchool(schoolA.schoolId, subject.id);

    const removeRes = await request(app)
      .delete(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(removeRes.status).toBe(200);
  });
});
