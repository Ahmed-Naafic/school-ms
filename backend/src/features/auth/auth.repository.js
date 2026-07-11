const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.

function findByEmail(email) {
  return prisma.account.findUnique({ where: { email }, include: { school: true } });
}

function findById(id) {
  return prisma.account.findUnique({ where: { id } });
}

function create(data) {
  return prisma.account.create({ data });
}

function countActiveSuperAdmins() {
  return prisma.account.count({
    where: { role: 'SUPER_ADMIN', status: { not: 'DEACTIVATED' } },
  });
}

function updatePasswordHash(id, passwordHash) {
  return prisma.account.update({
    where: { id },
    data: { passwordHash, status: 'ACTIVE', failedLoginAttempts: 0, lockedUntil: null },
  });
}

function updateStatus(id, status) {
  return prisma.account.update({ where: { id }, data: { status } });
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

function createRefreshToken(data) {
  return prisma.refreshToken.create({ data });
}

function findRefreshTokenByHash(tokenHash) {
  return prisma.refreshToken.findUnique({ where: { tokenHash } });
}

function revokeRefreshToken(id) {
  return prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
}

function revokeAllRefreshTokensForAccount(accountId) {
  return prisma.refreshToken.updateMany({
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
  create,
  countActiveSuperAdmins,
  updatePasswordHash,
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
