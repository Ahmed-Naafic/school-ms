const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.
// Department (WP4) lives in this same module, mirroring Class Management's
// Section — but its full CRUD is added by WP4; findDepartmentById exists
// here already because Onboarding/profile update (WP2) need to validate a
// Teacher's departmentId reference.

function findById(id) {
  return prisma.teacher.findUnique({ where: { id } });
}

function findByAccountId(accountId) {
  return prisma.teacher.findUnique({ where: { accountId } });
}

// Paginated roster, per the Technical Design's Performance Considerations —
// a school-wide unfiltered Teacher list is not an acceptable query shape at
// scale.
async function listBySchool({ schoolId, employmentStatus, departmentId, page, pageSize }) {
  const where = {
    schoolId,
    ...(employmentStatus ? { employmentStatus } : {}),
    ...(departmentId ? { departmentId } : {}),
  };

  const [teachers, total] = await Promise.all([
    prisma.teacher.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.teacher.count({ where }),
  ]);

  return { teachers, total };
}

// tx (a Prisma.TransactionClient), when supplied, enlists this write in a
// transaction the caller owns — Onboarding wraps this and Authentication &
// Authorization's account creation together, so an Account is never
// orphaned if this write fails. Defaults to the module's own client.
function create(data, tx = prisma) {
  return tx.teacher.create({ data });
}

function update(id, data) {
  return prisma.teacher.update({ where: { id }, data });
}

// tx: see create's comment — employment-status transitions wrap this
// together with Authentication & Authorization's activate/deactivate call,
// so a Teacher can never end up in a terminal employmentStatus with its
// account left out of sync (the Completion Review's Critical finding).
function updateEmploymentStatus(id, employmentStatus, tx = prisma) {
  return tx.teacher.update({ where: { id }, data: { employmentStatus } });
}

function findDepartmentById(id) {
  return prisma.department.findUnique({ where: { id } });
}

function findDepartmentByName(schoolId, name) {
  return prisma.department.findUnique({ where: { schoolId_name: { schoolId, name } } });
}

// --- Department (WP4) --------------------------------------------------
// Managed in this same repository — no independent lifecycle apart from the
// Teacher records that reference it, per the Technical Design's Backend
// Design section.

function createDepartment(data) {
  return prisma.department.create({ data });
}

function updateDepartment(id, data) {
  return prisma.department.update({ where: { id }, data });
}

// The only place a Department's status ever changes — archiving is a
// dedicated function, never a field on the general update above, per the
// Technical Design's guard-by-construction fix.
function archiveDepartment(id) {
  return prisma.department.update({ where: { id }, data: { status: 'ARCHIVED' } });
}

// Not paginated — a school's Department list is small and bounded, per the
// Technical Design's Performance Considerations. Excludes ARCHIVED entries
// by default (Business Rule #9); includeArchived returns the full list for
// the management screen.
function listDepartmentsBySchool({ schoolId, includeArchived }) {
  return prisma.department.findMany({
    where: { schoolId, ...(includeArchived ? {} : { status: 'ACTIVE' }) },
    orderBy: { name: 'asc' },
  });
}

module.exports = {
  findById,
  findByAccountId,
  listBySchool,
  create,
  update,
  updateEmploymentStatus,
  findDepartmentById,
  findDepartmentByName,
  createDepartment,
  updateDepartment,
  archiveDepartment,
  listDepartmentsBySchool,
};
