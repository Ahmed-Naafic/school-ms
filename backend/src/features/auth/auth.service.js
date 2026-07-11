const repository = require('./auth.repository');
const { hashPassword, verifyPassword } = require('../../shared/password');
const {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiryDate,
} = require('../../shared/jwt');
const crypto = require('crypto');
const { recordAuditEvent } = require('../../shared/audit');
const { AuthenticationError, AuthorizationError, ConflictError, ValidationError } = require('../../shared/errors');
const { LOCKOUT_THRESHOLD, LOCKOUT_DURATION_MINUTES } = require('../../config/security');

const PASSWORD_RESET_TOKEN_EXPIRY_HOURS = 1;

function sanitizeAccount(account) {
  const { passwordHash, ...safe } = account;
  return safe;
}

async function issueTokenPair(account) {
  const accessToken = signAccessToken(account);
  const rawRefreshToken = generateRefreshToken();

  await repository.createRefreshToken({
    tokenHash: hashRefreshToken(rawRefreshToken),
    accountId: account.id,
    expiresAt: refreshTokenExpiryDate(),
  });

  return { accessToken, refreshToken: rawRefreshToken };
}

// ---------------------------------------------------------------------------
// Platform Bootstrap (Business Rule #23) — called only by prisma/seed.js,
// never by an HTTP route. Idempotent: never creates a second Super Admin.
// ---------------------------------------------------------------------------
async function bootstrapSuperAdmin({ email, password }) {
  const existingCount = await repository.countActiveSuperAdmins();
  if (existingCount > 0) {
    return { created: false };
  }

  const passwordHash = await hashPassword(password);
  const account = await repository.create({
    email,
    passwordHash,
    role: 'SUPER_ADMIN',
    status: 'MUST_CHANGE_CREDENTIALS',
    schoolId: null,
  });

  await recordAuditEvent({ userId: account.id, action: 'PLATFORM_BOOTSTRAP' });
  return { created: true, account: sanitizeAccount(account) };
}

// ---------------------------------------------------------------------------
// Account creation
// ---------------------------------------------------------------------------

// Called by School & Platform Management when a new school is created.
// Business Rule #2: every new school is created together with exactly one
// initial School Admin account, whose credentials the owner establishes
// themselves (Business Rule #9) via the password-recovery flow, since no
// password is set here.
async function createInitialSchoolAdmin({ email, schoolId }) {
  const existing = await repository.findByEmail(email);
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const account = await repository.create({
    email,
    passwordHash: null,
    role: 'SCHOOL_ADMIN',
    status: 'MUST_CHANGE_CREDENTIALS',
    schoolId,
  });

  await recordAuditEvent({ schoolId, userId: account.id, action: 'ACCOUNT_CREATED' });
  return sanitizeAccount(account);
}

