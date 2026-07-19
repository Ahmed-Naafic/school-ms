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

// Only ever called by createSchool's own rollback path, when the mandatory
// first School Admin account fails to be created after the School row was
// already committed — never a general-purpose delete. This is cleanup of a
// creation that never actually completed, not removal of a real, existing
// tenant, so it does not conflict with Archive Before Delete (which governs
// the latter).
function hardDeleteIncompleteSchool(id) {
  return prisma.school.delete({ where: { id } });
}

// Super Admin's school-management screen needs a list to act on — Business
// Rule #10 only restricts aggregate statistics, not the list of schools
// itself, which is inherently a Super Admin (platform-level) view.
function list() {
  return prisma.school.findMany({ orderBy: { createdAt: 'desc' } });
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
  hardDeleteIncompleteSchool,
  list,
  updateCoreIdentity,
  updateOperationalProfile,
  updateLifecycleStatus,
  updateSubscriptionStatus,
  getPlatformStatistics,
};
