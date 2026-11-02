const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.

// tx (a Prisma.TransactionClient), when supplied, lets a caller enlist this
// read/write in a cross-feature transaction it owns — e.g. Teacher
// Management wrapping account creation and Teacher-record creation so both
// succeed or fail together. Defaults to the module's own client, so every
// existing caller that doesn't pass tx is unaffected.
function findByEmail(email, tx = prisma) {
  return tx.account.findUnique({ where: { email }, include: { school: true } });
}

function findById(id, tx = prisma) {
  return tx.account.findUnique({ where: { id } });
}

// Used only by refreshAccessToken, which — like login — must re-check the
// account's school lifecycle status (Business Rule #15), not just its own
// status.
function findByIdWithSchool(id) {
  return prisma.account.findUnique({ where: { id }, include: { school: true } });
}

function create(data, tx = prisma) {
  return tx.account.create({ data });
}

// Supports the account-management screen: School Admin lists their own
// school's accounts; Super Admin lists by school or lists Super Admin
// accounts platform-wide. Never a global, unfiltered dump of every account.
function list({ schoolId, role }) {
  return prisma.account.findMany({
    where: {
      ...(schoolId ? { schoolId } : {}),
      ...(role ? { role } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}

function countActiveSuperAdmins(tx = prisma) {
  return tx.account.count({
    where: { role: 'SUPER_ADMIN', status: { not: 'DEACTIVATED' } },
  });
}

function updatePasswordHash(id, passwordHash) {
  return prisma.account.update({
    where: { id },
    data: { passwordHash, status: 'ACTIVE', failedLoginAttempts: 0, lockedUntil: null },
  });
}

// extra: additional columns to set alongside status in the same write — used
// by deactivateAccount/reactivateAccount to also set/clear
// deactivatedByOverride, so the override-tracking write is never a separate,
// non-atomic step (Phase 9 code review, Teacher Management).
function updateStatus(id, status, tx = prisma, extra = {}) {
  return tx.account.update({ where: { id }, data: { status, ...extra } });
}

function updateRole(id, role) {
  return prisma.account.update({ where: { id }, data: { role } });
}

function recordFailedAttempt(id, failedLoginAttempts, lockedUntil) {
  return prisma.account.update({
    where: { id },
    data: { failedLoginAttempts, lockedUntil, status: lockedUntil ? 'LOCKED' : undefined },
  });
}

function resetFailedAttempts(id) {
  return prisma.account.update({
    where: { id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
}

function unlockAccount(id) {
  return prisma.account.update({
    where: { id },
    data: { status: 'ACTIVE', failedLoginAttempts: 0, lockedUntil: null },
  });
}

// Business Rule #30 (ACR-011, amended by ACR-012): invalidates the account
// exactly the way a freshly created account starts out (status
// MUST_CHANGE_CREDENTIALS — see `create` above/createAccount in
// auth.service.js). passwordHash defaults to null (ACR-011's original
// invalidate-only behavior — the account owner re-establishes their own
// password via Forgotten Password Recovery); the caller passes an
// already-hashed value only in development mode (ACR-012), never a
// plaintext one — this function itself never sees or handles plaintext.
function resetPasswordAdministratively(id, passwordHash = null) {
  return prisma.account.update({
    where: { id },
    data: { passwordHash, status: 'MUST_CHANGE_CREDENTIALS', failedLoginAttempts: 0, lockedUntil: null },
  });
}

function createRefreshToken(data) {
  return prisma.refreshToken.create({ data });
}

function findRefreshTokenByHash(tokenHash) {
  return prisma.refreshToken.findUnique({ where: { tokenHash } });
}

function revokeRefreshToken(id) {
  return prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
}

function revokeAllRefreshTokensForAccount(accountId, tx = prisma) {
  return tx.refreshToken.updateMany({
    where: { accountId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

function createPasswordResetToken(data) {
  return prisma.passwordResetToken.create({ data });
}

function findPasswordResetTokenByHash(tokenHash) {
  return prisma.passwordResetToken.findUnique({ where: { tokenHash } });
}

function markPasswordResetTokenUsed(id) {
  return prisma.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } });
}

module.exports = {
  findByEmail,
  findById,
  findByIdWithSchool,
  create,
  list,
  countActiveSuperAdmins,
  updatePasswordHash,
  resetPasswordAdministratively,
  updateStatus,
  updateRole,
  recordFailedAttempt,
  resetFailedAttempts,
  unlockAccount,
  createRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshToken,
  revokeAllRefreshTokensForAccount,
  createPasswordResetToken,
  findPasswordResetTokenByHash,
  markPasswordResetTokenUsed,
};