// General account creation, enforcing the role-creation matrix from
// Authentication-and-Authorization.md's Permissions section:
// - Super Admin creates School Admin or additional Super Admin accounts.
// - School Admin creates Accountant, Teacher, Student within their own school.
async function createAccount({ email, role, schoolId }, actingUser) {
  const existing = await repository.findByEmail(email);
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  let targetSchoolId;

  if (actingUser.role === 'SUPER_ADMIN') {
    if (!['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new AuthorizationError('Super Admin may only create School Admin or Super Admin accounts');
    }
    if (role === 'SUPER_ADMIN') {
      targetSchoolId = null;
    } else {
      if (!schoolId) {
        throw new ValidationError('schoolId is required when creating a School Admin account');
      }
      targetSchoolId = schoolId;
    }
  } else if (actingUser.role === 'SCHOOL_ADMIN') {
    if (!['ACCOUNTANT', 'TEACHER', 'STUDENT'].includes(role)) {
      throw new AuthorizationError('School Admin may only create Accountant, Teacher, or Student accounts');
    }
    // School Admin may only create accounts within their own school, per
    // Multi-Tenancy.md — tenant context always comes from the authenticated user.
    targetSchoolId = actingUser.schoolId;
  } else {
    throw new AuthorizationError();
  }

  const account = await repository.create({
    email,
    passwordHash: null,
    role,
    status: 'MUST_CHANGE_CREDENTIALS',
    schoolId: targetSchoolId,
  });

  await recordAuditEvent({ schoolId: targetSchoolId, userId: actingUser.id, action: 'ACCOUNT_CREATED' });
  return sanitizeAccount(account);
}

// ---------------------------------------------------------------------------
// Login / Logout / Token Refresh
// ---------------------------------------------------------------------------

async function login({ email, password }) {
  const account = await repository.findByEmail(email);

  // Generic message regardless of which check fails, to avoid account
  // enumeration, per Security-Standards.md.
  const genericFailure = () => new AuthenticationError('Invalid email or password');

  if (!account || account.status === 'DEACTIVATED') {
    throw genericFailure();
  }

  // A suspended or closed school immediately blocks login for every user of
  // that school except Super Admin, per School-Management.md Business Rule #5
  // and Authentication-and-Authorization.md Business Rule #15.
  if (account.school && account.school.lifecycleStatus !== 'ACTIVE') {
    throw new AuthenticationError('Your school is not currently active');
  }

  if (account.status === 'LOCKED') {
    if (account.lockedUntil && account.lockedUntil > new Date()) {
      throw new AuthenticationError('Account is temporarily locked. Try again later.');
    }
    // Cool-down has elapsed — auto-unlock before continuing, per Business Rule #17.
    await repository.resetFailedAttempts(account.id);
    account.status = 'ACTIVE';
  }

  if (!account.passwordHash) {
    throw new AuthenticationError(
      'This account has not completed initial setup. Use password recovery to set your password.'
    );
  }

  const passwordMatches = await verifyPassword(password, account.passwordHash);

  if (!passwordMatches) {
    const failedLoginAttempts = account.failedLoginAttempts + 1;
    const shouldLock = failedLoginAttempts >= LOCKOUT_THRESHOLD;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
      : null;

    await repository.recordFailedAttempt(account.id, failedLoginAttempts, lockedUntil);
    await recordAuditEvent({
      schoolId: account.schoolId,
      userId: account.id,
      action: 'FAILED_LOGIN_ATTEMPT',
    });

    if (shouldLock) {
      await recordAuditEvent({ schoolId: account.schoolId, userId: account.id, action: 'ACCOUNT_LOCKED' });
    }

    throw genericFailure();
  }

  await repository.resetFailedAttempts(account.id);

  const tokens = await issueTokenPair(account);

  await recordAuditEvent({ schoolId: account.schoolId, userId: account.id, action: 'SUCCESSFUL_LOGIN' });

  return {
    ...tokens,
    account: sanitizeAccount(account),
    mustChangeCredentials: account.status === 'MUST_CHANGE_CREDENTIALS',
  };
}

async function logout({ refreshToken }) {
  const tokenHash = hashRefreshToken(refreshToken);
  const record = await repository.findRefreshTokenByHash(tokenHash);

  if (record && !record.revokedAt) {
    await repository.revokeRefreshToken(record.id);
    await recordAuditEvent({ userId: record.accountId, action: 'LOGOUT' });
  }
}

async function refreshAccessToken({ refreshToken }) {
  const tokenHash = hashRefreshToken(refreshToken);
  const record = await repository.findRefreshTokenByHash(tokenHash);

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new AuthenticationError('Invalid or expired refresh token');
  }

  const account = await repository.findById(record.accountId);
  if (!account || account.status === 'DEACTIVATED' || account.status === 'LOCKED') {
    throw new AuthenticationError('Account is not active');
  }

  // Rotate the refresh token: revoke the old one, issue a new pair.
  await repository.revokeRefreshToken(record.id);
  const tokens = await issueTokenPair(account);

  return tokens;
}

// ---------------------------------------------------------------------------
// Password recovery and change
// ---------------------------------------------------------------------------

// Also used for the initial-credential-setup case (accounts created by an
// admin with no password yet), reusing the same mechanism per Business Rule #9.
async function requestPasswordReset({ email }) {
  const account = await repository.findByEmail(email);

  // Always behave the same way whether or not the account exists, to avoid
  // account enumeration.
  if (!account || account.status === 'DEACTIVATED') {
    return;
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await repository.createPasswordResetToken({ tokenHash, accountId: account.id, expiresAt });
  await recordAuditEvent({
    schoolId: account.schoolId,
    userId: account.id,
    action: 'PASSWORD_RESET_REQUESTED',
  });

  // NOTE: no email/SMS delivery technology is approved yet (Technology-Decisions.md
  // lists Email/SMS only as possible future integrations). The raw token is
  // logged server-side as a temporary stand-in and is never returned in the
  // API response, since that would leak a live credential-reset token.
  console.log(`[password-reset] token for ${email}: ${rawToken}`);
}

async function confirmPasswordReset({ token, newPassword }) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const record = await repository.findPasswordResetTokenByHash(tokenHash);

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AuthenticationError('Invalid or expired reset token');
  }

  const passwordHash = await hashPassword(newPassword);
  await repository.updatePasswordHash(record.accountId, passwordHash);
  await repository.markPasswordResetTokenUsed(record.id);
  await repository.revokeAllRefreshTokensForAccount(record.accountId);

  await recordAuditEvent({ userId: record.accountId, action: 'PASSWORD_RESET_COMPLETED' });
}

