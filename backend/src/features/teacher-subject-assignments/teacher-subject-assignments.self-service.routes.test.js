// Teacher self-service (/teacher-subject-assignments/me) integration tests,
// kept in their own file deliberately: establishing a Teacher's login
// credentials spends 2 of the password-reset rate limiter's
// 5-requests-per-15-minutes budget (shared across /password-reset/request
// and /confirm). The main routes test file already spends 4 of that 5
// setting up its two Schools, leaving no room for a Teacher login there —
// mirroring Teacher Management's own teachers.self-service.routes.test.js
// precedent exactly.
const {
  app,
  request,
  loginSuperAdmin,
  createTestSchoolAdmin,
  establishCredentialsAndLogin,
  uniqueSuffix,
} = require('../../shared/test-helpers');

jest.setTimeout(30000);

let schoolAdminToken;
let teacherToken;
let assignmentId;

beforeAll(async () => {
  const superAdminToken = await loginSuperAdmin();
  const suffix = uniqueSuffix();

  const schoolA = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `TSA Self-Service IT School ${suffix}`,
    adminEmail: `tsa-selfservice-${suffix}@example.com`,
    password: 'SelfServiceIT123',
  });
  schoolAdminToken = schoolA.token;

  const subjectRes = await request(app)
    .post('/api/v1/subjects')
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({ name: `TSA SelfService Subject ${suffix}`, educationLevel: 'PRIMARY' });
  const subject = subjectRes.body.data;
  await request(app)
    .post(`/api/v1/schools/${schoolA.schoolId}/subjects/${subject.id}`)
    .set('Authorization', `Bearer ${superAdminToken}`);

  const teacherEmail = `tsa-self-service-${suffix}@example.com`;
  const teacherRes = await request(app)
    .post('/api/v1/teachers')
    .set('Authorization', `Bearer ${schoolAdminToken}`)
    .send({ email: teacherEmail, fullName: 'Self Service Teacher', joiningDate: '2026-01-15' });
  const teacherId = teacherRes.body.data.id;

  const classRes = await request(app)
    .post('/api/v1/classes')
    .set('Authorization', `Bearer ${schoolAdminToken}`)
    .send({ name: `TSA SelfService Class ${suffix}` });

  const academicYearRes = await request(app)
    .post('/api/v1/academic-years')
    .set('Authorization', `Bearer ${schoolAdminToken}`)
    .send({ startDate: '2026-01-01', endDate: '2026-12-31' });

  const assignmentRes = await request(app)
    .post('/api/v1/teacher-subject-assignments')
    .set('Authorization', `Bearer ${schoolAdminToken}`)
    .send({
      teacherId,
      subjectId: subject.id,
      classId: classRes.body.data.id,
      academicYearId: academicYearRes.body.data.id,
      effectiveStartDate: '2026-02-01',
    });
  assignmentId = assignmentRes.body.data.id;

  teacherToken = await establishCredentialsAndLogin(teacherEmail, 'TeacherSelf123');
});

describe('GET /teacher-subject-assignments/me (Business Rules #1, #18)', () => {
  it("resolves the authenticated Teacher's own assignments, never a client-supplied teacherId", async () => {
    const res = await request(app).get('/api/v1/teacher-subject-assignments/me').set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(assignmentId);
    expect(res.body.data[0].status).toBe('ACTIVE');
  });

  it('rejects a School Admin calling the Teacher-only self-service endpoint', async () => {
    const res = await request(app)
      .get('/api/v1/teacher-subject-assignments/me')
      .set('Authorization', `Bearer ${schoolAdminToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/teacher-subject-assignments/me');
    expect(res.status).toBe(401);
  });
});
