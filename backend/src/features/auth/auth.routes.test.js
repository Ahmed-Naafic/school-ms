// Integration tests against the real Express app and dev database. See
// ../../shared/test-helpers.js. Deliberately economical with login/password-
// reset calls — this file's own rate-limiter budget (fresh per Jest test
// file) is max 20 logins / 5 password-resets per 15 min. The password-reset
// limiter applies to *both* /request and /confirm, so each
// createTestSchoolAdmin call consumes 2 of that 5-request budget — only 2
// School Admins are created in this whole file, both up front here, so every
// describe block below (including ACR-001's override tests) can share them
// instead of spending more of the budget. The lockout test alone consumes 6
// of the login budget.
const { app, request, loginSuperAdmin, createTestSchoolAdmin, uniqueSuffix } = require('../../shared/test-helpers');
const prisma = require('../../config/database');
const { hashPassword } = require('../../shared/password');

jest.setTimeout(30000);

let superAdminToken;
let schoolAdmin;
let secondSchoolAdmin;
let secondSchoolAdminEmail;
let secondSchoolAdminPassword;
let suffix;

beforeAll(async () => {
  superAdminToken = await loginSuperAdmin();
  suffix = uniqueSuffix();
  schoolAdmin = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Auth IT School ${suffix}`,
    adminEmail: `auth-it-admin-${suffix}@example.com`,
    password: 'AuthIT12345',
  });

  const suffix2 = uniqueSuffix();
  secondSchoolAdminEmail = `auth-it-b-${suffix2}@example.com`;
  secondSchoolAdminPassword = 'AuthITSecond1';
  secondSchoolAdmin = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Auth IT School B ${suffix2}`,
    adminEmail: secondSchoolAdminEmail,
    password: secondSchoolAdminPassword,
  });

  // createTestSchoolAdmin returns only { token, schoolId } — ACR-011's own
  // tests need each School Admin's own accountId too (to target/assert
  // against it directly), fetched once here rather than re-queried per test.
  const schoolAdminAccount = await prisma.account.findFirst({ where: { schoolId: schoolAdmin.schoolId, role: 'SCHOOL_ADMIN' } });
  schoolAdmin.accountId = schoolAdminAccount.id;
  const secondSchoolAdminAccount = await prisma.account.findFirst({
    where: { schoolId: secondSchoolAdmin.schoolId, role: 'SCHOOL_ADMIN' },
  });
  secondSchoolAdmin.accountId = secondSchoolAdminAccount.id;
});

async function createTeacherAccount(schoolAdminToken, emailPrefix) {
  const res = await request(app)
    .post('/api/v1/auth/accounts')
    .set('Authorization', `Bearer ${schoolAdminToken}`)
    .send({ email: `${emailPrefix}-${uniqueSuffix()}@example.com`, role: 'TEACHER' });
  return res.body.data.id;
}

// Sets a real, known password directly via Prisma (never through the
// password-reset request/confirm endpoints) so ACR-011 tests don't touch
// that shared, tightly-budgeted rate limiter at all — the same "flip Account
// state via Prisma directly" technique test-helpers.js's own
// createTestSchoolAdminDirect already establishes.
async function createActiveAccountOfRole(schoolAdminToken, emailPrefix, role, password) {
  const createRes = await request(app)
    .post('/api/v1/auth/accounts')
    .set('Authorization', `Bearer ${schoolAdminToken}`)
    .send({ email: `${emailPrefix}-${uniqueSuffix()}@example.com`, role });
  const accountId = createRes.body.data.id;
  const passwordHash = await hashPassword(password);
  await prisma.account.update({ where: { id: accountId }, data: { passwordHash, status: 'ACTIVE' } });
  return { accountId, email: createRes.body.data.email };
}

