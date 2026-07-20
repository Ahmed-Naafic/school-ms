// Integration tests against the real Express app and dev database. See
// ../../shared/test-helpers.js — self-contained, creates fresh Schools/School
// Admins per run rather than depending on manually-created fixtures.
//
// Only 2 School Admins are created for this whole file (reused across every
// test below) to stay under the password-reset endpoint's rate limit
// (max 5 requests / 15 min, per Security-Standards.md's Rate Limiting
// section) — each `createTestSchoolAdmin` call consumes one of that budget.
const { app, request, loginSuperAdmin, createTestSchoolAdmin, uniqueSuffix } = require('../../shared/test-helpers');

jest.setTimeout(30000);

let superAdminToken;
let schoolA;
let schoolB;
let suffix;

beforeAll(async () => {
  superAdminToken = await loginSuperAdmin();
  suffix = uniqueSuffix();

  schoolA = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Schools IT A ${suffix}`,
    adminEmail: `schools-it-a-${suffix}@example.com`,
    adminPassword: undefined,
    password: 'SchoolsIT123',
  });
  schoolB = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Schools IT B ${suffix}`,
    adminEmail: `schools-it-b-${suffix}@example.com`,
    password: 'SchoolsIT123',
  });
});

describe('authentication and permissions', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/schools');
    expect(res.status).toBe(401);
  });

  it('rejects a School Admin creating a school', async () => {
    const res = await request(app)
      .post('/api/v1/schools')
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: `Nope ${suffix}`, firstSchoolAdminEmail: `nope-${suffix}@example.com` });
    expect(res.status).toBe(403);
  });

  it('has no delete route', async () => {
    const res = await request(app)
      .delete('/api/v1/schools/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('School creation (Business Rules #1, #2, #16)', () => {
  it('creates a school with only name + firstSchoolAdminEmail, rejects duplicate names', async () => {
    const name = `Create Test School ${suffix}`;

    const first = await request(app)
      .post('/api/v1/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name, firstSchoolAdminEmail: `create-test-${suffix}@example.com` });
    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post('/api/v1/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name, firstSchoolAdminEmail: `create-test-2-${suffix}@example.com` });
    expect(duplicate.status).toBe(409);
  });
});

describe('tenant isolation and profile permissions (Business Rule #14)', () => {
  it('a School Admin cannot update another school\'s operational profile', async () => {
    const res = await request(app)
      .patch(`/api/v1/schools/${schoolA.schoolId}/profile`)
      .set('Authorization', `Bearer ${schoolB.token}`)
      .send({ contactEmail: 'hacker@example.com' });

    expect(res.status).toBe(403);
  });

  it('a School Admin cannot update core identity (Super Admin only)', async () => {
    const res = await request(app)
      .patch(`/api/v1/schools/${schoolA.schoolId}/identity`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ name: `Renamed ${suffix}` });

    expect(res.status).toBe(403);
  });

  it('a School Admin can update their own operational profile', async () => {
    const res = await request(app)
      .patch(`/api/v1/schools/${schoolA.schoolId}/profile`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ contactEmail: 'office@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.data.contactEmail).toBe('office@example.com');
  });

  it('rejects mass-assignment of Super-Admin-only fields via the operational-profile endpoint (regression)', async () => {
    const res = await request(app)
      .patch(`/api/v1/schools/${schoolA.schoolId}/profile`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ contactEmail: 'still-ok@example.com', lifecycleStatus: 'SUSPENDED', name: 'Hijacked', subscriptionStatus: 'ACTIVE' });

    expect(res.status).toBe(422);

    const check = await request(app)
      .get(`/api/v1/schools/${schoolA.schoolId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(check.body.data.lifecycleStatus).toBe('ACTIVE');
    expect(check.body.data.name).toBe(`Schools IT A ${suffix}`);
  });
});

describe('createSchool orphan-rollback (regression)', () => {
  it('does not leave a permanent, admin-less school behind if the admin email is already taken', async () => {
    const takenEmail = `schools-it-a-${suffix}@example.com`; // schoolA's own admin email, already registered
    const schoolName = `Orphan Rollback Test ${suffix}`;

    const res = await request(app)
      .post('/api/v1/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: schoolName, firstSchoolAdminEmail: takenEmail });

    expect(res.status).toBe(409);

    // The school must not have been left behind — its name must be free to reuse.
    const retry = await request(app)
      .post('/api/v1/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: schoolName, firstSchoolAdminEmail: `orphan-rollback-retry-${suffix}@example.com` });
    expect(retry.status).toBe(201);
  });
});

describe('platform statistics (Business Rule #10)', () => {
  it('is Super-Admin-only and aggregate-only', async () => {
    const forbidden = await request(app)
      .get('/api/v1/schools/statistics')
      .set('Authorization', `Bearer ${schoolA.token}`);
    expect(forbidden.status).toBe(403);

    const res = await request(app)
      .get('/api/v1/schools/statistics')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['activeSchools', 'closedSchools', 'suspendedSchools', 'totalSchools'].sort()
    );
  });
});

describe('full lifecycle: Suspend -> Reactivate -> Close -> Reopen (Business Rules #5, #6, #12, #13)', () => {
  // Reuses School B (not otherwise mutated by the tests above) so this
  // block doesn't need its own fresh School Admin.
  const schoolId = () => schoolB.schoolId;
  const adminEmail = () => `schools-it-b-${suffix}@example.com`;
  const adminPassword = 'SchoolsIT123';

  it('suspends, and suspending again is a harmless no-op', async () => {
    const first = await request(app)
      .patch(`/api/v1/schools/${schoolId()}/suspend`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.lifecycleStatus).toBe('SUSPENDED');

    const second = await request(app)
      .patch(`/api/v1/schools/${schoolId()}/suspend`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(second.status).toBe(200);
  });

  it('a suspended school\'s School Admin (with real, working credentials) cannot log in', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail(), password: adminPassword });
    expect(res.status).toBe(401);
  });

  it('reactivates back to ACTIVE, immediately restoring the School Admin\'s login access', async () => {
    const res = await request(app)
      .patch(`/api/v1/schools/${schoolId()}/reactivate`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.lifecycleStatus).toBe('ACTIVE');

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail(), password: adminPassword });
    expect(loginRes.status).toBe(200);
  });

  it('closes, then rejects the ordinary reactivate action', async () => {
    const closeRes = await request(app)
      .patch(`/api/v1/schools/${schoolId()}/close`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.lifecycleStatus).toBe('CLOSED');

    const reactivateRes = await request(app)
      .patch(`/api/v1/schools/${schoolId()}/reactivate`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(reactivateRes.status).toBe(409);
  });

  it('rejects suspending a Closed school', async () => {
    const res = await request(app)
      .patch(`/api/v1/schools/${schoolId()}/suspend`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(409);
  });

  it('reopens a Closed school back to ACTIVE', async () => {
    const res = await request(app)
      .patch(`/api/v1/schools/${schoolId()}/reopen`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.lifecycleStatus).toBe('ACTIVE');
  });

  it('a subscription status change never touches lifecycleStatus', async () => {
    const res = await request(app)
      .patch(`/api/v1/schools/${schoolId()}/subscription`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ subscriptionStatus: 'EXPIRED' });
    expect(res.status).toBe(200);
    expect(res.body.data.lifecycleStatus).toBe('ACTIVE');
    expect(res.body.data.subscriptionStatus).toBe('EXPIRED');
  });
});

describe('Education Levels (ACR-003, Business Rule #17)', () => {
  it('defaults a newly-created school to [PRIMARY]', async () => {
    const res = await request(app)
      .get(`/api/v1/schools/${schoolA.schoolId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.body.data.educationLevels).toEqual(['PRIMARY']);
  });

  it('rejects a School Admin attempting to change Education Levels', async () => {
    const res = await request(app)
      .patch(`/api/v1/schools/${schoolA.schoolId}/education-levels`)
      .set('Authorization', `Bearer ${schoolA.token}`)
      .send({ educationLevels: ['PRIMARY', 'SECONDARY'] });
    expect(res.status).toBe(403);
  });

  it('rejects an empty Education Level set', async () => {
    const res = await request(app)
      .patch(`/api/v1/schools/${schoolA.schoolId}/education-levels`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ educationLevels: [] });
    expect(res.status).toBe(422);
  });

  it('Super Admin can grow a school\'s Education Levels', async () => {
    const res = await request(app)
      .patch(`/api/v1/schools/${schoolA.schoolId}/education-levels`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ educationLevels: ['PRIMARY', 'SECONDARY'] });
    expect(res.status).toBe(200);
    expect(res.body.data.educationLevels.sort()).toEqual(['PRIMARY', 'SECONDARY']);
  });

  it('rejects a submission that would remove a currently-held Education Level (regression)', async () => {
    // schoolA now has [PRIMARY, SECONDARY] from the previous test.
    const res = await request(app)
      .patch(`/api/v1/schools/${schoolA.schoolId}/education-levels`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ educationLevels: ['SECONDARY'] });
    expect(res.status).toBe(409);

    const check = await request(app)
      .get(`/api/v1/schools/${schoolA.schoolId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(check.body.data.educationLevels.sort()).toEqual(['PRIMARY', 'SECONDARY']);
  });
});
