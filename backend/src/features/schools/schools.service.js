const repository = require('./schools.repository');
const { ConflictError, NotFoundError } = require('../../shared/errors');
const { recordAuditEvent } = require('../../shared/audit');
const { OPERATIONAL_PROFILE_FIELDS } = require('./schools.validation');
// Cross-feature calls through single, narrow, public interfaces only, per
// Decision-Making-Principles' Feature Ownership / Loose Coupling principles
// and the Technical Design's Architecture section.
const { createInitialSchoolAdmin } = require('../auth/auth.service');
const schoolScheduleService = require('../school-schedule/school-schedule.service');
const classesService = require('../classes/classes.service');

// Required lazily for the same load-time-cycle reason as timetable.service in
// createSchool below: subjects.service.js itself requires this module for
// hasEducationLevel.
function subjectsService() {
  return require('../subjects/subjects.service');
}

// Best-effort: the school/level change has already been committed and is
// valid on its own, and every Subject can still be assigned by hand — so a
// failure here is logged, never surfaced as a failed school operation.
async function autoAssignSubjectsForLevels(schoolId, levels, actingUser) {
  for (const level of levels) {
    try {
      await subjectsService().assignAllActiveSubjectsOfLevelToSchool(schoolId, level, actingUser);
    } catch (error) {
      console.error(`Auto-assigning ${level} Subjects to school ${schoolId} failed:`, error);
    }
  }
}

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
// (School Schedule Management) Business Rule #3 there: a default School
// Calendar and default "Morning" Shift are created together with every new
// school, atomically with respect to each other but not in a shared cross-
// feature transaction with this school's own row — the same Loose Coupling
// reasoning that already keeps createInitialSchoolAdmin a narrow-interface
// call rather than a shared Prisma transaction. If it fails, the same
// compensating rollback below covers it: SchoolCalendar/Shift's own
// `onDelete: Cascade` relation to School (a narrow, deliberate exception to
// this project's usual RESTRICT convention, since a School is never
// hard-deleted through ordinary operation) means hardDeleteIncompleteSchool
// safely cascades away whichever of the two rows, if any, already
// committed — no separate cleanup call is needed for this feature
// specifically.
async function createSchool({ name, firstSchoolAdminEmail }, actingUser) {
  // Required lazily, inside the function body rather than at module top
  // level: timetable.service.js requires subjects.service.js, which itself
  // requires this very module (schools.service.js) for hasEducationLevel —
  // a top-level require here would create a genuine load-time cycle
  // (schools -> timetable -> subjects -> schools), the same shape of gap
  // already resolved once between classes.service.js and school-schedule.
  // service.js. Requiring lazily here avoids any Node.js module-load
  // ordering fragility between the two circular top-level requires.
  const timetableService = require('../timetable/timetable.service');

  const existing = await repository.findByName(name);
  if (existing) {
    throw new ConflictError('A school with this name already exists');
  }

  const school = await repository.create({ name });

  try {
    await schoolScheduleService.createDefaultScheduleForSchool(school.id, actingUser);
    await timetableService.createDefaultOptimizationSettingsForSchool(school.id);
    // (ACR-009, Architecture Update — Grade/Form) The live equivalent of
    // this feature's own migration backfill — see
    // classesService.createDefaultGradeLevelForSchool's own comment. Passed
    // the school's own first configured Education Level (already in scope
    // here, no new cross-feature call needed).
    await classesService.createDefaultGradeLevelForSchool(school.id, school.educationLevels[0]);
  } catch (error) {
    await repository.hardDeleteIncompleteSchool(school.id);
    throw error;
  }

  // The first School Admin account is created via Authentication &
  // Authorization's own account-creation rules (a generated one-time
  // temporary password the owner must change on first login) — see
  // auth.service.js.
  // Not a true DB transaction across feature boundaries (would require
  // passing a shared Prisma client into Auth's service, against Loose
  // Coupling's narrow-interface principle) — instead, a compensating
  // rollback: if this fails, the School must not be left behind as a
  // permanent, admin-less orphan, per the Validation Rules ("A school cannot
  // be created without its required first School Admin account being
  // created in the same action").
  let initialAdmin;
  try {
    initialAdmin = await createInitialSchoolAdmin({ email: firstSchoolAdminEmail, schoolId: school.id });
  } catch (error) {
    await repository.hardDeleteIncompleteSchool(school.id);
    throw error;
  }

  await recordAuditEvent({
    schoolId: school.id,
    userId: actingUser.id,
    action: 'SCHOOL_CREATED',
  });

  await autoAssignSubjectsForLevels(school.id, school.educationLevels, actingUser);

  // Returned to the creating Super Admin exactly once — never retrievable
  // again; a lost value is recovered only by an administrative password reset.
  return {
    ...school,
    initialSchoolAdmin: {
      email: firstSchoolAdminEmail,
      temporaryPassword: initialAdmin.temporaryPassword,
    },
  };
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

// (ACR-003) Always a full replace on the wire (the client sends the complete
// desired set). Gaining a level auto-assigns that level's Active Subjects;
// dropping one unassigns that level's Subjects — refused as a whole if any of
// them is still in use (e.g. by a Teacher Subject Assignment or a Weekly
// Subject Allocation), so a level is never dropped out from under live data.
async function updateEducationLevels(schoolId, educationLevels, actingUser) {
  const school = await getSchoolOrThrow(schoolId);

  const removedLevels = school.educationLevels.filter((level) => !educationLevels.includes(level));
  const blockers = [];
  for (const level of removedLevels) {
    blockers.push(...(await subjectsService().findLevelRemovalBlockers(schoolId, level)));
  }
  if (blockers.length > 0) {
    throw new ConflictError(
      `Cannot remove Education Level(s) ${removedLevels.join(', ')} — these Subjects are still in use: ${blockers.join('; ')}`
    );
  }

  for (const level of removedLevels) {
    await subjectsService().removeAllSubjectsOfLevelFromSchool(schoolId, level, actingUser);
  }

  const updated = await repository.updateEducationLevels(schoolId, educationLevels);

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'SCHOOL_EDUCATION_LEVELS_CHANGED',
    metadata: { previousLevels: school.educationLevels, newLevels: educationLevels },
  });

  const addedLevels = educationLevels.filter((level) => !school.educationLevels.includes(level));
  await autoAssignSubjectsForLevels(schoolId, addedLevels, actingUser);

  return updated;
}

// --- Narrow public interface for other features (Subject Management) -------
// Per this feature's Technical Design Architecture section: read-only, no
// side effects, the entire surface Subject Management is expected to depend
// on for validating Subject-to-School assignment.

async function hasEducationLevel(schoolId, level) {
  const school = await repository.findById(schoolId);
  return Boolean(school && school.educationLevels.includes(level));
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
  updateEducationLevels,
  getPlatformStatistics,
  getSchoolOrThrow,
  hasEducationLevel,
};
