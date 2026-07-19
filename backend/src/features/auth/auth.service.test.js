jest.mock('./auth.repository');
jest.mock('../../shared/audit');
jest.mock('../../shared/password');
jest.mock('../../shared/jwt');
// Default all tests to "development" mode (the raw token is logged, and
// requestPasswordReset behaves as before this mode was introduced); the
// "disabled" mode is tested separately below via jest.isolateModules.
jest.mock('../../config/password-reset', () => ({ PASSWORD_RESET_DELIVERY_MODE: 'development' }));

const repository = require('./auth.repository');
const { recordAuditEvent } = require('../../shared/audit');
const { hashPassword, verifyPassword } = require('../../shared/password');
const jwtHelpers = require('../../shared/jwt');
const service = require('./auth.service');

beforeEach(() => {
  jest.clearAllMocks();
  jwtHelpers.signAccessToken.mockReturnValue('signed-access-token');
  jwtHelpers.generateRefreshToken.mockReturnValue('raw-refresh-token');
  jwtHelpers.hashRefreshToken.mockReturnValue('hashed-refresh-token');
  jwtHelpers.refreshTokenExpiryDate.mockReturnValue(new Date('2030-01-01'));
  repository.createRefreshToken.mockResolvedValue({});
});

const activeAccount = {
  id: 'acc-1',
  email: 'a@example.com',
  passwordHash: 'hash',
  status: 'ACTIVE',
  role: 'SCHOOL_ADMIN',
  schoolId: 'school-1',
  failedLoginAttempts: 0,
  lockedUntil: null,
  school: { lifecycleStatus: 'ACTIVE' },
};