async function changePassword({ accountId, currentPassword, newPassword }) {
  const account = await repository.findById(accountId);

  if (!account.passwordHash || !(await verifyPassword(currentPassword, account.passwordHash))) {
    throw new AuthenticationError('Current password is incorrect');
  }

  const passwordHash = await hashPassword(newPassword);
  await repository.updatePasswordHash(accountId, passwordHash);
  await repository.revokeAllRefreshTokensForAccount(accountId);

  await recordAuditEvent({ schoolId: account.schoolId, userId: accountId, action: 'PASSWORD_CHANGED' });
}

// ---------------------------------------------------------------------------
// Account lifecycle: deactivate / reactivate / unlock / role change
// ---------------------------------------------------------------------------

function assertCanManageAccount(actingUser, targetAccount) {
  if (actingUser.role === 'SUPER_ADMIN') {
    return;
  }
  if (
    actingUser.role === 'SCHOOL_ADMIN' &&
    ['ACCOUNTANT', 'TEACHER', 'STUDENT'].includes(targetAccount.role) &&
    actingUser.schoolId === targetAccount.schoolId
  ) {
    return;
  }
  throw new AuthorizationError();
}

// There is deliberately no way to deactivate the last remaining Super Admin
// account, so the platform is never left with zero administrators.
async function assertNotLastSuperAdmin(targetAccount) {
  if (targetAccount.role !== 'SUPER_ADMIN') {
    return;
  }
  const activeSuperAdmins = await repository.countActiveSuperAdmins();
  if (activeSuperAdmins <= 1) {
    throw new ConflictError('Cannot deactivate or change the role of the last remaining Super Admin account');
  }
}

async function deactivateAccount(accountId, actingUser) {
  const target = await repository.findById(accountId);
  if (!target) {
    throw new AuthenticationError('Account not found');
  }

  assertCanManageAccount(actingUser, target);
  await assertNotLastSuperAdmin(target);

  const updated = await repository.updateStatus(accountId, 'DEACTIVATED');
  await repository.revokeAllRefreshTokensForAccount(accountId);
  await recordAuditEvent({ schoolId: target.schoolId, userId: actingUser.id, action: 'ACCOUNT_DEACTIVATED' });
  return sanitizeAccount(updated);
}

async function reactivateAccount(accountId, actingUser) {
  const target = await repository.findById(accountId);
  if (!target) {
    throw new AuthenticationError('Account not found');
  }

  assertCanManageAccount(actingUser, target);

  const updated = await repository.updateStatus(accountId, 'ACTIVE');
  await recordAuditEvent({ schoolId: target.schoolId, userId: actingUser.id, action: 'ACCOUNT_ACTIVATED' });
  return sanitizeAccount(updated);
}

// Business Rules #17/#18: School Admin unlocks accounts in their own school;
// Super Admin may unlock any account, including a School Admin's.
async function unlockAccount(accountId, actingUser) {
  const target = await repository.findById(accountId);
  if (!target) {
    throw new AuthenticationError('Account not found');
  }

  if (actingUser.role !== 'SUPER_ADMIN') {
    assertCanManageAccount(actingUser, target);
  }

  const updated = await repository.unlockAccount(accountId);
  await recordAuditEvent({ schoolId: target.schoolId, userId: actingUser.id, action: 'ACCOUNT_UNLOCKED' });
  return sanitizeAccount(updated);
}

async function changeRole(accountId, newRole, actingUser) {
  if (accountId === actingUser.id) {
    // Business Rule #7: no user may grant themselves a role or permission
    // they do not already have.
    throw new AuthorizationError('You may not change your own role');
  }

  const target = await repository.findById(accountId);
  if (!target) {
    throw new AuthenticationError('Account not found');
  }

  if (actingUser.role === 'SUPER_ADMIN') {
    if (newRole !== 'SUPER_ADMIN') {
      await assertNotLastSuperAdmin(target);
    }
  } else if (actingUser.role === 'SCHOOL_ADMIN') {
    if (!['ACCOUNTANT', 'TEACHER', 'STUDENT'].includes(newRole)) {
      throw new AuthorizationError('School Admin may only assign Accountant, Teacher, or Student roles');
    }
    assertCanManageAccount(actingUser, target);
  } else {
    throw new AuthorizationError();
  }

  const updated = await repository.updateRole(accountId, newRole);
  await recordAuditEvent({ schoolId: target.schoolId, userId: actingUser.id, action: 'ROLE_CHANGED' });
  return sanitizeAccount(updated);
}

module.exports = {
  bootstrapSuperAdmin,
  createInitialSchoolAdmin,
  createAccount,
  login,
  logout,
  refreshAccessToken,
  requestPasswordReset,
  confirmPasswordReset,
  changePassword,
  deactivateAccount,
  reactivateAccount,
  unlockAccount,
  changeRole,
  sanitizeAccount,
};
