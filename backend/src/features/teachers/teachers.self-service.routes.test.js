// Teacher self-service (/teachers/me) integration tests, kept in their own
// file deliberately: establishing a Teacher's login credentials spends 2 of
// the password-reset rate limiter's 5-requests-per-15-minutes budget
// (Security-Standards.md's Rate Limiting section, shared across
// /password-reset/request and /confirm). teachers.routes.test.js already
// spends 4 of that 5 setting up its two Schools, leaving no room for a
// Teacher login there — a separate file gets its own fresh budget.
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
let teacherId;

beforeAll(async () => {
  const superAdminToken = await loginSuperAdmin();

  const suffix = uniqueSuffix();
  const schoolA = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Teachers Self-Service IT School ${suffix}`,
    adminEmail: `teachers-selfservice-${suffix}@example.com`,
    password: 'SelfServiceIT123',
  });
  schoolAdminToken = schoolA.token;

  const teacherEmail = `self-service-${suffix}@example.com`;
  const created = await request(app)
    .post('/api/v1/teachers')
    .set('Authorization', `Bearer ${schoolAdminToken}`)
    .send({ email: teacherEmail, fullName: 'Self Service Teacher', joiningDate: '2026-01-15' });
  teacherId = created.body.data.id;

  teacherToken = await establishCredentialsAndLogin(teacherEmail, 'TeacherSelf123');
});

describe('GET /teachers/me (Business Rules #10, #12)', () => {
  it('resolves the authenticated Teacher\'s own profile, not a client-supplied id', async () => {
    const res = await request(app).get('/api/v1/teachers/me').set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(teacherId);
    expect(res.body.data.fullName).toBe('Self Service Teacher');
    // Structural isolation: this route has no :teacherId parameter at all
    // (see teachers.routes.js), so there is no request shape that could
    // target another Teacher's record — verified further at the unit
    // level in teachers.service.test.js's getOwnProfile suite.
  });

  it('School Admin cannot use /teachers/me (role-gated to TEACHER)', async () => {
    const res = await request(app).get('/api/v1/teachers/me').set('Authorization', `Bearer ${schoolAdminToken}`);
    expect(res.status).toBe(403);
  });

  it('a Teacher cannot access School-Admin-only management endpoints', async () => {
    const res = await request(app).get('/api/v1/teachers').set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /teachers/me (Business Rule #10)', () => {
  it('lets a Teacher update their own contactPhone/contactAddress', async () => {
    const res = await request(app)
      .patch('/api/v1/teachers/me')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ contactPhone: '555-0199', contactAddress: '99 Self St' });

    expect(res.status).toBe(200);
    expect(res.body.data.contactPhone).toBe('555-0199');
    expect(res.body.data.contactAddress).toBe('99 Self St');
  });

  it.each(['fullName', 'employmentStatus', 'employeeId', 'schoolId', 'accountId'])(
    'rejects a self-service update containing %s (stricter than the School-Admin endpoint)',
    async (field) => {
      const res = await request(app)
        .patch('/api/v1/teachers/me')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ [field]: 'x' });

      expect(res.status).toBe(422);
    }
  );
});