describe('login (Business Rules #1, #10, #11, #12, #15)', () => {
  it('rejects a non-existent account with a generic message (no enumeration)', async () => {
    repository.findByEmail.mockResolvedValue(null);

    await expect(service.login({ email: 'nope@example.com', password: 'x' })).rejects.toThrow(
      'Invalid email or password'
    );
  });

  it('rejects a deactivated account with the same generic message', async () => {
    repository.findByEmail.mockResolvedValue({ ...activeAccount, status: 'DEACTIVATED' });

    await expect(service.login({ email: 'a@example.com', password: 'x' })).rejects.toThrow(
      'Invalid email or password'
    );
  });

  it('reveals the specific "temporarily locked" message only once the correct password is proven (regression — no pre-auth enumeration)', async () => {
    repository.findByEmail.mockResolvedValue({
      ...activeAccount,
      status: 'LOCKED',
      lockedUntil: new Date(Date.now() + 60_000),
    });
    verifyPassword.mockResolvedValue(true);

    await expect(service.login({ email: 'a@example.com', password: 'CorrectPassword1' })).rejects.toThrow(
      'Account is temporarily locked'
    );
    expect(verifyPassword).toHaveBeenCalled();
  });

  it('gives a wrong password against a locked account the same generic failure as any other wrong password (regression)', async () => {
    repository.findByEmail.mockResolvedValue({
      ...activeAccount,
      status: 'LOCKED',
      lockedUntil: new Date(Date.now() + 60_000),
    });
    verifyPassword.mockResolvedValue(false);

    await expect(service.login({ email: 'a@example.com', password: 'WrongPassword1' })).rejects.toThrow(
      'Invalid email or password'
    );
    // Must not extend the lockout further or count as a fresh failed attempt.
    expect(repository.recordFailedAttempt).not.toHaveBeenCalled();
  });

  it('auto-unlocks a locked account once the cool-down has elapsed, then proceeds to check the password', async () => {
    repository.findByEmail.mockResolvedValue({
      ...activeAccount,
      status: 'LOCKED',
      lockedUntil: new Date(Date.now() - 60_000),
    });
    verifyPassword.mockResolvedValue(true);

    await service.login({ email: 'a@example.com', password: 'CorrectPassword1' });

    expect(repository.resetFailedAttempts).toHaveBeenCalledWith('acc-1');
    expect(verifyPassword).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCOUNT_UNLOCKED' }));
  });

  it('gives an account with no password set up yet the same generic failure, never a distinguishing message (regression)', async () => {
    repository.findByEmail.mockResolvedValue({ ...activeAccount, passwordHash: null });

    await expect(service.login({ email: 'a@example.com', password: 'x' })).rejects.toThrow(
      'Invalid email or password'
    );
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('locks the account after reaching the failure threshold (Business Rule #10) and revokes its refresh tokens (regression)', async () => {
    repository.findByEmail.mockResolvedValue({ ...activeAccount, failedLoginAttempts: 4 });
    verifyPassword.mockResolvedValue(false);

    await expect(service.login({ email: 'a@example.com', password: 'wrong' })).rejects.toThrow(
      'Invalid email or password'
    );

    expect(repository.recordFailedAttempt).toHaveBeenCalledWith('acc-1', 5, expect.any(Date));
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCOUNT_LOCKED' }));
    expect(repository.revokeAllRefreshTokensForAccount).toHaveBeenCalledWith('acc-1');
  });

  it('does not lock the account below the threshold', async () => {
    repository.findByEmail.mockResolvedValue({ ...activeAccount, failedLoginAttempts: 1 });
    verifyPassword.mockResolvedValue(false);

    await expect(service.login({ email: 'a@example.com', password: 'wrong' })).rejects.toThrow();

    expect(repository.recordFailedAttempt).toHaveBeenCalledWith('acc-1', 2, null);
    expect(recordAuditEvent).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCOUNT_LOCKED' }));
  });

  it('rejects login for a user whose school is suspended, only after password verification (regression — no pre-auth enumeration)', async () => {
    repository.findByEmail.mockResolvedValue({
      ...activeAccount,
      school: { lifecycleStatus: 'SUSPENDED' },
    });
    verifyPassword.mockResolvedValue(false);

    await expect(service.login({ email: 'a@example.com', password: 'wrong' })).rejects.toThrow(
      'Invalid email or password'
    );
  });

  it('reveals the specific "school not active" message only once the password is confirmed correct', async () => {
    repository.findByEmail.mockResolvedValue({
      ...activeAccount,
      school: { lifecycleStatus: 'SUSPENDED' },
    });
    verifyPassword.mockResolvedValue(true);

    await expect(service.login({ email: 'a@example.com', password: 'CorrectPassword1' })).rejects.toThrow(
      'Your school is not currently active'
    );
  });

  it('succeeds with correct credentials on an active account/school, issuing tokens', async () => {
    repository.findByEmail.mockResolvedValue(activeAccount);
    verifyPassword.mockResolvedValue(true);

    const result = await service.login({ email: 'a@example.com', password: 'CorrectPassword1' });

    expect(result.accessToken).toBe('signed-access-token');
    expect(result.refreshToken).toBe('raw-refresh-token');
    expect(result.account.passwordHash).toBeUndefined();
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUCCESSFUL_LOGIN' }));
  });
});

describe('refreshAccessToken (token rotation)', () => {
  it('rejects a revoked refresh token', async () => {
    repository.findRefreshTokenByHash.mockResolvedValue({ id: 'rt-1', revokedAt: new Date() });

    await expect(service.refreshAccessToken({ refreshToken: 'x' })).rejects.toThrow(
      'Invalid or expired refresh token'
    );
  });

  it('rejects an expired refresh token', async () => {
    repository.findRefreshTokenByHash.mockResolvedValue({
      id: 'rt-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.refreshAccessToken({ refreshToken: 'x' })).rejects.toThrow();
  });

  it('rotates the token: revokes the old one and issues a new pair', async () => {
    repository.findRefreshTokenByHash.mockResolvedValue({
      id: 'rt-1',
      accountId: 'acc-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    });
    repository.findByIdWithSchool.mockResolvedValue(activeAccount);

    const result = await service.refreshAccessToken({ refreshToken: 'x' });

    expect(repository.revokeRefreshToken).toHaveBeenCalledWith('rt-1');
    expect(result.accessToken).toBe('signed-access-token');
  });

  it('rejects refresh for a deactivated account', async () => {
    repository.findRefreshTokenByHash.mockResolvedValue({
      id: 'rt-1',
      accountId: 'acc-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    });
    repository.findByIdWithSchool.mockResolvedValue({ ...activeAccount, status: 'DEACTIVATED' });

    await expect(service.refreshAccessToken({ refreshToken: 'x' })).rejects.toThrow('Account is not active');
  });
});

describe('requestPasswordReset (anti-enumeration, Business Rule #13)', () => {
  it('is a silent no-op for a non-existent account', async () => {
    repository.findByEmail.mockResolvedValue(null);

    await service.requestPasswordReset({ email: 'nope@example.com' });

    expect(repository.createPasswordResetToken).not.toHaveBeenCalled();
  });

  it('is a silent no-op for a deactivated account', async () => {
    repository.findByEmail.mockResolvedValue({ ...activeAccount, status: 'DEACTIVATED' });

    await service.requestPasswordReset({ email: 'a@example.com' });

    expect(repository.createPasswordResetToken).not.toHaveBeenCalled();
  });
});

// Behavior under other delivery modes ("disabled", "email"/"sms") is covered
// in password-reset-delivery.test.js, which — unlike this file — does not
// mock ../../config/password-reset at all, so each test can set the real
// env var and require the modules fresh via jest.resetModules().

describe('changePassword', () => {
  it('rejects an incorrect current password', async () => {
    repository.findById.mockResolvedValue(activeAccount);
    verifyPassword.mockResolvedValue(false);

    await expect(
      service.changePassword({ accountId: 'acc-1', currentPassword: 'wrong', newPassword: 'NewPass123' })
    ).rejects.toThrow('Current password is incorrect');
  });

  it('revokes all refresh tokens on a successful change', async () => {
    repository.findById.mockResolvedValue(activeAccount);
    verifyPassword.mockResolvedValue(true);
    hashPassword.mockResolvedValue('new-hash');

    await service.changePassword({ accountId: 'acc-1', currentPassword: 'old', newPassword: 'NewPass123' });

    expect(repository.revokeAllRefreshTokensForAccount).toHaveBeenCalledWith('acc-1');
  });
});

describe('account lifecycle: deactivate/reactivate/unlock (Business Rules #6, #18)', () => {
  const teacherTarget = { id: 'target-1', role: 'TEACHER', schoolId: 'school-1' };

  // ACR-001 (Business Rule #25): this test previously called
  // deactivateAccount with no third argument at all, exercising a Teacher
  // target with no reason and expecting success. Under the new default
  // context (`{ source: 'authentication_override', reason: null }`), that
  // exact call now correctly fails — not a regression to preserve, but the
  // intended effect of an approved business rule. Split into the two cases
  // that replace it.
  it('lets a School Admin deactivate a Teacher in their own school via the override path, when a reason is supplied', async () => {
    repository.findById.mockResolvedValue(teacherTarget);
    repository.updateStatus.mockResolvedValue({ ...teacherTarget, status: 'DEACTIVATED' });

    await service.deactivateAccount(
      'target-1',
      { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' },
      { source: 'authentication_override', reason: 'Security incident' }
    );

    expect(repository.updateStatus).toHaveBeenCalledWith('target-1', 'DEACTIVATED', undefined, {
      deactivatedByOverride: true,
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { reason: 'Security incident' } })
    );
  });

  it('rejects deactivating a Teacher via the override path when no reason is supplied (Business Rule #25)', async () => {
    repository.findById.mockResolvedValue(teacherTarget);

    await expect(
      service.deactivateAccount('target-1', { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' })
    ).rejects.toThrow('A reason is required to directly override a Teacher account.');
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it('lets a School Admin deactivate a Teacher with no reason when the call is Teacher Management-sourced (ACR-001)', async () => {
    repository.findById.mockResolvedValue(teacherTarget);
    repository.updateStatus.mockResolvedValue({ ...teacherTarget, status: 'DEACTIVATED' });

    await service.deactivateAccount(
      'target-1',
      { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' },
      { source: 'teacher_management', reason: null }
    );

    expect(repository.updateStatus).toHaveBeenCalledWith('target-1', 'DEACTIVATED', undefined, {
      deactivatedByOverride: false,
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ metadata: null }));
  });

  it('does not require a reason to deactivate a non-Teacher account via the override path (ACR-001 does not extend beyond Teacher)', async () => {
    const accountantTarget = { id: 'target-1', role: 'ACCOUNTANT', schoolId: 'school-1' };
    repository.findById.mockResolvedValue(accountantTarget);
    repository.updateStatus.mockResolvedValue({ ...accountantTarget, status: 'DEACTIVATED' });

    await service.deactivateAccount('target-1', { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' });

    expect(repository.updateStatus).toHaveBeenCalledWith('target-1', 'DEACTIVATED', undefined, {
      deactivatedByOverride: true,
    });
  });

  // Phase 9 code review (Teacher Management) finding: this used to throw
  // AuthorizationError (403) — a different status code than a genuinely
  // nonexistent account gets (401, itself corrected to 404 below) — letting
  // the response alone confirm an account exists in another tenant.
  it('rejects a School Admin deactivating a Teacher in a different school with the same NotFoundError a nonexistent account gets (tenant isolation)', async () => {
    repository.findById.mockResolvedValue({ ...teacherTarget, schoolId: 'other-school' });

    await expect(
      service.deactivateAccount('target-1', { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects deactivating a genuinely nonexistent account with the same statusCode (404)', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      service.deactivateAccount('missing-1', { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // A role-scope mismatch (not a tenant boundary) stays 403 — Super Admin
  // isn't tenant-bound, so revealing "this account exists but you can't
  // manage this role" isn't a cross-tenant leak the way it is for a School
  // Admin targeting another school.
  it('still rejects Super Admin directly managing a Teacher with AuthorizationError (403), unaffected by the tenant-isolation fix', async () => {
    repository.findById.mockResolvedValue(teacherTarget);

    await expect(
      service.deactivateAccount('target-1', { id: 'super-1', role: 'SUPER_ADMIN' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a School Admin managing another School Admin account', async () => {
    repository.findById.mockResolvedValue({ id: 'target-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' });

    await expect(
      service.deactivateAccount('target-1', { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' })
    ).rejects.toThrow();
  });

  it('rejects Super Admin directly deactivating a Teacher (regression — Permissions: Super Admin may not directly manage Teacher/Student/Accountant accounts)', async () => {
    repository.findById.mockResolvedValue(teacherTarget);

    await expect(
      service.deactivateAccount('target-1', { id: 'super-1', role: 'SUPER_ADMIN' })
    ).rejects.toThrow();
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it('lets Super Admin restore a School Admin account (Business Rule #18)', async () => {
    repository.findById.mockResolvedValue({ id: 'target-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' });
    repository.unlockAccount.mockResolvedValue({ id: 'target-1', status: 'ACTIVE' });

    await service.unlockAccount('target-1', { id: 'super-1', role: 'SUPER_ADMIN' });

    expect(repository.unlockAccount).toHaveBeenCalledWith('target-1');
  });

  it('rejects Super Admin directly unlocking a Teacher account (regression)', async () => {
    repository.findById.mockResolvedValue(teacherTarget);

    await expect(service.unlockAccount('target-1', { id: 'super-1', role: 'SUPER_ADMIN' })).rejects.toThrow();
    expect(repository.unlockAccount).not.toHaveBeenCalled();
  });

  it('rejects reactivating a Teacher via the override path when no reason is supplied (Business Rule #25)', async () => {
    repository.findById.mockResolvedValue(teacherTarget);

    await expect(
      service.reactivateAccount('target-1', { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' })
    ).rejects.toThrow('A reason is required to directly override a Teacher account.');
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it('lets Super Admin restore any account regardless of school (Business Rule #18)', async () => {
    repository.findById.mockResolvedValue({ id: 'target-1', role: 'SCHOOL_ADMIN', schoolId: 'some-school' });
    repository.updateStatus.mockResolvedValue({ id: 'target-1', status: 'ACTIVE' });

    await service.reactivateAccount('target-1', { id: 'super-1', role: 'SUPER_ADMIN' });

    expect(repository.updateStatus).toHaveBeenCalledWith('target-1', 'ACTIVE', undefined, {
      deactivatedByOverride: false,
    });
  });

  it('never lets the last remaining Super Admin be deactivated', async () => {
    repository.findById.mockResolvedValue({ id: 'target-1', role: 'SUPER_ADMIN' });
    repository.countActiveSuperAdmins.mockResolvedValue(1);

    await expect(
      service.deactivateAccount('target-1', { id: 'super-2', role: 'SUPER_ADMIN' })
    ).rejects.toThrow('Cannot deactivate or change the role of the last remaining Super Admin account');
  });

  it('allows deactivating a Super Admin when another one still exists', async () => {
    repository.findById.mockResolvedValue({ id: 'target-1', role: 'SUPER_ADMIN' });
    repository.countActiveSuperAdmins.mockResolvedValue(2);
    repository.updateStatus.mockResolvedValue({ id: 'target-1', status: 'DEACTIVATED' });

    await service.deactivateAccount('target-1', { id: 'super-2', role: 'SUPER_ADMIN' });

    expect(repository.updateStatus).toHaveBeenCalledWith('target-1', 'DEACTIVATED', undefined, {
      deactivatedByOverride: true,
    });
  });

  // Major #3 (Phase 9 code review, Teacher Management): a routine
  // reactivating transition (Teacher Management's Return from Leave/Rehire)
  // used to unconditionally re-enable an account, even when its current
  // DEACTIVATED status came from a deliberate, reason-recorded
  // administrative/security override rather than from Teacher Management's
  // own last sync — silently undoing a security lockdown as a side effect of
  // an unrelated HR action. Verified live end-to-end before the fix: leave
  // (no account change) -> override-deactivate with a reason -> ordinary
  // return-from-leave -> account silently flipped back to ACTIVE.
  describe('override-vs-routine-transition precedence (regression)', () => {
    const overriddenTeacher = { id: 'target-1', role: 'TEACHER', schoolId: 'school-1', deactivatedByOverride: true };

    it('blocks a Teacher Management-sourced reactivation while an administrative override is active', async () => {
      repository.findById.mockResolvedValue(overriddenTeacher);

      await expect(
        service.reactivateAccount(
          'target-1',
          { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' },
          { source: 'teacher_management', reason: null }
        )
      ).rejects.toThrow('deactivated via an administrative/security override');
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('still allows the explicit override endpoint itself to lift its own override', async () => {
      repository.findById.mockResolvedValue(overriddenTeacher);
      repository.updateStatus.mockResolvedValue({ ...overriddenTeacher, status: 'ACTIVE' });

      await service.reactivateAccount(
        'target-1',
        { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' },
        { source: 'authentication_override', reason: 'Investigation concluded' }
      );

      expect(repository.updateStatus).toHaveBeenCalledWith('target-1', 'ACTIVE', undefined, {
        deactivatedByOverride: false,
      });
    });

    it('does not block a Teacher Management-sourced reactivation when the account was not under an active override', async () => {
      repository.findById.mockResolvedValue({ ...teacherTarget, deactivatedByOverride: false });
      repository.updateStatus.mockResolvedValue({ ...teacherTarget, status: 'ACTIVE' });

      await service.reactivateAccount(
        'target-1',
        { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' },
        { source: 'teacher_management', reason: null }
      );

      expect(repository.updateStatus).toHaveBeenCalledWith('target-1', 'ACTIVE', undefined, {
        deactivatedByOverride: false,
      });
    });

    it('preserves an active override marker across a Teacher Management-sourced disable, so a later rehire stays blocked', async () => {
      repository.findById.mockResolvedValue(overriddenTeacher);
      repository.updateStatus.mockResolvedValue({ ...overriddenTeacher, status: 'DEACTIVATED' });

      await service.deactivateAccount(
        'target-1',
        { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' },
        { source: 'teacher_management', reason: null }
      );

      expect(repository.updateStatus).toHaveBeenCalledWith('target-1', 'DEACTIVATED', undefined, {
        deactivatedByOverride: true,
      });
    });
  });
});

describe('changeRole (Business Rules #7, #19)', () => {
  it('rejects a user changing their own role', async () => {
    await expect(
      service.changeRole('self-1', 'TEACHER', { id: 'self-1', role: 'SCHOOL_ADMIN' })
    ).rejects.toThrow('You may not change your own role');
  });

  it('rejects a School Admin assigning SCHOOL_ADMIN or SUPER_ADMIN', async () => {
    repository.findById.mockResolvedValue({ id: 'target-1', role: 'TEACHER', schoolId: 'school-1' });

    await expect(
      service.changeRole('target-1', 'SCHOOL_ADMIN', { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' })
    ).rejects.toThrow('School Admin may only assign Accountant, Teacher, or Student roles');
  });

  it('lets a School Admin reassign a Teacher to Accountant within their own school', async () => {
    repository.findById.mockResolvedValue({ id: 'target-1', role: 'TEACHER', schoolId: 'school-1' });
    repository.updateRole.mockResolvedValue({ id: 'target-1', role: 'ACCOUNTANT' });

    await service.changeRole('target-1', 'ACCOUNTANT', { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' });

    expect(repository.updateRole).toHaveBeenCalledWith('target-1', 'ACCOUNTANT');
  });

  it('rejects changing an existing Super Admin\'s role away from Super Admin (regression — only account creation may set/unset Super Admin)', async () => {
    repository.findById.mockResolvedValue({ id: 'target-1', role: 'SUPER_ADMIN' });

    await expect(
      service.changeRole('target-1', 'SCHOOL_ADMIN', { id: 'super-2', role: 'SUPER_ADMIN' })
    ).rejects.toThrow('Super Admin status can only be granted through account creation, not a role change');
    expect(repository.updateRole).not.toHaveBeenCalled();
  });

  it('rejects promoting an existing account to Super Admin via role change (regression)', async () => {
    repository.findById.mockResolvedValue({ id: 'target-1', role: 'TEACHER', schoolId: 'school-1' });

    await expect(
      service.changeRole('target-1', 'SUPER_ADMIN', { id: 'super-2', role: 'SUPER_ADMIN' })
    ).rejects.toThrow('Super Admin status can only be granted through account creation, not a role change');
    expect(repository.updateRole).not.toHaveBeenCalled();
  });

  it('lets Super Admin reassign a school-scoped role without touching schoolId', async () => {
    repository.findById.mockResolvedValue({ id: 'target-1', role: 'TEACHER', schoolId: 'school-1' });
    repository.updateRole.mockResolvedValue({ id: 'target-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' });

    await service.changeRole('target-1', 'SCHOOL_ADMIN', { id: 'super-2', role: 'SUPER_ADMIN' });

    expect(repository.updateRole).toHaveBeenCalledWith('target-1', 'SCHOOL_ADMIN');
  });

  it('revokes the target account\'s refresh tokens on a successful role change (regression)', async () => {
    repository.findById.mockResolvedValue({ id: 'target-1', role: 'TEACHER', schoolId: 'school-1' });
    repository.updateRole.mockResolvedValue({ id: 'target-1', role: 'ACCOUNTANT' });

    await service.changeRole('target-1', 'ACCOUNTANT', { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' });

    expect(repository.revokeAllRefreshTokensForAccount).toHaveBeenCalledWith('target-1');
  });
});

describe('logout (regression — must only revoke a token belonging to the caller)', () => {
  it('revokes the token when it belongs to the authenticated caller', async () => {
    repository.findRefreshTokenByHash.mockResolvedValue({ id: 'rt-1', accountId: 'acc-1', revokedAt: null });

    await service.logout({ refreshToken: 'x' }, { id: 'acc-1' });

    expect(repository.revokeRefreshToken).toHaveBeenCalledWith('rt-1');
  });

  it('does nothing if the token belongs to a different account', async () => {
    repository.findRefreshTokenByHash.mockResolvedValue({ id: 'rt-1', accountId: 'acc-1', revokedAt: null });

    await service.logout({ refreshToken: 'x' }, { id: 'someone-else' });

    expect(repository.revokeRefreshToken).not.toHaveBeenCalled();
  });
});

describe('createAccount role-creation matrix (Business Rules #6, #19, #24)', () => {
  it('rejects a School Admin creating a School Admin account', async () => {
    repository.findByEmail.mockResolvedValue(null);

    await expect(
      service.createAccount(
        { email: 'x@example.com', role: 'SCHOOL_ADMIN' },
        { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' }
      )
    ).rejects.toThrow();
  });

  it('lets Super Admin create an additional Super Admin account', async () => {
    repository.findByEmail.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'new-1', role: 'SUPER_ADMIN', schoolId: null });

    await service.createAccount({ email: 'x@example.com', role: 'SUPER_ADMIN' }, { id: 'super-1', role: 'SUPER_ADMIN' });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'SUPER_ADMIN', schoolId: null, passwordHash: null }),
      undefined
    );
  });

  it('rejects a duplicate email', async () => {
    repository.findByEmail.mockResolvedValue({ id: 'existing' });

    await expect(
      service.createAccount({ email: 'x@example.com', role: 'TEACHER' }, { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 's1' })
    ).rejects.toThrow('An account with this email already exists');
  });

  it('requires schoolId when Super Admin creates a School Admin', async () => {
    repository.findByEmail.mockResolvedValue(null);

    await expect(
      service.createAccount({ email: 'x@example.com', role: 'SCHOOL_ADMIN' }, { id: 'super-1', role: 'SUPER_ADMIN' })
    ).rejects.toThrow('schoolId is required');
  });

  // Phase 9 code review (Teacher Management) finding: this in-process call
  // is the only gate for callers that never go through auth.validation.js's
  // own EMAIL_REGEX check (POST /auth/accounts only) — Teacher Management's
  // and Student Management's onboarding/admission both call this directly,
  // and previously had no email-format check anywhere in their own call
  // chains. Confirmed live before the fix: POST /teachers with
  // email: "not-an-email" returned 201.
  it('rejects a malformed email before any existence check or write (regression)', async () => {
    await expect(
      service.createAccount(
        { email: 'not-an-email', role: 'TEACHER' },
        { id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' }
      )
    ).rejects.toThrow('Invalid account request');
    expect(repository.findByEmail).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });
});

describe('createInitialSchoolAdmin email format (regression)', () => {
  it('rejects a malformed email before any existence check or write', async () => {
    await expect(service.createInitialSchoolAdmin({ email: 'not-an-email', schoolId: 'school-1' })).rejects.toThrow(
      'Invalid account request'
    );
    expect(repository.findByEmail).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('accepts a well-formed email', async () => {
    repository.findByEmail.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'new-1', email: 'admin@example.com' });

    await service.createInitialSchoolAdmin({ email: 'admin@example.com', schoolId: 'school-1' });

    expect(repository.create).toHaveBeenCalled();
  });
});

describe('bootstrapSuperAdmin (Business Rule #23 — idempotent)', () => {
  it('creates the first Super Admin when none exists', async () => {
    repository.countActiveSuperAdmins.mockResolvedValue(0);
    hashPassword.mockResolvedValue('hash');
    repository.create.mockResolvedValue({ id: 'super-1' });

    const result = await service.bootstrapSuperAdmin({ email: 'super@example.com', password: 'Bootstrap123' });

    expect(result.created).toBe(true);
  });

  it('is a no-op if a Super Admin already exists', async () => {
    repository.countActiveSuperAdmins.mockResolvedValue(1);

    const result = await service.bootstrapSuperAdmin({ email: 'super@example.com', password: 'Bootstrap123' });

    expect(result.created).toBe(false);
    expect(repository.create).not.toHaveBeenCalled();
  });
});
