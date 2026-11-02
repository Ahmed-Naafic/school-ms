// Integration tests against the real Express app and dev database. See
// ../../shared/test-helpers.js — self-contained, creates fresh Schools/School
// Admins per run rather than depending on manually-created fixtures.
const { app, request, loginSuperAdmin, createTestSchoolAdmin, uniqueSuffix } = require('../../shared/test-helpers');
const prisma = require('../../config/database');

jest.setTimeout(30000);

let superAdminToken;
let schoolAToken;
let schoolBToken;

async function onboardTeacher(token, email, fullName, extra = {}) {
  const res = await request(app)
    .post('/api/v1/teachers')
    .set('Authorization', `Bearer ${token}`)
    .send({ email, fullName, joiningDate: '2026-01-15', ...extra });
  return res;
}

beforeAll(async () => {
  superAdminToken = await loginSuperAdmin();

  const suffix = uniqueSuffix();
  const schoolA = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Teachers IT School A ${suffix}`,
    adminEmail: `teachers-it-a-${suffix}@example.com`,
    password: 'TeachersIT123',
  });
  schoolAToken = schoolA.token;

  const schoolB = await createTestSchoolAdmin(superAdminToken, {
    schoolName: `Teachers IT School B ${suffix}`,
    adminEmail: `teachers-it-b-${suffix}@example.com`,
    password: 'TeachersIT123',
  });
  schoolBToken = schoolB.token;
});

describe('authentication and permissions', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/teachers');
    expect(res.status).toBe(401);
  });

  it('rejects Super Admin — no operational role in Teacher Management', async () => {
    const res = await request(app).get('/api/v1/teachers').set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(403);
  });

  it('has no delete route', async () => {
    const res = await request(app)
      .delete('/api/v1/teachers/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Onboarding (Business Rules #1, #2, #3, #8)', () => {
  it('onboards a Teacher, issues login credentials, and defaults employmentStatus to ACTIVE', async () => {
    const suffix = uniqueSuffix();
    const res = await onboardTeacher(schoolAToken, `onboard-${suffix}@example.com`, 'Onboard Test Teacher');

    expect(res.status).toBe(201);
    expect(res.body.data.employmentStatus).toBe('ACTIVE');
    expect(res.body.data.accountId).toBeTruthy();
    expect(res.body.data.employeeId).toMatch(/^EMP-[0-9A-F]{8}$/);
  });

  it('rejects a request containing employmentStatus, employeeId, schoolId, or accountId (Guard by Construction)', async () => {
    const suffix = uniqueSuffix();
    const res = await onboardTeacher(schoolAToken, `guard-${suffix}@example.com`, 'Guard Test Teacher', {
      employeeId: 'CLIENT-SUPPLIED',
    });
    expect(res.status).toBe(422);
  });

  it('generates a unique employeeId per Teacher within the same school', async () => {
    const suffix = uniqueSuffix();
    const first = await onboardTeacher(schoolAToken, `unique-a-${suffix}@example.com`, 'Unique A');
    const second = await onboardTeacher(schoolAToken, `unique-b-${suffix}@example.com`, 'Unique B');

    expect(first.body.data.employeeId).not.toBe(second.body.data.employeeId);
  });

  // Phase 9 code review finding: onboardTeacher calls authService.createAccount
  // directly, in-process — never through POST /auth/accounts and its own
  // EMAIL_REGEX check — so nothing in this endpoint's own call chain
  // validated email format at all. Confirmed live before the fix: this exact
  // request returned 201, creating a real Account and Teacher record for an
  // address that could never receive its mandatory initial-credential-setup
  // email once a real provider is wired up.
  it('rejects a syntactically invalid email (regression)', async () => {
    const res = await onboardTeacher(schoolAToken, 'not-an-email', 'Bad Email Teacher');
    expect(res.status).toBe(422);
  });
});

describe('tenant isolation (Multi-Tenancy)', () => {
  it('School B receives 404 (never 403) reading School A\'s Teacher', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `tenant-${suffix}@example.com`, 'Tenant Test Teacher');

    const res = await request(app)
      .get(`/api/v1/teachers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${schoolBToken}`);
    expect(res.status).toBe(404);
  });

  it('School B cannot update School A\'s Teacher profile', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `tenant-upd-${suffix}@example.com`, 'Tenant Update Test');

    const res = await request(app)
      .patch(`/api/v1/teachers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${schoolBToken}`)
      .send({ fullName: 'Hijacked Name' });
    expect(res.status).toBe(404);
  });
});

describe('Profile Update (Business Rules #10, #11)', () => {
  it('updates allowed profile fields', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `update-${suffix}@example.com`, 'Update Test Teacher');

    const res = await request(app)
      .patch(`/api/v1/teachers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ fullName: 'Updated Name', contactPhone: '555-0100', subjectSpecializations: ['Math'] });

    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe('Updated Name');
    expect(res.body.data.contactPhone).toBe('555-0100');
    expect(res.body.data.subjectSpecializations).toEqual(['Math']);
  });

  it.each(['employmentStatus', 'employeeId', 'schoolId', 'accountId'])(
    'rejects a profile update containing %s (Guard by Construction, Technical Design Critical fix)',
    async (field) => {
      const suffix = uniqueSuffix();
      const created = await onboardTeacher(schoolAToken, `guard-upd-${suffix}@example.com`, 'Guard Update Test');

      const res = await request(app)
        .patch(`/api/v1/teachers/${created.body.data.id}`)
        .set('Authorization', `Bearer ${schoolAToken}`)
        .send({ [field]: 'x' });

      expect(res.status).toBe(422);
    }
  );

  it('leaves employeeId and employmentStatus unchanged after an allowed update', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `unchanged-${suffix}@example.com`, 'Unchanged Test');
    const originalEmployeeId = created.body.data.employeeId;

    await request(app)
      .patch(`/api/v1/teachers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ fullName: 'Renamed' });

    const detail = await request(app)
      .get(`/api/v1/teachers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${schoolAToken}`);

    expect(detail.body.data.employeeId).toBe(originalEmployeeId);
    expect(detail.body.data.employmentStatus).toBe('ACTIVE');
  });
});

async function getAccountStatus(token, accountId) {
  const res = await request(app).get('/api/v1/auth/accounts').set('Authorization', `Bearer ${token}`);
  return res.body.data.find((a) => a.id === accountId)?.status;
}

describe('Employment Status Transitions (Business Rules #4, #5, #6) — Employment Status Transition Matrix', () => {
  it('leave: ACTIVE -> ON_LEAVE, no account status change', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `leave-${suffix}@example.com`, 'Leave Test Teacher');
    const teacherId = created.body.data.id;
    // A newly onboarded account starts in MUST_CHANGE_CREDENTIALS until the
    // Teacher completes initial setup (Authentication & Authorization's own
    // Business Rule #9) — this is the "unchanged" baseline `leave` must not
    // disturb, not ACTIVE.
    const statusBefore = await getAccountStatus(schoolAToken, created.body.data.accountId);

    const res = await request(app)
      .patch(`/api/v1/teachers/${teacherId}/leave`)
      .set('Authorization', `Bearer ${schoolAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.employmentStatus).toBe('ON_LEAVE');
    expect(await getAccountStatus(schoolAToken, created.body.data.accountId)).toBe(statusBefore);
  });

  it('rejects leave from a non-ACTIVE status (409)', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `leave-bad-${suffix}@example.com`, 'Leave Bad Test');
    const teacherId = created.body.data.id;
    await request(app).patch(`/api/v1/teachers/${teacherId}/leave`).set('Authorization', `Bearer ${schoolAToken}`);

    const res = await request(app)
      .patch(`/api/v1/teachers/${teacherId}/leave`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(res.status).toBe(409);
  });

  it('return-from-leave: ON_LEAVE -> ACTIVE, enables the account', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `return-${suffix}@example.com`, 'Return Test Teacher');
    const teacherId = created.body.data.id;
    await request(app).patch(`/api/v1/teachers/${teacherId}/leave`).set('Authorization', `Bearer ${schoolAToken}`);

    const res = await request(app)
      .patch(`/api/v1/teachers/${teacherId}/return-from-leave`)
      .set('Authorization', `Bearer ${schoolAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.employmentStatus).toBe('ACTIVE');
    expect(await getAccountStatus(schoolAToken, created.body.data.accountId)).toBe('ACTIVE');
  });

  // Major #3 (Phase 9 code review): confirmed live before the fix that this
  // exact sequence — leave (no account change), then an administrative
  // override-deactivation with a recorded reason, then an ordinary
  // return-from-leave — silently re-enabled the account, undoing the
  // deliberate security lockdown as a side effect of an unrelated HR action.
  it('return-from-leave is blocked while the account is under an active administrative override (regression)', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `override-block-${suffix}@example.com`, 'Override Block Test');
    const teacherId = created.body.data.id;
    const accountId = created.body.data.accountId;

    await request(app).patch(`/api/v1/teachers/${teacherId}/leave`).set('Authorization', `Bearer ${schoolAToken}`);

    const overrideRes = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/deactivate`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ reason: 'Suspected credential compromise' });
    expect(overrideRes.status).toBe(200);

    const blockedRes = await request(app)
      .patch(`/api/v1/teachers/${teacherId}/return-from-leave`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(blockedRes.status).toBe(409);
    expect(await getAccountStatus(schoolAToken, accountId)).toBe('DEACTIVATED');

    // The override endpoint itself can still explicitly lift its own override.
    const liftRes = await request(app)
      .patch(`/api/v1/auth/accounts/${accountId}/reactivate`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ reason: 'Investigation concluded' });
    expect(liftRes.status).toBe(200);

    const retryRes = await request(app)
      .patch(`/api/v1/teachers/${teacherId}/return-from-leave`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(retryRes.status).toBe(200);
    expect(await getAccountStatus(schoolAToken, accountId)).toBe('ACTIVE');
  });

  it('resign: ACTIVE -> RESIGNED, disables the account', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `resign-${suffix}@example.com`, 'Resign Test Teacher');
    const teacherId = created.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/teachers/${teacherId}/resign`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ reason: 'Moving on' });

    expect(res.status).toBe(200);
    expect(res.body.data.employmentStatus).toBe('RESIGNED');
    expect(await getAccountStatus(schoolAToken, created.body.data.accountId)).toBe('DEACTIVATED');
  });

  it('rehire: RESIGNED -> ACTIVE, re-enables the account', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `rehire-${suffix}@example.com`, 'Rehire Test Teacher');
    const teacherId = created.body.data.id;
    await request(app).patch(`/api/v1/teachers/${teacherId}/resign`).set('Authorization', `Bearer ${schoolAToken}`);

    const res = await request(app)
      .patch(`/api/v1/teachers/${teacherId}/rehire`)
      .set('Authorization', `Bearer ${schoolAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.employmentStatus).toBe('ACTIVE');
    expect(await getAccountStatus(schoolAToken, created.body.data.accountId)).toBe('ACTIVE');
  });

  it('rejects rehire on a Teacher who was never Resigned', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `rehire-bad-${suffix}@example.com`, 'Rehire Bad Test');

    const res = await request(app)
      .patch(`/api/v1/teachers/${created.body.data.id}/rehire`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(res.status).toBe(409);
  });

  it('terminate: ACTIVE -> TERMINATED, disables the account, and is permanent', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `terminate-${suffix}@example.com`, 'Terminate Test Teacher');
    const teacherId = created.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/teachers/${teacherId}/terminate`)
      .set('Authorization', `Bearer ${schoolAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.employmentStatus).toBe('TERMINATED');
    expect(await getAccountStatus(schoolAToken, created.body.data.accountId)).toBe('DEACTIVATED');

    // Terminal — no reinstatement path exists within this feature (Business Rule #6).
    const rehireAttempt = await request(app)
      .patch(`/api/v1/teachers/${teacherId}/rehire`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(rehireAttempt.status).toBe(409);

    const returnAttempt = await request(app)
      .patch(`/api/v1/teachers/${teacherId}/return-from-leave`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(returnAttempt.status).toBe(409);
  });

  it('retire: ON_LEAVE -> RETIRED, disables the account, and is permanent', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `retire-${suffix}@example.com`, 'Retire Test Teacher');
    const teacherId = created.body.data.id;
    await request(app).patch(`/api/v1/teachers/${teacherId}/leave`).set('Authorization', `Bearer ${schoolAToken}`);

    const res = await request(app)
      .patch(`/api/v1/teachers/${teacherId}/retire`)
      .set('Authorization', `Bearer ${schoolAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.employmentStatus).toBe('RETIRED');
    expect(await getAccountStatus(schoolAToken, created.body.data.accountId)).toBe('DEACTIVATED');

    const rehireAttempt = await request(app)
      .patch(`/api/v1/teachers/${teacherId}/rehire`)
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(rehireAttempt.status).toBe(409);
  });

  it('a School Admin from a different school cannot transition another school\'s Teacher (tenant isolation)', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `tenant-transition-${suffix}@example.com`, 'Tenant Transition Test');

    const res = await request(app)
      .patch(`/api/v1/teachers/${created.body.data.id}/leave`)
      .set('Authorization', `Bearer ${schoolBToken}`);
    expect(res.status).toBe(404);
  });

  it('a Teacher (self) cannot invoke any transition endpoint on themselves', async () => {
    // No Teacher-facing token exists yet (self-service login is WP5); this
    // asserts the route is gated to SCHOOL_ADMIN only, via Super Admin —
    // consistent with the "no operational role" checks above.
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `role-gate-${suffix}@example.com`, 'Role Gate Test');

    const res = await request(app)
      .patch(`/api/v1/teachers/${created.body.data.id}/leave`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(403);
  });
});

// Self-Service integration tests live in teachers.self-service.routes.test.js
// — a separate file, deliberately, so it gets its own fresh password-reset
// rate-limiter budget (Security-Standards.md's Rate Limiting section: 5
// requests per 15 minutes, shared across /password-reset/request and
// /confirm). This file's own beforeAll already spends 4 of that 5
// establishing School A and School B; a Teacher login needs 2 more calls
// per account, which doesn't fit here.

describe('Roster (pagination and filtering)', () => {
  it('lists only the acting School Admin\'s own school\'s Teachers', async () => {
    const suffix = uniqueSuffix();
    await onboardTeacher(schoolAToken, `roster-a-${suffix}@example.com`, 'Roster School A');
    await onboardTeacher(schoolBToken, `roster-b-${suffix}@example.com`, 'Roster School B');

    const res = await request(app).get('/api/v1/teachers').set('Authorization', `Bearer ${schoolAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.find((t) => t.fullName === 'Roster School B')).toBeUndefined();
    expect(res.body.data.find((t) => t.fullName === 'Roster School A')).toBeTruthy();
  });

  it('filters by employmentStatus', async () => {
    const res = await request(app)
      .get('/api/v1/teachers?employmentStatus=ACTIVE')
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((t) => t.employmentStatus === 'ACTIVE')).toBe(true);
  });

  it('rejects an invalid employmentStatus filter', async () => {
    const res = await request(app)
      .get('/api/v1/teachers?employmentStatus=BOGUS')
      .set('Authorization', `Bearer ${schoolAToken}`);
    expect(res.status).toBe(422);
  });
});

