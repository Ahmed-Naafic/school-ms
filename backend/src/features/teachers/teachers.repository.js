const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.

function findById(id) {
  return prisma.teacher.findUnique({ where: { id } });
}

function findByAccountId(accountId) {
  return prisma.teacher.findUnique({ where: { accountId } });
}

// Paginated roster, per the Technical Design's Performance Considerations —
// a school-wide unfiltered Teacher list is not an acceptable query shape at
// scale.
async function listBySchool({ schoolId, employmentStatus, page, pageSize }) {
  const where = {
    schoolId,
    ...(employmentStatus ? { employmentStatus } : {}),
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

module.exports = {
  findById,
  findByAccountId,
  listBySchool,
  create,
  update,
  updateEmploymentStatus,
};
