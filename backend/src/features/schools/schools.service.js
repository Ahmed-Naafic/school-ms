const repository = require('./schools.repository');
const { ConflictError, NotFoundError } = require('../../shared/errors');
const { recordAuditEvent } = require('../../shared/audit');
const { OPERATIONAL_PROFILE_FIELDS } = require('./schools.validation');
// Cross-feature call through a single, narrow, public interface only, per
// Decision-Making-Principles' Feature Ownership / Loose Coupling principles
// and the Technical Design's Architecture section.
const { createInitialSchoolAdmin } = require('../auth/auth.service');

async function getSchoolOrThrow(schoolId) {
  const school = await repository.findById(schoolId);
  if (!school) {
    throw new NotFoundError('School not found');
  }
  return school;
}

// School-Management.md Business Rules #1, #2, #16: only Super Admin creates a
// school, and every new school is created together with exactly one initial
// School Admin account, requiring only the school's name and that account's
// email.
async function createSchool({ name, firstSchoolAdminEmail }, actingUser) {
  const existing = await repository.findByName(name);
  if (existing) {
    throw new ConflictError('A school with this name already exists');
  }

  const school = await repository.create({ name });

  // The first School Admin account is created via Authentication &
  // Authorization's own account-creation rules (initial credentials
  // established by the account owner, not this call) — see auth.service.js.
  // Not a true DB transaction across feature boundaries (would require
  // passing a shared Prisma client into Auth's service, against Loose
  // Coupling's narrow-interface principle) — instead, a compensating
  // rollback: if this fails, the School must not be left behind as a
  // permanent, admin-less orphan, per the Validation Rules ("A school cannot
  // be created without its required first School Admin account being
  // created in the same action").
  try {
    await createInitialSchoolAdmin({ email: firstSchoolAdminEmail, schoolId: school.id });
  } catch (error) {
    await repository.hardDeleteIncompleteSchool(school.id);
    throw error;
  }

  await recordAuditEvent({
    schoolId: school.id,
    userId: actingUser.id,
    action: 'SCHOOL_CREATED',
  });

  return school;
}

// Business Rule #14: only Super Admin changes a school's core identifying
// information (the field used for platform-wide uniqueness).
async function updateCoreIdentity(schoolId, name, actingUser) {
  await getSchoolOrThrow(schoolId);

  const existing = await repository.findByName(name);
  if (existing && existing.id !== schoolId) {
    throw new ConflictError('A school with this name already exists');
  }

  const updated = await repository.updateCoreIdentity(schoolId, name);

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SCHOOL_PROFILE_UPDATED' });

  return updated;
}

// Business Rule #14: School Admin may update their own school's operational
// profile information; enforced by the route's assertSameSchool check before
// this is called. The field allow-list is re-applied here (in addition to
// validation) as defense in depth — this service function must never forward
// an arbitrary client-supplied object straight to Prisma, since that model
// also has Super-Admin-only fields (name, lifecycleStatus, subscriptionStatus).
async function updateOperationalProfile(schoolId, fields, actingUser) {
  await getSchoolOrThrow(schoolId);

  const safeFields = {};
  for (const field of OPERATIONAL_PROFILE_FIELDS) {
    if (fields[field] !== undefined) {
      safeFields[field] = fields[field];
    }
  }

  const updated = await repository.updateOperationalProfile(schoolId, safeFields);

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SCHOOL_PROFILE_UPDATED' });

  return updated;
}

// Suspension is idempotent — suspending an already-suspended school has no
// harmful effect, per the Business Specification's Edge Cases.
async function suspendSchool(schoolId, actingUser) {
  const school = await getSchoolOrThrow(schoolId);

  if (school.lifecycleStatus === 'CLOSED') {
    throw new ConflictError('A closed school cannot be suspended; it must be reopened first');
  }

  if (school.lifecycleStatus === 'SUSPENDED') {
    return school;
  }

  const updated = await repository.updateLifecycleStatus(schoolId, 'SUSPENDED');
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SCHOOL_SUSPENDED' });
  return updated;
}

// Reactivate (suspended -> active) is a distinct action from reopen
// (closed -> active), per Business Rule #12.
async function reactivateSchool(schoolId, actingUser) {
  const school = await getSchoolOrThrow(schoolId);

  if (school.lifecycleStatus === 'CLOSED') {
    throw new ConflictError(
      'This school is closed, not suspended. Use the reopen action instead of reactivate.'
    );
  }

  if (school.lifecycleStatus === 'ACTIVE') {
    return school;
  }

  const updated = await repository.updateLifecycleStatus(schoolId, 'ACTIVE');
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SCHOOL_REACTIVATED' });
  return updated;
}

// Closure is permanent and follows the Archive Before Delete principle: the
// record is preserved and marked inactive, never deleted.
async function closeSchool(schoolId, actingUser) {
  const school = await getSchoolOrThrow(schoolId);

  if (school.lifecycleStatus === 'CLOSED') {
    return school;
  }

  const updated = await repository.updateLifecycleStatus(schoolId, 'CLOSED');
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SCHOOL_CLOSED' });
  return updated;
}

// Reopening a closed school is a distinct, deliberate action, per Business
// Rule #12 — not the ordinary reactivate action.
async function reopenSchool(schoolId, actingUser) {
  const school = await getSchoolOrThrow(schoolId);

  if (school.lifecycleStatus !== 'CLOSED') {
    throw new ConflictError('Only a closed school can be reopened');
  }

  const updated = await repository.updateLifecycleStatus(schoolId, 'ACTIVE');
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SCHOOL_REOPENED' });
  return updated;
}

// Business Rule #13: a subscription status change never automatically
// triggers suspension — it is purely informational until billing
// integration is designed.
async function updateSubscriptionStatus(schoolId, subscriptionStatus, actingUser) {
  await getSchoolOrThrow(schoolId);

  const updated = await repository.updateSubscriptionStatus(schoolId, subscriptionStatus);
  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'SCHOOL_SUBSCRIPTION_STATUS_CHANGED',
  });
  return updated;
}

// Business Rule #10: aggregate-only, never exposes one school's data to another.
function getPlatformStatistics() {
  return repository.getPlatformStatistics();
}

function listSchools() {
  return repository.list();
}

module.exports = {
  createSchool,
  listSchools,
  updateCoreIdentity,
  updateOperationalProfile,
  suspendSchool,
  reactivateSchool,
  closeSchool,
  reopenSchool,
  updateSubscriptionStatus,
  getPlatformStatistics,
  getSchoolOrThrow,
};