describe('authentication basics', () => {
  it('rejects an unauthenticated request to a protected route', async () => {
    const res = await request(app).get('/api/v1/auth/accounts');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid/garbage access token', async () => {
    const res = await request(app).get('/api/v1/auth/accounts').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

describe('account creation permission matrix (Business Rules #6, #19)', () => {
  it('rejects a School Admin creating a School Admin account', async () => {
    const res = await request(app)
      .post('/api/v1/auth/accounts')
      .set('Authorization', `Bearer ${schoolAdmin.token}`)
      .send({ email: `nope-${suffix}@example.com`, role: 'SCHOOL_ADMIN' });
    expect(res.status).toBe(403);
  });

  it('lets a School Admin create a Teacher account in their own school', async () => {
    const res = await request(app)
      .post('/api/v1/auth/accounts')
      .set('Authorization', `Bearer ${schoolAdmin.token}`)
      .send({ email: `teacher-${suffix}@example.com`, role: 'TEACHER' });
    expect(res.status).toBe(201);
    expect(res.body.data.schoolId).toBe(schoolAdmin.schoolId);
  });

  it('rejects a School Admin creating a Super Admin account', async () => {
    const res = await request(app)
      .post('/api/v1/auth/accounts')
      .set('Authorization', `Bearer ${schoolAdmin.token}`)
      .send({ email: `nope2-${suffix}@example.com`, role: 'SUPER_ADMIN' });
    expect(res.status).toBe(403);
  });
});

describe('tenant isolation on account listing', () => {
  it("a School Admin's account list never includes another school's accounts", async () => {
    const res = await request(app).get('/api/v1/auth/accounts').set('Authorization', `Bearer ${schoolAdmin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((acc) => acc.schoolId === schoolAdmin.schoolId)).toBe(true);
  });
});

// ACR-001 (docs/01-architecture/Architecture-Decision-Records/ACR-001-...):
// the administrative/security override path on the pre-existing
// deactivate/reactivate endpoints. No test previously existed for either
// endpoint at the route level — only account creation doesn't touch the
// password-reset limiter, so this whole block is free to create as many
// Teacher/Accountant/Student accounts as it needs via schoolAdmin/
// secondSchoolAdmin's already-established tokens. Placed here, before
// "account lockout" below — that test deliberately locks schoolAdmin's
// account via 5 failed attempts, and the authenticate middleware re-checks
// live account status on every request (not just JWT validity), so
// schoolAdmin.token stops working for the rest of the file once that runs.
describe('Account activation/deactivation override (ACR-001, Business Rule #25)', () => {
  it('Teacher override with a reason succeeds and persists the reason in the audit record (WP7)', async () => {
    const accountId = await createTeacherAccount(schoolAdmin.token, 'override-teacher-reason');

    const res = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/deactivate`)
      .set('Authorization', `Bearer ${schoolAdmin.token}`)
      .send({ reason: 'Security incident' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DEACTIVATED');

    const events = await prisma.auditLog.findMany({
      where: { action: 'ACCOUNT_DEACTIVATED', schoolId: schoolAdmin.schoolId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const event = events.find((e) => e.metadata?.reason === 'Security incident');
    expect(event).toBeTruthy();
  });

  it('Teacher override without a reason is rejected (422)', async () => {
    const accountId = await createTeacherAccount(schoolAdmin.token, 'override-teacher-noreason');

    const res = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/deactivate`)
      .set('Authorization', `Bearer ${schoolAdmin.token}`);

    expect(res.status).toBe(422);
  });

  it('reactivate override also requires a reason for a Teacher target', async () => {
    const accountId = await createTeacherAccount(schoolAdmin.token, 'override-teacher-reactivate');
    await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/deactivate`)
      .set('Authorization', `Bearer ${schoolAdmin.token}`)
      .send({ reason: 'Initial deactivation' });

    const withoutReason = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/reactivate`)
      .set('Authorization', `Bearer ${schoolAdmin.token}`);
    expect(withoutReason.status).toBe(422);

    const withReason = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/reactivate`)
      .set('Authorization', `Bearer ${schoolAdmin.token}`)
      .send({ reason: 'Investigation concluded' });
    expect(withReason.status).toBe(200);
    expect(withReason.body.data.status).toBe('ACTIVE');
  });

  it.each(['ACCOUNTANT', 'STUDENT'])(
    '%s targets never require a reason — ACR-001 does not extend beyond Teacher (regression)',
    async (role) => {
      const createRes = await request(app)
        .post('/api/v1/auth/accounts')
        .set('Authorization', `Bearer ${schoolAdmin.token}`)
        .send({ email: `override-${role.toLowerCase()}-${uniqueSuffix()}@example.com`, role });
      const accountId = createRes.body.data.id;

      const deactivateRes = await request(app)
        .patch(`/api/v1/auth/accounts/${accountId}/deactivate`)
        .set('Authorization', `Bearer ${schoolAdmin.token}`);
      expect(deactivateRes.status).toBe(200);

      const reactivateRes = await request(app)
        .patch(`/api/v1/auth/accounts/${accountId}/reactivate`)
        .set('Authorization', `Bearer ${schoolAdmin.token}`);
      expect(reactivateRes.status).toBe(200);
    }
  );

  it('permission matrix is unaffected by the new context parameter — Super Admin still cannot directly manage a Teacher account (regression)', async () => {
    const accountId = await createTeacherAccount(schoolAdmin.token, 'override-permission-matrix');

    const res = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/deactivate`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ reason: 'Should still be rejected regardless of reason' });

    expect(res.status).toBe(403);
  });

  // Phase 9 code review (Teacher Management) finding: this used to return
  // 403, a different status code than a genuinely nonexistent account gets
  // (401, itself corrected to 404 by this same fix) — letting the response
  // alone confirm an account exists in another tenant. Now 404, matching
  // every other tenant-scoped resource's convention (never confirm existence
  // outside the caller's own school).
  it('tenant isolation is unaffected — a School Admin cannot override another school\'s Teacher, and gets the same 404 a nonexistent account would (regression)', async () => {
    const accountId = await createTeacherAccount(schoolAdmin.token, 'override-tenant');

    const res = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/deactivate`)
      .set('Authorization', `Bearer ${secondSchoolAdmin.token}`)
      .send({ reason: 'Cross-tenant attempt' });

    expect(res.status).toBe(404);

    const nonexistentRes = await request(app)
      .patch(`/api/v1/auth/accounts/00000000-0000-0000-0000-000000000000/deactivate`)
      .set('Authorization', `Bearer ${secondSchoolAdmin.token}`)
      .send({ reason: 'Nonexistent account attempt' });

    expect(nonexistentRes.status).toBe(404);
  });

  it('a Teacher Management-sourced call (no reason) still deactivates a Teacher account end-to-end via the employment transition endpoint', async () => {
    // Exercises the *other* caller of deactivateAccount/reactivateAccount —
    // Teacher Management's own internal, { source: 'teacher_management' }
    // call — through the real HTTP surface, confirming the two paths
    // genuinely coexist rather than one silently breaking the other.
    const teacherRes = await request(app)
      .post('/api/v1/teachers')
      .set('Authorization', `Bearer ${schoolAdmin.token}`)
      .send({
        email: `override-coexist-${uniqueSuffix()}@example.com`,
        fullName: 'Override Coexist Teacher',
        joiningDate: '2026-01-15',
      });
    expect(teacherRes.status).toBe(201);

    const terminateRes = await request(app)
      .patch(`/api/v1/teachers/${teacherRes.body.data.id}/terminate`)
      .set('Authorization', `Bearer ${schoolAdmin.token}`);
    expect(terminateRes.status).toBe(200);

    const accountsRes = await request(app)
      .get('/api/v1/auth/accounts')
      .set('Authorization', `Bearer ${schoolAdmin.token}`);
    const account = accountsRes.body.data.find((a) => a.id === teacherRes.body.data.accountId);
    expect(account.status).toBe('DEACTIVATED');
  });
});

// ACR-011 (docs/01-architecture/Architecture-Decision-Records/ACR-011-...):
// Administrative Password Reset. Placed here, before "account lockout"
// below, for the same reason the ACR-001 block above is — that test locks
// schoolAdmin's own account. Uses createActiveAccountOfRole (direct-Prisma
// password set) throughout, never the password-reset endpoints, to leave
// that limiter's budget untouched for other test files/describe blocks.
describe('Administrative Password Reset (ACR-011, Business Rules #29-30)', () => {
  it('School Admin resets a Teacher account: invalidates the old password, forces MUST_CHANGE_CREDENTIALS, revokes the active session', async () => {
    const { accountId, email } = await createActiveAccountOfRole(schoolAdmin.token, 'reset-teacher', 'TEACHER', 'OldPassw0rd1');

    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'OldPassw0rd1' });
    expect(loginRes.status).toBe(200);
    const { refreshToken } = loginRes.body.data;

    const resetRes = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/reset-password`)
      .set('Authorization', `Bearer ${schoolAdmin.token}`);
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.data.account.status).toBe('MUST_CHANGE_CREDENTIALS');
    expect(resetRes.body.data.account.passwordHash).toBeUndefined();

    // The old password no longer authenticates.
    const oldLoginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'OldPassw0rd1' });
    expect(oldLoginRes.status).toBe(401);

    // The session active at the moment of reset is revoked immediately.
    const refreshRes = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(refreshRes.status).toBe(401);

    // Never any password value in the audit trail — checked against both the
    // old password and (if this environment is running in development mode,
    // per ACR-012) the fresh temporary password.
    const auditRows = await prisma.auditLog.findMany({
      where: { action: 'ADMINISTRATIVE_PASSWORD_RESET', metadata: { path: ['targetAccountId'], equals: accountId } },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].userId).toBe(schoolAdmin.accountId);
    expect(JSON.stringify(auditRows[0].metadata)).not.toMatch(/OldPassw0rd1/);
    if (resetRes.body.data.temporaryPassword) {
      expect(JSON.stringify(auditRows[0].metadata)).not.toContain(resetRes.body.data.temporaryPassword);
    }
  });

  // ACR-012 (docs/01-architecture/Architecture-Decision-Records/ACR-012-...):
  // this whole block only exercises real behavior when this environment is
  // actually running with PASSWORD_RESET_DELIVERY_MODE=development (true for
  // local/CI per .env.example) — every other mode keeps ACR-011's original
  // invalidate-only response (temporaryPassword: null), already covered by
  // the test above regardless of mode.
  const devMode = (process.env.PASSWORD_RESET_DELIVERY_MODE || 'disabled') === 'development';
  (devMode ? it : it.skip)(
    'in development mode, generates a working temporary password that immediately forces a credential change (ACR-012, Business Rule #30)',
    async () => {
      const { accountId, email } = await createActiveAccountOfRole(schoolAdmin.token, 'reset-temp-pw', 'TEACHER', 'OldPassw0rd1');

      const resetRes = await request(app)
        .patch(`/api/v1/auth/accounts/${accountId}/reset-password`)
        .set('Authorization', `Bearer ${schoolAdmin.token}`);
      expect(resetRes.status).toBe(200);
      const { temporaryPassword } = resetRes.body.data;
      expect(typeof temporaryPassword).toBe('string');
      expect(temporaryPassword.length).toBeGreaterThanOrEqual(8);
      expect(temporaryPassword).toMatch(/[A-Za-z]/);
      expect(temporaryPassword).toMatch(/\d/);

      // The temporary password actually logs the account in...
      const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: temporaryPassword });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.mustChangeCredentials).toBe(true);

      // ...but every other authenticated action is blocked until they
      // actually change it, per requireCredentialsEstablished (Business Rule #23).
      const blockedRes = await request(app)
        .get('/api/v1/auth/accounts')
        .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);
      expect(blockedRes.status).toBe(403);
    }
  );

  (devMode ? it : it.skip)('generates a different temporary password on each reset — never a fixed or predictable value', async () => {
    const { accountId } = await createActiveAccountOfRole(schoolAdmin.token, 'reset-temp-pw-unique', 'TEACHER', 'OldPassw0rd1');

    const firstRes = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/reset-password`)
      .set('Authorization', `Bearer ${schoolAdmin.token}`);
    const secondRes = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/reset-password`)
      .set('Authorization', `Bearer ${schoolAdmin.token}`);

    expect(firstRes.body.data.temporaryPassword).not.toBe(secondRes.body.data.temporaryPassword);
  });

  it('School Admin resets a Manager account in their own school', async () => {
    const { accountId } = await createActiveAccountOfRole(schoolAdmin.token, 'reset-manager', 'MANAGER', 'OldPassw0rd1');
    const res = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/reset-password`)
      .set('Authorization', `Bearer ${schoolAdmin.token}`);
    expect(res.status).toBe(200);
  });

  it('School Admin resets an Accountant account in their own school', async () => {
    const { accountId } = await createActiveAccountOfRole(schoolAdmin.token, 'reset-accountant', 'ACCOUNTANT', 'OldPassw0rd1');
    const res = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/reset-password`)
      .set('Authorization', `Bearer ${schoolAdmin.token}`);
    expect(res.status).toBe(200);
  });

  it('rejects resetting a Student account — Business Rule #29 scopes this to Teacher/Manager/Accountant only', async () => {
    const { accountId } = await createActiveAccountOfRole(schoolAdmin.token, 'reset-student', 'STUDENT', 'OldPassw0rd1');
    const res = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/reset-password`)
      .set('Authorization', `Bearer ${schoolAdmin.token}`);
    expect(res.status).toBe(403);
  });

  it('rejects resetting another School Admin account', async () => {
    const res = await request(app)
      .patch(`/api/v1/auth/accounts/${secondSchoolAdmin.accountId}/reset-password`)
      .set('Authorization', `Bearer ${schoolAdmin.token}`);
    expect(res.status).toBe(403);
  });

  it("rejects a cross-school reset attempt with 404 — never 403, so the response can't confirm the account exists elsewhere", async () => {
    const { accountId } = await createActiveAccountOfRole(schoolAdmin.token, 'reset-cross', 'TEACHER', 'OldPassw0rd1');
    const res = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/reset-password`)
      .set('Authorization', `Bearer ${secondSchoolAdmin.token}`);
    expect(res.status).toBe(404);
  });

  it('Super Admin: new school returns a temporary School Admin password that forces a change on login, and Super Admin can reset it', async () => {
    const email = `auth-it-temp-${uniqueSuffix()}@example.com`;
    const createRes = await request(app)
      .post('/api/v1/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: `Temp PW School ${uniqueSuffix()}`, firstSchoolAdminEmail: email });
    expect(createRes.status).toBe(201);
    const { temporaryPassword } = createRes.body.data.initialSchoolAdmin;
    expect(temporaryPassword).toEqual(expect.any(String));

    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: temporaryPassword });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.mustChangeCredentials).toBe(true);

    const changeRes = await request(app)
      .patch('/api/v1/auth/password')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`)
      .send({ currentPassword: temporaryPassword, newPassword: 'MyOwnPassw0rd1' });
    expect(changeRes.status).toBe(200);

    const account = await prisma.account.findUnique({ where: { email } });
    const resetRes = await request(app)
      .patch(`/api/v1/auth/accounts/${account.id}/reset-password`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.data.account.status).toBe('MUST_CHANGE_CREDENTIALS');
    const newTemporaryPassword = resetRes.body.data.temporaryPassword;
    expect(newTemporaryPassword).toEqual(expect.any(String));

    const oldLoginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'MyOwnPassw0rd1' });
    expect(oldLoginRes.status).toBe(401);
    const newLoginRes = await request(app).post('/api/v1/auth/login').send({ email, password: newTemporaryPassword });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.data.mustChangeCredentials).toBe(true);
  });

  it('rejects Super Admin resetting school staff — that authority stays with School Admin', async () => {
    const { accountId } = await createActiveAccountOfRole(schoolAdmin.token, 'reset-superadmin-attempt', 'TEACHER', 'OldPassw0rd1');
    const res = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/reset-password`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects a Teacher attempting to reset another Teacher\'s password — this authority belongs to School Admin alone', async () => {
    const target = await createActiveAccountOfRole(schoolAdmin.token, 'reset-lateral-target', 'TEACHER', 'OldPassw0rd1');
    const actor = await createActiveAccountOfRole(schoolAdmin.token, 'reset-lateral-actor', 'TEACHER', 'ActorPassw0rd1');
    const actorLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: actor.email, password: 'ActorPassw0rd1' });

    const res = await request(app)
      .patch(`/api/v1/auth/accounts/${target.accountId}/reset-password`)
      .set('Authorization', `Bearer ${actorLogin.body.data.accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe('account lockout (Business Rules #10, #11, #17)', () => {
  it('locks the account after 5 failed attempts, rejects even the correct password while locked', async () => {
    const email = `auth-it-admin-${suffix}@example.com`;

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'WrongPassword1' });
      expect(res.status).toBe(401);
    }

    const stillLockedWithCorrectPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'AuthIT12345' });
    expect(stillLockedWithCorrectPassword.status).toBe(401);
    expect(stillLockedWithCorrectPassword.body.message).toMatch(/locked/i);
  });
});

describe('refresh token rotation and logout', () => {
  // Reuses the shared second School Admin (see the top-level beforeAll)
  // rather than creating its own — the lockout test above already consumed
  // the first account, and this file's password-reset budget only allows
  // two School Admins total. Read inside each it(), not at describe-body
  // scope, since the outer beforeAll that populates these hasn't run yet
  // when this describe callback itself executes.

  it('rejects reusing an already-rotated refresh token', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: secondSchoolAdminEmail, password: secondSchoolAdminPassword });
    const { refreshToken } = loginRes.body.data;

    const firstRefresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(firstRefresh.status).toBe(200);
    expect(firstRefresh.body.data.refreshToken).not.toBe(refreshToken);

    const reuseOldToken = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(reuseOldToken.status).toBe(401);
  });

  it('logout revokes the refresh token used, so it can no longer refresh', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: secondSchoolAdminEmail, password: secondSchoolAdminPassword });
    const { accessToken, refreshToken } = loginRes.body.data;

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogout = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(refreshAfterLogout.status).toBe(401);
  });
});
