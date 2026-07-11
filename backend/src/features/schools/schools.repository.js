const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.

function findById(id) {
  return prisma.school.findUnique({ where: { id } });
}

function findByName(name) {
  return prisma.school.findUnique({ where: { name } });
}

function create(data) {
  return prisma.school.create({ data });
}

function updateCoreIdentity(id, name) {
  return prisma.school.update({ where: { id }, data: { name } });
}

function updateOperationalProfile(id, profileFields) {
  return prisma.school.update({ where: { id }, data: profileFields });
}

function updateLifecycleStatus(id, lifecycleStatus) {
  return prisma.school.update({ where: { id }, data: { lifecycleStatus } });
}

function updateSubscriptionStatus(id, subscriptionStatus) {
  return prisma.school.update({ where: { id }, data: { subscriptionStatus } });
}

// Aggregate-only counts, per Business Rule #10 — never returns per-school data.
async function getPlatformStatistics() {
  const [active, suspended, closed] = await Promise.all([
    prisma.school.count({ where: { lifecycleStatus: 'ACTIVE' } }),
    prisma.school.count({ where: { lifecycleStatus: 'SUSPENDED' } }),
    prisma.school.count({ where: { lifecycleStatus: 'CLOSED' } }),
  ]);

  return {
    totalSchools: active + suspended + closed,
    activeSchools: active,
    suspendedSchools: suspended,
    closedSchools: closed,
  };
}

module.exports = {
  findById,
  findByName,
  create,
  updateCoreIdentity,
  updateOperationalProfile,
  updateLifecycleStatus,
  updateSubscriptionStatus,
  getPlatformStatistics,
};
