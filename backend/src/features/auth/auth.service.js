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
const {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} = require('../../shared/errors');
const { LOCKOUT_THRESHOLD, LOCKOUT_DURATION_MINUTES } = require('../../config/security');
const { PASSWORD_RESET_DELIVERY_MODE } = require('../../config/password-reset');

const PASSWORD_RESET_TOKEN_EXPIRY_HOURS = 1;

// The same shape auth.validation.js's EMAIL_REGEX checks at the HTTP route
// (POST /auth/accounts) — duplicated here, not imported, because this is the
// one place every account-creation path actually passes through, including
// Teacher Management's and Student Management's in-process calls into
// createAccount/createInitialSchoolAdmin, which never reach that route or
// its validation layer at all. Phase 9 code review (Teacher Management)
// finding: those in-process callers had no email-format check anywhere in
// their own call chain — confirmed live (POST /teachers with
// email: "not-an-email" returned 201). Checking it once here closes the gap
// for every current and future caller, not just Teacher Management's own.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertValidEmailFormat(email) {
  if (!EMAIL_REGEX.test(email)) {
    throw new ValidationError('Invalid account request', { email: 'A valid email address is required.' });
  }
}

// Delivers a password-reset/initial-setup token per the configured delivery
// mode. "email"/"sms" are recognized but not yet wired to a real provider
// (Technology-Decisions.md) — selecting either throws loudly rather than
// silently falling back to logging the token, since that would defeat the
// entire point of restricting "development" mode to non-production use.
function deliverPasswordResetToken(email, rawToken) {
  if (PASSWORD_RESET_DELIVERY_MODE === 'development') {
    // Never valid in production — see config/password-reset.js.
    console.log(`[password-reset] token for ${email}: ${rawToken}`);
    return;
  }
  throw new Error(
    `Password reset delivery mode "${PASSWORD_RESET_DELIVERY_MODE}" has no provider integration yet`
  );
}

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
// initial School Admin account. A one-time temporary password is generated
// here and returned to the creating Super Admin exactly once (only its hash
// is stored, it is never logged); the account stays MUST_CHANGE_CREDENTIALS,
// so the School Admin is forced to set their own password on first login.
async function createInitialSchoolAdmin({ email, schoolId }) {
  assertValidEmailFormat(email);

  const existing = await repository.findByEmail(email);
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const temporaryPassword = generateTemporaryPassword();
  const account = await repository.create({
    email,
    passwordHash: await hashPassword(temporaryPassword),
    role: 'SCHOOL_ADMIN',
    status: 'MUST_CHANGE_CREDENTIALS',
    schoolId,
  });

  await recordAuditEvent({ schoolId, userId: account.id, action: 'ACCOUNT_CREATED' });
  return { account: sanitizeAccount(account), temporaryPassword };
}

// General account creation, enforcing the role-creation matrix from
// Authentication-and-Authorization.md's Permissions section:
// - Super Admin creates School Admin or additional Super Admin accounts.
// - School Admin creates Accountant, Teacher, Student within their own school.
//
// tx, when supplied, is a Prisma.TransactionClient the caller owns — e.g.
// Teacher Management's Onboarding wraps this call and its own Teacher-record
// creation in one transaction, so an Account is never created orphaned if
// the Teacher-record write that must follow it fails. Undefined by default;
// every other existing caller (Student Management's admitStudent, etc.) is
// unaffected and keeps its current non-transactional behavior.
async function createAccount({ email, role, schoolId }, actingUser, tx) {
  assertValidEmailFormat(email);

  const existing = await repository.findByEmail(email, tx);
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
    // MANAGER added by ACR-010 (docs/01-architecture/Architecture-Decision-
    // Records/ACR-010-Manager-Role-Introduction.md): School Admin creates a
    // Manager account directly, the same simple shape as Accountant/Student —
    // no employment-lifecycle counterpart to Teacher's own onboarding exists
    // for Manager in this version.
    if (!['ACCOUNTANT', 'TEACHER', 'STUDENT', 'MANAGER'].includes(role)) {
      throw new AuthorizationError('School Admin may only create Accountant, Teacher, Student, or Manager accounts');
    }
    // School Admin may only create accounts within their own school, per
    // Multi-Tenancy.md — tenant context always comes from the authenticated user.
    targetSchoolId = actingUser.schoolId;
  } else {
    throw new AuthorizationError();
  }

  const account = await repository.create(
    {
      email,
      passwordHash: null,
      role,
      status: 'MUST_CHANGE_CREDENTIALS',
      schoolId: targetSchoolId,
    },
    tx
  );

  await recordAuditEvent({ schoolId: targetSchoolId, userId: actingUser.id, action: 'ACCOUNT_CREATED' });
  return sanitizeAccount(account);
}

