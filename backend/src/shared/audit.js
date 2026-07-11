const prisma = require('../config/database');

// Standard audit record (Tenant, User, Action, Timestamp) per Multi-Tenancy.md.
// Shared by every feature — never log passwords, tokens, or other sensitive
// data in `metadata`, per Security-Standards.md's Auditability section.
async function recordAuditEvent({ schoolId = null, userId = null, action, metadata = null }) {
  await prisma.auditLog.create({
    data: { schoolId, userId, action, metadata },
  });
}

module.exports = { recordAuditEvent };