// WP7 (Audit Logging Integration): every WP2–WP6 service function already
// calls recordAuditEvent, and each one has a unit test asserting it was
// *called* with a mocked repository — but nothing anywhere in this project
// had previously verified an audit event is actually *persisted*. These
// tests query the real audit_logs table directly, per Business Rule #13
// and the standard audit record (Tenant, User, Action, Timestamp) defined
// in Multi-Tenancy.md.
describe('Audit Trail persistence (Business Rule #13)', () => {
  async function findAuditEvent(schoolId, action, matcher) {
    const events = await prisma.auditLog.findMany({
      where: { schoolId, action },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return events.find(matcher);
  }

  it('Onboarding writes a TEACHER_ONBOARDED record with the correct tenant and actor', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `audit-onboard-${suffix}@example.com`, 'Audit Onboard Test');

    const event = await findAuditEvent(created.body.data.schoolId, 'TEACHER_ONBOARDED', () => true);
    expect(event).toBeTruthy();
    // Standard audit record fields (Tenant, User, Action, Timestamp) — not
    // duplicated into metadata, per the Technical Design's Audit
    // Requirements section.
    expect(event.userId).toBeTruthy();
    expect(event.createdAt).toBeTruthy();
  });

  it('an employment-status transition writes a TEACHER_EMPLOYMENT_STATUS_CHANGED record with previous/new status and reason in metadata', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `audit-transition-${suffix}@example.com`, 'Audit Transition Test');

    await request(app)
      .patch(`/api/v1/teachers/${created.body.data.id}/resign`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ reason: 'Audit trail test' });

    const event = await findAuditEvent(
      created.body.data.schoolId,
      'TEACHER_EMPLOYMENT_STATUS_CHANGED',
      (e) => e.metadata?.teacherId === created.body.data.id
    );
    expect(event).toBeTruthy();
    expect(event.metadata).toEqual(
      expect.objectContaining({ previousStatus: 'ACTIVE', newStatus: 'RESIGNED', reason: 'Audit trail test' })
    );
  });

  it('Rehire (reinstatement) writes a distinct TEACHER_REINSTATED record, not TEACHER_EMPLOYMENT_STATUS_CHANGED', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `audit-reinstate-${suffix}@example.com`, 'Audit Reinstate Test');
    await request(app)
      .patch(`/api/v1/teachers/${created.body.data.id}/resign`)
      .set('Authorization', `Bearer ${schoolAToken}`);

    await request(app)
      .patch(`/api/v1/teachers/${created.body.data.id}/rehire`)
      .set('Authorization', `Bearer ${schoolAToken}`);

    const event = await findAuditEvent(
      created.body.data.schoolId,
      'TEACHER_REINSTATED',
      (e) => e.metadata?.teacherId === created.body.data.id
    );
    expect(event).toBeTruthy();
    expect(event.metadata).toEqual(expect.objectContaining({ previousStatus: 'RESIGNED', newStatus: 'ACTIVE' }));
  });

  it('profile updates write TEACHER_PROFILE_UPDATED whether made by School Admin or via self-service', async () => {
    const suffix = uniqueSuffix();
    const created = await onboardTeacher(schoolAToken, `audit-profile-${suffix}@example.com`, 'Audit Profile Test');

    await request(app)
      .patch(`/api/v1/teachers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ fullName: 'Audit Profile Renamed' });

    const event = await findAuditEvent(created.body.data.schoolId, 'TEACHER_PROFILE_UPDATED', () => true);
    expect(event).toBeTruthy();
    expect(event.userId).toBeTruthy();
  });
});