// School Admin always lists within their own school; Super Admin may list a
// given school's accounts or, with no schoolId, Super Admin accounts
// platform-wide — never an unfiltered dump of every account.
async function listAccounts({ schoolId, role }, actingUser) {
  let effectiveSchoolId = schoolId;
  let effectiveRole = role;

  if (actingUser.role === 'SCHOOL_ADMIN') {
    effectiveSchoolId = actingUser.schoolId;
  } else if (actingUser.role === 'SUPER_ADMIN') {
    if (!schoolId) {
      effectiveRole = 'SUPER_ADMIN';
    }
  } else {
    throw new AuthorizationError();
  }

  const accounts = await repository.list({ schoolId: effectiveSchoolId, role: effectiveRole });
  return accounts.map(sanitizeAccount);
}

// (Attendance Management) Narrow, read-only interface for another feature to
// list this school's own Accounts of specific roles — mirrors
// classesService.getClassById/academicYearsService.getAcademicYearById's own
// "no authorization check of its own; the calling feature's route-level gate
// already applies" contract, the same Stable Public Service Interface
// pattern every other feature already follows. Excludes DEACTIVATED accounts
// only — a locked-out account is still a real staff member whose attendance
// may need recording. Never returns passwordHash (sanitizeAccount strips it).
async function listAccountsByRole(schoolId, roles) {
  const accounts = await repository.list({ schoolId });
  return accounts.filter((a) => roles.includes(a.role) && a.status !== 'DEACTIVATED').map(sanitizeAccount);
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

  // No password has ever been set (MUST_CHANGE_CREDENTIALS) — there is
  // nothing to verify a submitted password against, so this is always a
  // generic failure. Revealing "this account hasn't completed setup" to an
  // unauthenticated caller is the same class of enumeration leak as
  // revealing account existence, per Security-Standards.md.
  if (!account.passwordHash) {
    throw genericFailure();
  }

  // A still-locked account must not reveal that fact to a caller who hasn't
  // proven they know the password — that's an enumeration leak identical in
  // kind to the school-suspension check below. The specific message is only
  // ever thrown after password verification succeeds (see below); a wrong
  // password against a locked account always gets the generic failure, and
  // — deliberately, to avoid indefinitely extending the lockout — does not
  // count as an additional failed attempt while already locked.
  const isStillLocked = account.status === 'LOCKED' && account.lockedUntil && account.lockedUntil > new Date();

  if (account.status === 'LOCKED' && !isStillLocked) {
    // Cool-down has elapsed — auto-unlock before continuing, per Business Rule #17.
    await repository.resetFailedAttempts(account.id);
    await recordAuditEvent({ schoolId: account.schoolId, userId: account.id, action: 'ACCOUNT_UNLOCKED' });
    account.status = 'ACTIVE';
  }

  const passwordMatches = await verifyPassword(password, account.passwordHash);

  if (isStillLocked) {
    if (passwordMatches) {
      throw new AuthenticationError('Account is temporarily locked. Try again later.');
    }
    throw genericFailure();
  }

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
      // Per Security-Standards.md: lockout must revoke the account's refresh
      // tokens immediately, the same as logout/deactivation/role change —
      // not just block new logins — so an old, still-valid refresh token
      // from a prior session can't keep minting access tokens for a locked
      // account.
      await repository.revokeAllRefreshTokensForAccount(account.id);
      await recordAuditEvent({ schoolId: account.schoolId, userId: account.id, action: 'ACCOUNT_LOCKED' });
    }

    throw genericFailure();
  }

  // A suspended or closed school immediately blocks login for every user of
  // that school except Super Admin, per School-Management.md Business Rule #5
  // and Authentication-and-Authorization.md Business Rule #15. Checked only
  // after password verification succeeds — this message is more specific than
  // `genericFailure()`, so revealing it pre-authentication would let anyone
  // who merely knows or guesses a valid email (no password needed) learn
  // that account exists and that its school has been suspended/closed, per
  // Security-Standards.md's anti-enumeration principle (the same principle
  // this function already applies to the account-existence check above).
  if (account.school && account.school.lifecycleStatus !== 'ACTIVE') {
    throw new AuthenticationError('Your school is not currently active');
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

async function logout({ refreshToken }, actingUser) {
  const tokenHash = hashRefreshToken(refreshToken);
  const record = await repository.findRefreshTokenByHash(tokenHash);

  // The route requires authentication, so verify the presented refresh
  // token actually belongs to the caller — otherwise `authenticate` is
  // meaningless dead weight on this route, and a client could revoke a
  // session it doesn't own just by possessing the raw token value.
  if (record && !record.revokedAt && record.accountId === actingUser.id) {
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

  const account = await repository.findByIdWithSchool(record.accountId);
  if (!account || account.status === 'DEACTIVATED' || account.status === 'LOCKED') {
    throw new AuthenticationError('Account is not active');
  }
  // Consistent with login's Business Rule #15 check — a suspended/closed
  // school must also block refresh, not just new logins, so an old refresh
  // token can't keep minting access tokens after the school is suspended.
  if (account.school && account.school.lifecycleStatus !== 'ACTIVE') {
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
  // A platform-wide state, not account-specific — safe to reveal to anyone
  // regardless of whether the email exists, unlike the account-existence
  // check below.
  if (PASSWORD_RESET_DELIVERY_MODE === 'disabled') {
    throw new ConflictError('Password recovery is currently unavailable. Contact your administrator.');
  }

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

  // Never returned in the API response, since that would leak a live
  // credential-reset token — delivered only per the configured mode.
  deliverPasswordResetToken(email, rawToken);
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

// Super Admin's authority is scoped to School Admin and other Super Admin
// accounts only — mirroring createAccount's own role-creation matrix — never
// Teacher/Accountant/Student accounts directly. The Permissions section is
// explicit: Super Admin "may not directly manage individual Teacher,
// Student, or Accountant accounts within a school... may not perform
// day-to-day authorization actions inside a school's own operations."
// Restoring a locked-out/deactivated School Admin (Business Rule #18) is the
// specific, narrow exception this function grants Super Admin — not a
// general override.
//
// Phase 9 code review (Teacher Management) finding: a School Admin targeting
// a real account of a manageable role (Teacher/Accountant/Student) in a
// *different* school used to get a 403 here — a different status code than
// the 404 a genuinely nonexistent account gets — letting the response alone
// confirm an account exists somewhere on the platform outside the caller's
// own tenant. This is the same tenant-isolation rule every other
// tenant-scoped resource in this codebase already follows (404, never 403,
// for cross-tenant access — see Multi-Tenancy.md). A role-scope mismatch
// (Super Admin targeting a non-admin role, or School Admin targeting an
// Admin role) is a different kind of denial — it isn't a tenant leak, since
// neither actor is tenant-bound in the way that matters here — so it stays
// a 403, unchanged.
function assertCanManageAccount(actingUser, targetAccount) {
  if (actingUser.role === 'SUPER_ADMIN' && ['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(targetAccount.role)) {
    return;
  }
  // MANAGER added by ACR-010 — School Admin creates/deactivates/reactivates
  // Manager accounts within their own school, the same scope as Accountant/
  // Teacher/Student (Attendance-Management.md's Actors > Manager section).
  if (
    actingUser.role === 'SCHOOL_ADMIN' &&
    ['ACCOUNTANT', 'TEACHER', 'STUDENT', 'MANAGER'].includes(targetAccount.role)
  ) {
    if (actingUser.schoolId !== targetAccount.schoolId) {
      throw new NotFoundError('Account not found');
    }
    return;
  }
  throw new AuthorizationError();
}

// There is deliberately no way to deactivate the last remaining Super Admin
// account, so the platform is never left with zero administrators.
async function assertNotLastSuperAdmin(targetAccount, tx) {
  if (targetAccount.role !== 'SUPER_ADMIN') {
    return;
  }
  const activeSuperAdmins = await repository.countActiveSuperAdmins(tx);
  if (activeSuperAdmins <= 1) {
    throw new ConflictError('Cannot deactivate or change the role of the last remaining Super Admin account');
  }
}

// ACR-001 (docs/01-architecture/Architecture-Decision-Records/ACR-001-Employment-vs-Authentication-Ownership.md),
// Business Rule #25: ordinary activation/deactivation of a Teacher account
// is driven by Teacher Management's own employment-lifecycle events
// (context.source === 'teacher_management') and never requires a reason —
// Teacher Management's own audit trail already records what triggered it.
// A direct call to this endpoint (context.source === 'authentication_override',
// set only by this feature's own controller) is an administrative/security
// override and requires one, but only for a Teacher target — this feature
// deliberately has no opinion about any other role. This is the only place
// in this feature that is aware of ACR-001 at all; nothing here ever reads
// or writes Teacher Management's own `employmentStatus` field.
function assertOverrideReasonProvided(context, target) {
  if (context.source === 'authentication_override' && target.role === 'TEACHER' && !context.reason) {
    throw new ValidationError('A reason is required to directly override a Teacher account.', {
      reason: 'Reason is required when overriding a Teacher account.',
    });
  }
}

// context defaults to the override shape: an unidentified caller (i.e., not
// Teacher Management's own internal call, which always passes its own
// context explicitly) is treated as the override path, never silently as
// the trusted internal one — the safe default, per the Technical Design.
//
// tx, when supplied, lets Teacher Management wrap this call and its own
// employmentStatus write in one transaction — a Completion Review finding:
// without it, a Teacher could end up with a terminal employmentStatus
// (e.g. TERMINATED) while the account stayed enabled, if this call failed
// after the status was already persisted. Undefined by default; the
// School-Admin-invoked override endpoint (auth.controller.js) never passes
// one, since it has no second write to keep in sync.
async function deactivateAccount(
  accountId,
  actingUser,
  context = { source: 'authentication_override', reason: null },
  tx
) {
  const target = await repository.findById(accountId, tx);
  if (!target) {
    throw new NotFoundError('Account not found');
  }

  assertCanManageAccount(actingUser, target);
  assertOverrideReasonProvided(context, target);
  await assertNotLastSuperAdmin(target, tx);

  // Preserves an already-active override marker even when this particular
  // call is Teacher Management's own (e.g. `resign` reached while the
  // account was already override-deactivated for an unrelated reason) — a
  // routine disable must never silently downgrade an existing override to
  // "not an override," which would wrongly unblock a later rehire.
  const deactivatedByOverride = context.source === 'authentication_override' || Boolean(target.deactivatedByOverride);

  const updated = await repository.updateStatus(accountId, 'DEACTIVATED', tx, { deactivatedByOverride });
  await repository.revokeAllRefreshTokensForAccount(accountId, tx);
  await recordAuditEvent({
    schoolId: target.schoolId,
    userId: actingUser.id,
    action: 'ACCOUNT_DEACTIVATED',
    metadata: context.reason ? { reason: context.reason } : null,
  });
  return sanitizeAccount(updated);
}

// Phase 9 code review (Teacher Management) finding: an owning feature's own
// routine reactivating transition (e.g. Return from Leave, Rehire) used to
// unconditionally re-enable the account, even when its current DEACTIVATED
// status came from a deliberate, reason-recorded administrative/security
// override (e.g. a Teacher account disabled mid-investigation) rather than
// from that feature's own last sync — silently undoing a security lockdown
// as a side effect of an unrelated HR action. A call carrying the override
// source is always the deliberate, explicit lift and is allowed regardless;
// any other source is refused while the override is still in effect.
function assertNotBlockedByActiveOverride(context, target) {
  if (context.source !== 'authentication_override' && target.deactivatedByOverride) {
    throw new ConflictError(
      'This account was deactivated via an administrative/security override and cannot be re-enabled by a routine action. Reactivate it directly through the override endpoint first.'
    );
  }
}

// tx: see deactivateAccount's comment — same reasoning applies symmetrically
// to Return from Leave / Rehire.
async function reactivateAccount(
  accountId,
  actingUser,
  context = { source: 'authentication_override', reason: null },
  tx
) {
  const target = await repository.findById(accountId, tx);
  if (!target) {
    throw new NotFoundError('Account not found');
  }

  assertCanManageAccount(actingUser, target);
  assertOverrideReasonProvided(context, target);
  assertNotBlockedByActiveOverride(context, target);

  const updated = await repository.updateStatus(accountId, 'ACTIVE', tx, { deactivatedByOverride: false });
  await recordAuditEvent({
    schoolId: target.schoolId,
    userId: actingUser.id,
    action: 'ACCOUNT_ACTIVATED',
    metadata: context.reason ? { reason: context.reason } : null,
  });
  return sanitizeAccount(updated);
}

// Business Rules #17/#18: School Admin unlocks Teacher/Accountant/Student
// accounts in their own school; Super Admin unlocks School Admin (and other
// Super Admin) accounts — the same scope assertCanManageAccount enforces
// everywhere else, applied consistently here too.
async function unlockAccount(accountId, actingUser) {
  const target = await repository.findById(accountId);
  if (!target) {
    throw new NotFoundError('Account not found');
  }

  assertCanManageAccount(actingUser, target);

  const updated = await repository.unlockAccount(accountId);
  await recordAuditEvent({ schoolId: target.schoolId, userId: actingUser.id, action: 'ACCOUNT_UNLOCKED' });
  return sanitizeAccount(updated);
}

// Business Rules #29-30 (ACR-011): School Admin may directly invalidate a
// Teacher/Manager/Accountant account's current password within their own
// school. Deliberately narrower than assertCanManageAccount's own
// create/deactivate/reactivate scope (which also covers Student and is
// reused, unmodified, by those actions) — Student is never a valid target
// here, per the Product Owner's explicit approved scope. Only SCHOOL_ADMIN
// may call this; SUPER_ADMIN gains no new authority through this function,
// and no role may reset another account of the same or a different
// school-staff role — this is the only branch in this function, full stop.
const ADMINISTRATIVE_PASSWORD_RESET_TARGET_ROLES = ['TEACHER', 'MANAGER', 'ACCOUNTANT'];

// ACR-012: guarantees this project's own password-strength rule
// (isStrongPassword in auth.validation.js: >=8 chars, at least one letter,
// at least one digit) BY CONSTRUCTION, rather than hoping a purely random
// string happens to satisfy it. Ambiguous-looking characters (0/O, 1/l/I)
// are excluded since this value is meant to be read and relayed by a human,
// not copy-pasted from a link.
const TEMP_PASSWORD_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const TEMP_PASSWORD_DIGITS = '23456789';
const TEMP_PASSWORD_LENGTH = 12;

function randomIndex(max) {
  return crypto.randomBytes(1)[0] % max;
}

function generateTemporaryPassword() {
  const all = TEMP_PASSWORD_LETTERS + TEMP_PASSWORD_DIGITS;
  const chars = [
    TEMP_PASSWORD_LETTERS[randomIndex(TEMP_PASSWORD_LETTERS.length)],
    TEMP_PASSWORD_DIGITS[randomIndex(TEMP_PASSWORD_DIGITS.length)],
  ];
  while (chars.length < TEMP_PASSWORD_LENGTH) {
    chars.push(all[randomIndex(all.length)]);
  }
  // Fisher-Yates shuffle — the two guaranteed characters above must not
  // always land in positions 0/1.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function resetPasswordAdministratively(accountId, actingUser) {
  if (!['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(actingUser.role)) {
    throw new AuthorizationError();
  }

  const target = await repository.findById(accountId);
  if (!target) {
    throw new NotFoundError('Account not found');
  }

  // Super Admin may reset a School Admin's password only — never school
  // staff (Teacher/Manager/Accountant stay School Admin's authority, ACR-011)
  // and never another Super Admin.
  const isSuperAdminResettingSchoolAdmin = actingUser.role === 'SUPER_ADMIN';
  if (isSuperAdminResettingSchoolAdmin) {
    if (target.role !== 'SCHOOL_ADMIN') {
      throw new AuthorizationError();
    }
  } else {
    // Role-scope mismatch (e.g. targeting a Student or another School Admin)
    // is a 403, not a tenant leak — same distinction assertCanManageAccount's
    // own comment already draws between the two failure kinds.
    if (!ADMINISTRATIVE_PASSWORD_RESET_TARGET_ROLES.includes(target.role)) {
      throw new AuthorizationError();
    }
    // Cross-school is a 404, never a 403, so the response never confirms an
    // account exists outside the caller's own tenant (Multi-Tenancy.md's API
    // Rules — the same protection assertCanManageAccount already applies).
    if (actingUser.schoolId !== target.schoolId) {
      throw new NotFoundError('Account not found');
    }
  }

  // A Super Admin reset of a School Admin always generates a temporary
  // password, the same as initial School Admin creation. For School Admin
  // resetting staff, ACR-012 still applies: only in `development` mode — an
  // environment with no real delivery channel at all — does this action
  // generate a real credential. Every other mode keeps ACR-011's original
  // invalidate-only behavior (passwordHash stays null; Business Rule #8
  // applies without exception), per Business Rule #30 as amended by ACR-012.
  let temporaryPassword = null;
  let passwordHash = null;
  if (isSuperAdminResettingSchoolAdmin || PASSWORD_RESET_DELIVERY_MODE === 'development') {
    temporaryPassword = generateTemporaryPassword();
    passwordHash = await hashPassword(temporaryPassword);
  }

  const updated = await repository.resetPasswordAdministratively(accountId, passwordHash);
  // Per Security-Standards.md: an immediate credential invalidation must
  // also revoke any session issued under the old credential — the same
  // reasoning changeRole's own role-change revocation already follows.
  await repository.revokeAllRefreshTokensForAccount(accountId);

  // Never includes temporaryPassword — the audit trail records only that a
  // reset occurred and who performed it, per Business Rule #30 (unchanged
  // by ACR-012: the one-time value is returned to the caller below, never
  // logged anywhere).
  await recordAuditEvent({
    schoolId: target.schoolId,
    userId: actingUser.id,
    action: 'ADMINISTRATIVE_PASSWORD_RESET',
    metadata: { targetAccountId: accountId },
  });

  return { account: sanitizeAccount(updated), temporaryPassword };
}

async function changeRole(accountId, newRole, actingUser) {
  if (accountId === actingUser.id) {
    // Business Rule #7: no user may grant themselves a role or permission
    // they do not already have.
    throw new AuthorizationError('You may not change your own role');
  }

  const target = await repository.findById(accountId);
  if (!target) {
    throw new NotFoundError('Account not found');
  }

  // Granting or removing Super Admin status is only ever done through
  // createAccount's dedicated flow — "the only in-application way a new
  // Super Admin account is created," per the Permissions section — never as
  // a side effect of reassigning an existing account's role. This also
  // sidesteps a real data-integrity problem: Super Admin is the one role
  // with schoolId always null, while every other role requires exactly one
  // school (Business Rule #2); changeRole never touches schoolId, so
  // allowing SUPER_ADMIN as a source or target here would silently produce
  // an inconsistent row (a Super Admin with a leftover schoolId, or a
  // school-scoped role with schoolId still null).
  if (newRole === 'SUPER_ADMIN' || target.role === 'SUPER_ADMIN') {
    throw new AuthorizationError('Super Admin status can only be granted through account creation, not a role change');
  }

  if (actingUser.role === 'SCHOOL_ADMIN') {
    // Deliberately NOT extended to MANAGER: ACR-010 approves School Admin
    // creating, deactivating, and reactivating a Manager account directly —
    // it says nothing about converting an existing account's role into or
    // out of MANAGER, so this function's scope is left unchanged rather than
    // assuming that extension. A Manager account is always created directly
    // as MANAGER via createAccount, never produced by a role change.
    if (!['ACCOUNTANT', 'TEACHER', 'STUDENT'].includes(newRole)) {
      throw new AuthorizationError('School Admin may only assign Accountant, Teacher, or Student roles');
    }
    assertCanManageAccount(actingUser, target);
  } else if (actingUser.role !== 'SUPER_ADMIN') {
    throw new AuthorizationError();
  }

  const updated = await repository.updateRole(accountId, newRole);
  // Per Security-Standards.md: a role change must revoke existing refresh
  // tokens immediately, so a session started under the old role can't keep
  // renewing access tokens that no longer reflect current permissions.
  await repository.revokeAllRefreshTokensForAccount(accountId);
  await recordAuditEvent({ schoolId: target.schoolId, userId: actingUser.id, action: 'ROLE_CHANGED' });
  return sanitizeAccount(updated);
}

module.exports = {
  bootstrapSuperAdmin,
  createInitialSchoolAdmin,
  createAccount,
  listAccounts,
  listAccountsByRole,
  login,
  logout,
  refreshAccessToken,
  requestPasswordReset,
  confirmPasswordReset,
  changePassword,
  deactivateAccount,
  reactivateAccount,
  unlockAccount,
  resetPasswordAdministratively,
  changeRole,
  sanitizeAccount,
};
